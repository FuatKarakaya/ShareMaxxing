import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../src/App'
import { clearStudentSession, signIn } from '../src/features/content/session'

const profile = { id: 'student', displayName: 'Ada', bio: 'İTÜ', ridesAsDriver: 2, ridesAsPassenger: 0,
  ratingCount: 1, averageRating: 4, recentRatings: [{ score: 4, review: 'Zamanında geldi.' }] }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
function open(path: string) {
  render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AppRoutes /></MemoryRouter>)
}
afterEach(() => { cleanup(); clearStudentSession(); vi.restoreAllMocks() })

test('recovers from a rejected edit and displays the saved name', async () => {
  const user = userEvent.setup()
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ accessToken: 'token', user: profile }))
    .mockResolvedValueOnce(json({ profile }))
    .mockResolvedValueOnce(json({ error: { message: 'Geçersiz ad.' } }, 400))
    .mockResolvedValueOnce(json({ profile: { ...profile, displayName: 'Deniz' } }))
  await signIn('ada@itu.edu.tr', 'password')
  open('/profil')
  const name = await screen.findByLabelText(/Görünen ad/)
  await user.clear(name)
  await user.type(name, 'Deniz')
  const save = screen.getByRole('button', { name: 'Değişiklikleri kaydet' })
  await user.click(save)
  expect(await screen.findByRole('alert')).toHaveTextContent('Geçersiz ad.')
  expect(name).toHaveValue('Deniz')
  await user.click(save)
  expect(await screen.findByRole('heading', { name: 'Deniz' })).toBeInTheDocument()
  expect(fetch).toHaveBeenLastCalledWith('/api/profiles/me', expect.objectContaining({
    method: 'PATCH', body: JSON.stringify({ displayName: 'Deniz', bio: 'İTÜ' }),
  }))
})

test('opens a public profile from a forum author and shows only viewing controls', async () => {
  const user = userEvent.setup()
  vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
    switch (String(path)) {
      case '/api/auth/login': return json({ accessToken: 'token', user: { ...profile, id: 'reader' } })
      case '/api/forum/categories': return json({ categories: [] })
      case '/api/profiles/student': return json({ profile })
      default: return json({ questions: [{ id: 'q', title: 'Ders', body: 'Soru', author: profile,
        createdAt: '2026-11-01', authorId: profile.id }], page: 1, hasMore: false })
    }
  })
  await signIn('reader@itu.edu.tr', 'password')
  open('/forum')
  await user.click(await screen.findByRole('link', { name: 'Ada' }))
  expect(await screen.findByText('Zamanında geldi.')).toBeInTheDocument()
  expect(screen.getByText('Sürücü olarak: 2')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Değişiklikleri kaydet' })).toBeNull()
})
