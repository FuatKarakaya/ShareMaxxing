import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../src/App'
import { clearStudentSession, signIn } from '../src/features/content/session'

const cities = [
  { code: 6, name: 'Ankara' },
  { code: 34, name: 'İstanbul' },
  { code: 35, name: 'İzmir' },
]

const baseTrip: {
  id: string
  status: 'PUBLISHED' | 'CANCELLED' | 'COMPLETED'
  departureAt: string
  seatCapacity: number
  occupiedSeats: number
  freeSeats: number
  isFull: boolean
  priceMinor: number
  description: string | null
  contactDetails: string | null
  originCity: { code: number; name: string }
  destinationCity: { code: number; name: string }
  driver: { id: string; displayName: string }
} = {
  id: 'trip-1',
  status: 'PUBLISHED',
  departureAt: '2026-12-20T14:30:00.000Z',
  seatCapacity: 3,
  occupiedSeats: 1,
  freeSeats: 2,
  isFull: false,
  priceMinor: 40000,
  description: 'Maslak kampüsten çıkış.',
  contactDetails: '0555 000 00 00',
  originCity: { code: 34, name: 'İstanbul' },
  destinationCity: { code: 6, name: 'Ankara' },
  driver: { id: 'me', displayName: 'Ege' },
}

let trip = { ...baseTrip }
let failedMine = false
let calls: Array<{ path: string; method: string; body: Record<string, unknown>; headers: Headers }> = []

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(async () => {
  clearStudentSession()
  trip = { ...baseTrip }
  failedMine = false
  calls = []

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    calls.push({ path: `${url.pathname}${url.search}`, method, body, headers: new Headers(init?.headers) })

    if (url.pathname === '/api/auth/login') {
      return json({ accessToken: 'test-token', user: { id: 'me', displayName: 'Ege', role: 'USER' } })
    }
    if (url.pathname === '/api/cities') {
      return json({ cities })
    }
    if (url.pathname === '/api/trips/mine') {
      if (failedMine) {
        return json({ error: { code: 'TEMPORARY', message: 'Yolculuklar yüklenemedi.' } }, 503)
      }
      return json({ trips: [trip] })
    }
    if (url.pathname === '/api/trips' && method === 'POST') {
      const originCity = cities.find((c) => c.code === body.originCityCode) ?? trip.originCity
      const destinationCity = cities.find((c) => c.code === body.destinationCityCode) ?? trip.destinationCity
      trip = {
        ...trip,
        originCity,
        destinationCity,
        departureAt: String(body.departureAt),
        seatCapacity: Number(body.seatCapacity),
        freeSeats: Number(body.seatCapacity),
        priceMinor: Number(body.priceMinor),
        description: (body.description as string | null) ?? null,
        contactDetails: (body.contactDetails as string | null) ?? null,
      }
      return json({ trip }, 201)
    }
    if (url.pathname === '/api/trips/trip-1' && method === 'GET') {
      return json({ trip })
    }
    if (url.pathname === '/api/trips/trip-1' && method === 'PATCH') {
      trip = {
        ...trip,
        seatCapacity: body.seatCapacity !== undefined ? Number(body.seatCapacity) : trip.seatCapacity,
        description: body.description !== undefined ? (body.description as string | null) : trip.description,
        contactDetails: body.contactDetails !== undefined ? (body.contactDetails as string | null) : trip.contactDetails,
      }
      return json({ trip })
    }
    if (url.pathname === '/api/trips/trip-1/cancel' && method === 'POST') {
      trip = { ...trip, status: 'CANCELLED' as unknown as typeof trip.status }
      return json({ trip })
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

function open(path = '/yolculuklar/benim') {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

test('publishes a valid trip and returns to my trips list', async () => {
  const user = userEvent.setup()
  open('/yolculuklar/yeni')
  await screen.findAllByRole('option', { name: 'Ankara' })

  await user.selectOptions(screen.getByLabelText(/^Başlangıç şehri/), '34')
  await user.selectOptions(screen.getByLabelText(/^Varış şehri/), '35')
  await user.type(screen.getByLabelText(/^Kalkış tarihi/), '2026-12-25')
  await user.type(screen.getByLabelText(/^Kalkış saati/), '09:30')
  const seats = screen.getByLabelText(/^Boş koltuk kapasitesi/)
  await user.clear(seats)
  await user.type(seats, '4')
  await user.type(screen.getByLabelText(/^Koltuk başı ücret/), '550')
  await user.type(screen.getByLabelText(/^Yolculuk açıklaması/), 'İzmir otogara gidiyorum.')
  await user.type(screen.getByLabelText(/^İletişim bilgisi/), 'Telegram @ege')
  await user.click(screen.getByRole('button', { name: 'Yolculuğu yayınla' }))

  await screen.findByRole('heading', { name: 'İstanbul → İzmir' })
  const created = calls.find((c) => c.method === 'POST' && c.path === '/api/trips')
  expect(created?.headers.get('Authorization')).toBe('Bearer test-token')
  expect(created?.body).toMatchObject({
    originCityCode: 34,
    destinationCityCode: 35,
    seatCapacity: 4,
    priceMinor: 55000,
    description: 'İzmir otogara gidiyorum.',
    contactDetails: 'Telegram @ege',
  })
})

test('rejects trips with identical cities or without İstanbul', async () => {
  const user = userEvent.setup()
  open('/yolculuklar/yeni')
  await screen.findAllByRole('option', { name: 'Ankara' })

  await user.selectOptions(screen.getByLabelText(/^Başlangıç şehri/), '34')
  await user.selectOptions(screen.getByLabelText(/^Varış şehri/), '34')
  await user.type(screen.getByLabelText(/^Kalkış tarihi/), '2026-12-25')
  await user.type(screen.getByLabelText(/^Kalkış saati/), '10:00')
  await user.type(screen.getByLabelText(/^Koltuk başı ücret/), '300')
  await user.click(screen.getByRole('button', { name: 'Yolculuğu yayınla' }))

  expect(screen.getByRole('alert')).toHaveTextContent('Başlangıç ve varış şehri aynı olamaz.')
  expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips')).toBe(false)

  await user.selectOptions(screen.getByLabelText(/^Başlangıç şehri/), '6')
  await user.selectOptions(screen.getByLabelText(/^Varış şehri/), '35')
  await user.click(screen.getByRole('button', { name: 'Yolculuğu yayınla' }))

  expect(screen.getByRole('alert')).toHaveTextContent('Yolculuğun başlangıç veya varış şehirlerinden biri İstanbul (34) olmalıdır.')
  expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips')).toBe(false)
})

test('edits own trip, keeps frozen fields unset when unchanged, and escapes text', async () => {
  const user = userEvent.setup()
  open('/yolculuklar/trip-1/duzenle')
  const desc = await screen.findByLabelText(/^Yolculuk açıklaması/)
  await user.clear(desc)
  await user.type(desc, '<script>alert(1)</script>')
  await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))

  await screen.findByText('<script>alert(1)</script>')
  expect(document.querySelector('main script')).toBeNull()

  const patchCall = calls.find((c) => c.method === 'PATCH' && c.path === '/api/trips/trip-1')
  expect(patchCall?.body).toEqual({
    seatCapacity: 3,
    description: '<script>alert(1)</script>',
    contactDetails: '0555 000 00 00',
  })
})

test('denies editing route when opened by another student', async () => {
  trip.driver = { id: 'other-driver', displayName: 'Başka Sürücü' }
  open('/yolculuklar/trip-1/duzenle')
  await screen.findByText('Bu yolculuğu düzenleme yetkiniz yok')
  expect(screen.queryByRole('button', { name: 'Değişiklikleri kaydet' })).not.toBeInTheDocument()
})

test('requires explicit confirmation before cancelling a trip', async () => {
  const user = userEvent.setup()
  open('/yolculuklar/benim')
  await screen.findByRole('heading', { name: 'İstanbul → Ankara' })

  await user.click(screen.getByRole('button', { name: 'Yolculuğu iptal et' }))
  expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/cancel'))).toBe(false)

  await user.click(screen.getByRole('button', { name: 'Vazgeç' }))
  expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/cancel'))).toBe(false)

  await user.click(screen.getByRole('button', { name: 'Yolculuğu iptal et' }))
  await user.click(screen.getByRole('button', { name: 'İptali onayla' }))

  await screen.findByText('İptal edildi')
  expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips/trip-1/cancel')).toBe(true)
})

test('shows an API error and retries loading my trips', async () => {
  failedMine = true
  const user = userEvent.setup()
  open('/yolculuklar/benim')

  await screen.findByText('Yolculuklar yüklenemedi.')
  failedMine = false
  await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
  await screen.findByRole('heading', { name: 'İstanbul → Ankara' })
})
