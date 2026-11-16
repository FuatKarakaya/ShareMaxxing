import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../src/App'
import { clearStudentSession, signIn } from '../src/features/content/session'
const category = { id: 'category-1', code: 'GENERAL', labelTr: 'Genel' }
const student = { id: 'me', displayName: 'Fuat', role: 'USER' }
const base = { id: 'question-1', title: 'Kütüphane saatleri', body: 'Ne zaman açık?', authorId: 'me', author: { id: 'me', displayName: 'Fuat' }, category, createdAt: '2026-11-01T12:00:00Z', hiddenAt: null }
let question: typeof base
let answers: Array<typeof base>
let failList: boolean
let failLogin: boolean
let calls: Array<{ path: string; method: string; body: Record<string, string>; headers: Headers }>
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(async () => {
  clearStudentSession(); question = { ...base }; answers = []; calls = []; failList = false; failLogin = false
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const path = url.pathname
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    calls.push({ path: `${path}${url.search}`, method, body, headers: new Headers(init?.headers) })
    if (path === '/api/auth/login') return failLogin ? json({ error: { code: 'INVALID_CREDENTIALS', message: 'Adres veya şifre hatalı.' } }, 401) : json({ accessToken: 'test-token', user: student })
    if (path === '/api/forum/categories') return json({ categories: [category] })
    if (path === '/api/forum/questions' && method === 'POST') { question = { ...question, ...body }; return json({ question }, 201) }
    if (path === '/api/forum/posts/question-1' && method === 'PATCH') { question = { ...question, ...body }; return json({ post: question }) }
    if (path === '/api/forum/questions/question-1/answers') { answers.push({ ...base, id: 'answer-1', title: '', body: body.body }); return json({ answer: answers[0] }, 201) }
    if (path === '/api/forum/posts/answer-1' && method === 'DELETE') { answers = []; return new Response(null, { status: 204 }) }
    if (path === '/api/forum/questions/question-1') return json({ question, answers, page: 1, hasMore: false })
    if (path === '/api/forum/questions') return failList ? json({ error: { code: 'TEMPORARY', message: 'Sunucuya ulaşılamadı.' } }, 503) : json({ questions: [question], page: Number(url.searchParams.get('page') ?? 1), hasMore: true })
    return json({ error: { code: 'NOT_FOUND', message: 'Bulunamadı.' } }, 404)
  })
  await signIn('student@itu.edu.tr', 'test-password')
})
afterEach(() => { cleanup(); clearStudentSession(); vi.restoreAllMocks() })
function open(path = '/forum') { render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AppRoutes /></MemoryRouter>) }
test('shows real questions and filters/paginates with the bearer token', async () => {
  const user = userEvent.setup(); open()
  await screen.findByRole('link', { name: base.title })
  await user.selectOptions(screen.getByLabelText(/^Kategori/), category.id)
  await waitFor(() => expect(calls.some(c => c.path.includes('categoryId=category-1'))).toBe(true))
  await screen.findByRole('link', { name: base.title })
  await user.click(screen.getByRole('button', { name: 'Sonraki' }))
  await waitFor(() => expect(calls.some(c => c.path.includes('page=2'))).toBe(true))
  expect(calls.find(c => c.path.startsWith('/api/forum/questions'))?.headers.get('Authorization')).toBe('Bearer test-token')
})
test('creates a question and navigates to its detail inside the common shell', async () => {
  const user = userEvent.setup(); open('/forum/yeni')
  await screen.findByRole('option', { name: 'Genel' })
  await user.type(screen.getByLabelText(/^Başlık/), 'Yeni soru')
  await user.selectOptions(screen.getByLabelText(/^Kategori/), category.id)
  await user.type(screen.getByLabelText(/^Soru/), 'Sorunun içeriği')
  await user.click(screen.getByRole('button', { name: 'Soruyu yayınla' }))
  await screen.findByRole('heading', { name: 'Yeni soru', level: 2 })
  expect(calls.find(c => c.method === 'POST' && c.path === '/api/forum/questions')?.body).toEqual({ title: 'Yeni soru', body: 'Sorunun içeriği', categoryId: category.id })
  expect(screen.getByRole('banner')).toBeInTheDocument()
})
test('answers, then requires explicit confirmation before deleting the answer', async () => {
  const user = userEvent.setup(); open('/forum/question-1')
  await screen.findByRole('heading', { name: base.title })
  await user.type(screen.getByLabelText(/^Yanıtınız/), 'Saat dokuzda açılıyor.')
  await user.click(screen.getByRole('button', { name: 'Yanıtı gönder' }))
  await screen.findByText('Saat dokuzda açılıyor.')
  const article = screen.getByRole('article')
  await user.click(within(article).getByRole('button', { name: 'Yanıtı sil' }))
  expect(calls.some(c => c.method === 'DELETE')).toBe(false)
  await user.click(within(article).getByRole('button', { name: 'Silmeyi onayla' }))
  await screen.findByText('Henüz yanıt yok. İlk yanıtı sen yaz.')
})
test('edits own question and displays the saved text safely', async () => {
  const user = userEvent.setup(); open('/forum/question-1/duzenle')
  const title = await screen.findByLabelText(/^Başlık/)
  await user.clear(title); await user.type(title, '<script>örnek</script>')
  await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))
  await screen.findByRole('heading', { name: '<script>örnek</script>' })
  expect(document.querySelector('main script')).toBeNull()
})
test('handles loading failure and retry rather than showing an empty successful result', async () => {
  failList = true; const user = userEvent.setup(); open()
  await screen.findByText('Sunucuya ulaşılamadı.')
  failList = false
  await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
  await screen.findByRole('link', { name: base.title })
})
test('gates content behind sign-in, reports invalid credentials and permits a later login/logout', async () => {
  clearStudentSession(); failLogin = true; const user = userEvent.setup(); open()
  await user.type(screen.getByLabelText(/^E-posta/), 'student@itu.edu.tr')
  await user.type(screen.getByLabelText(/^Şifre/), 'test-password')
  await user.click(screen.getByRole('button', { name: 'Giriş yap' }))
  await screen.findByText('Adres veya şifre hatalı.')
  failLogin = false
  await user.click(screen.getByRole('button', { name: 'Giriş yap' }))
  await screen.findByRole('link', { name: base.title })
  await user.click(screen.getByRole('button', { name: 'Çıkış yap' }))
  expect(screen.getByRole('form', { name: 'Öğrenci girişi' })).toBeInTheDocument()
})

