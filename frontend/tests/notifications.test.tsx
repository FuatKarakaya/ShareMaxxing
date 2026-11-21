import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../src/App'
import { clearStudentSession, signIn } from '../src/features/content/session'

type TestNotification = {
  id: string
  recipientId: string
  kind: string
  text: string
  link: string | null
  isRead: boolean
  readAt: string | null
  createdAt: string
}

const seedNotifications: TestNotification[] = [
  {
    id: 'notif-1',
    recipientId: 'me',
    kind: 'FORUM_REPLY',
    text: 'Sorunuza yeni bir yanıt geldi.',
    link: '/askida-bilet',
    isRead: false,
    readAt: null,
    createdAt: '2026-11-21T12:00:00.000Z',
  },
  {
    id: 'notif-2',
    recipientId: 'me',
    kind: 'BOOKING',
    text: 'Yolculuğunuz için yeni bir rezervasyon var.',
    link: null,
    isRead: false,
    readAt: null,
    createdAt: '2026-11-21T11:00:00.000Z',
  },
]

let items: TestNotification[] = []
let failFetch = false
let calls: Array<{ path: string; method: string; headers: Headers }> = []

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(async () => {
  clearStudentSession()
  items = seedNotifications.map((item) => ({ ...item }))
  failFetch = false
  calls = []

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    calls.push({ path: url.pathname, method, headers: new Headers(init?.headers) })

    if (url.pathname === '/api/auth/login') {
      return json({ accessToken: 'test-token', user: { id: 'me', displayName: 'Ege', role: 'USER' } })
    }
    if (url.pathname === '/api/notifications' && method === 'GET') {
      if (failFetch) {
        return json({ error: { code: 'TEMPORARY', message: 'Bildirim servisi şu an yanıt vermiyor.' } }, 503)
      }
      const unreadCount = items.filter((item) => !item.isRead).length
      return json({ notifications: items, unreadCount, page: 1, hasMore: false })
    }
    if (url.pathname === '/api/notifications/read-all' && method === 'POST') {
      const updatedCount = items.filter((item) => !item.isRead).length
      items = items.map((item) => ({ ...item, isRead: true, readAt: item.readAt ?? '2026-11-21T12:30:00.000Z' }))
      return json({ updatedCount, unreadCount: 0 })
    }
    const readMatch = url.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/)
    if (readMatch && method === 'POST') {
      items = items.map((item) =>
        item.id === readMatch[1] ? { ...item, isRead: true, readAt: '2026-11-21T12:25:00.000Z' } : item,
      )
      const notification = items.find((item) => item.id === readMatch[1])
      const unreadCount = items.filter((item) => !item.isRead).length
      return json({ notification, unreadCount })
    }
    return json({ error: { code: 'NOT_FOUND', message: 'Bulunamadı.' } }, 404)
  })

  await signIn('student@itu.edu.tr', 'test-password')
})

afterEach(() => {
  cleanup()
  clearStudentSession()
  vi.restoreAllMocks()
})

function open(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

test('hides bell when logged out and shows unread count badge on home when signed in', async () => {
  clearStudentSession()
  open('/')
  expect(screen.queryByRole('button', { name: 'Bildirimler' })).not.toBeInTheDocument()
  cleanup()

  await signIn('student@itu.edu.tr', 'test-password')
  open('/')
  expect(await screen.findByLabelText('2 okunmamış bildirim')).toHaveTextContent('2')
  const notifCall = calls.find((call) => call.path === '/api/notifications' && call.method === 'GET')
  expect(notifCall?.headers.get('Authorization')).toBe('Bearer test-token')
})

test('opens notification list, renders text safely, and navigates via internal link', async () => {
  items[0] = { ...items[0], text: '<script>alert(1)</script>' }
  const user = userEvent.setup()
  open('/')

  await screen.findByLabelText('2 okunmamış bildirim')
  await user.click(screen.getByRole('button', { name: 'Bildirimler' }))

  const panel = await screen.findByRole('region', { name: 'Bildirim listesi' })
  expect(within(panel).getByText('<script>alert(1)</script>')).toBeInTheDocument()
  expect(within(panel).getByText('Yolculuğunuz için yeni bir rezervasyon var.')).toBeInTheDocument()
  expect(document.querySelector('script')).toBeNull()

  await user.click(within(panel).getByRole('link', { name: 'İlgili sayfaya git' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Askıda bilet' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Bildirim listesi' })).not.toBeInTheDocument()
})

test('marks a single notification as read and decreases unread count', async () => {
  const user = userEvent.setup()
  open('/')

  await screen.findByLabelText('2 okunmamış bildirim')
  await user.click(screen.getByRole('button', { name: 'Bildirimler' }))
  const panel = await screen.findByRole('region', { name: 'Bildirim listesi' })

  const readButtons = await within(panel).findAllByRole('button', { name: 'Okundu işaretle' })
  await user.click(readButtons[0])

  expect(await screen.findByLabelText('1 okunmamış bildirim')).toHaveTextContent('1')
  expect(within(panel).getAllByRole('button', { name: 'Okundu işaretle' })).toHaveLength(1)
})

test('marks all notifications as read and hides unread badge', async () => {
  const user = userEvent.setup()
  open('/')

  await screen.findByLabelText('2 okunmamış bildirim')
  await user.click(screen.getByRole('button', { name: 'Bildirimler' }))
  const panel = await screen.findByRole('region', { name: 'Bildirim listesi' })

  await user.click(within(panel).getByRole('button', { name: 'Tümünü okundu işaretle' }))

  expect(screen.queryByLabelText(/okunmamış bildirim/)).not.toBeInTheDocument()
  expect(within(panel).queryByRole('button', { name: 'Okundu işaretle' })).not.toBeInTheDocument()
})

test('shows empty state when user has no notifications', async () => {
  items = []
  const user = userEvent.setup()
  open('/')

  await user.click(await screen.findByRole('button', { name: 'Bildirimler' }))
  const panel = await screen.findByRole('region', { name: 'Bildirim listesi' })
  expect(await within(panel).findByText('Henüz bildiriminiz yok.')).toBeInTheDocument()
})

test('handles API loading failure inside panel and recovers with retry', async () => {
  failFetch = true
  const user = userEvent.setup()
  open('/')

  await user.click(await screen.findByRole('button', { name: 'Bildirimler' }))
  const panel = await screen.findByRole('region', { name: 'Bildirim listesi' })
  expect(await within(panel).findByText('Bildirim servisi şu an yanıt vermiyor.')).toBeInTheDocument()

  failFetch = false
  await user.click(within(panel).getByRole('button', { name: 'Tekrar dene' }))
  expect(await within(panel).findByText('Sorunuza yeni bir yanıt geldi.')).toBeInTheDocument()
})
