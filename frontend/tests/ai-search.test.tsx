import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../src/App'
import { clearStudentSession, signIn } from '../src/features/content/session'

let aiAnswer: { status: number; body: unknown } = { status: 200, body: { results: [] } }
let calls: string[] = []
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(async () => {
  clearStudentSession()
  calls = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = new URL(String(input), 'http://localhost')
    calls.push(`${url.pathname}${url.search}`)
    if (url.pathname === '/api/auth/login') return json({ accessToken: 'test-token', user: { id: 'student-1', displayName: 'Deniz', role: 'USER' } })
    if (url.pathname === '/api/forum/categories') return json({ categories: [] })
    if (url.pathname === '/api/forum/questions') return json({ questions: [], page: 1, hasMore: false })
    if (url.pathname === '/api/forum/ai-search') return json(aiAnswer.body, aiAnswer.status)
    return json({ error: { code: 'NOT_FOUND', message: 'Bulunamadı.' } }, 404)
  })
  await signIn('student@itu.edu.tr', 'test-password')
})

afterEach(() => {
  cleanup()
  clearStudentSession()
  vi.restoreAllMocks()
})

async function searchFor(text: string) {
  const user = userEvent.setup()
  render(<MemoryRouter initialEntries={['/forum']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AppRoutes /></MemoryRouter>)
  await user.type(await screen.findByLabelText(/Sorunu kendi cümlelerinle sor/), text)
  await user.click(screen.getByRole('button', { name: 'Yapay zekâyla ara' }))
  return user
}

test('shows related posts with links to their questions', async () => {
  aiAnswer = { status: 200, body: { results: [
    { questionId: 'q-1', title: 'Yemekhane cumartesi açık mı?', excerpt: 'Öğlen açık.', matchedAnswer: true, score: 0.9, link: '/forum/q-1' },
    { questionId: 'q-2', title: 'Hafta sonu menü', excerpt: 'Menü sitede.', matchedAnswer: false, score: 0.7, link: '/forum/q-2' },
  ] } }
  await searchFor('Hafta sonu yemek nerede yenir?')
  expect(await screen.findByRole('link', { name: 'Yemekhane cumartesi açık mı?' })).toHaveAttribute('href', '/forum/q-1')
  expect(screen.getByRole('link', { name: 'Hafta sonu menü' })).toHaveAttribute('href', '/forum/q-2')
  expect(screen.getByText('Bir yanıtta: Öğlen açık.')).toBeInTheDocument()
  expect(calls).toContain(`/api/forum/ai-search?q=${encodeURIComponent('Hafta sonu yemek nerede yenir?').replace(/%20/g, '+')}`)
})

test('with no related post, offers keyword search, which runs the normal search', async () => {
  aiAnswer = { status: 200, body: { results: [] } }
  const user = await searchFor('otopark')
  expect(await screen.findByText(/ilgili bir gönderi bulunamadı/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Anahtar kelimeyle ara' }))
  await screen.findByText('Bu filtrelerde henüz soru yok.')
  expect(calls.some(call => call.startsWith('/api/forum/questions?') && call.includes('q=otopark'))).toBe(true)
})

test('when AI search is unavailable, says so and offers keyword search', async () => {
  aiAnswer = { status: 503, body: { error: { code: 'AI_SEARCH_UNAVAILABLE', message: 'Yapay zekâ araması şu an kullanılamıyor. Anahtar kelimeyle arayın.' } } }
  await searchFor('yemekhane')
  expect(await screen.findByText('Yapay zekâ araması şu an kullanılamıyor')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Anahtar kelimeyle ara' })).toBeInTheDocument()
})