test('expired authentication clears the session and offers sign-in again', async () => {
  vi.mocked(fetch).mockResolvedValue(json({ error: { code: 'INVALID_TOKEN', message: 'Oturum süresi doldu.' } }, 401))
  open()
  await screen.findByRole('form', { name: 'Öğrenci girişi' })
  expect(screen.queryByRole('link', { name: base.title })).not.toBeInTheDocument()
})

test('submits keyword search, preserves filters on pagination, and clears it', async () => {
  const user = userEvent.setup(); open('/forum?categoryId=category-1&page=2&q=old')
  const field = await screen.findByRole('searchbox')
  expect(field).toHaveValue('old')
  await user.clear(field); await user.type(field, '  campus & bus  ')
  await user.click(screen.getByRole('button', { name: /^Ara$/ }))
  await waitFor(() => expect(calls.some(c => c.path === '/api/forum/questions?page=1&q=campus+%26+bus&categoryId=category-1')).toBe(true))
  await screen.findByRole('link', { name: base.title })
  await user.click(screen.getByRole('button', { name: 'Sonraki' }))
  await waitFor(() => expect(calls.some(c => c.path === '/api/forum/questions?page=2&q=campus+%26+bus&categoryId=category-1')).toBe(true))
  await user.click(screen.getByRole('button', { name: /temizle/ }))
  await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue(''))
  expect(calls.at(-1)?.path).toBe('/api/forum/questions?page=1&categoryId=category-1')
})
