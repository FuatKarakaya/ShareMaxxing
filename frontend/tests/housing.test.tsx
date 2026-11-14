import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../src/App'
import { clearStudentSession, signIn } from '../src/features/content/session'
const district = { id: 'district-1', name: 'Sarıyer' }
const base = { id: 'listing-1', authorId: 'me', districtId: district.id, district, listingType: 'HAVE_ROOM', title: 'Kampüse yakın oda', description: 'Bir ev arkadaşı arıyorum.', contactDetails: 'Paylaşılan iletişim', status: 'ACTIVE', hiddenAt: null, createdAt: '2026-11-01T12:00:00Z', author: { id: 'me', displayName: 'Fuat' } }
let listing: typeof base
let removed: boolean
let failed: boolean
let calls: Array<{ path: string; method: string; body: Record<string, unknown>; headers: Headers }>
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(async () => {
  clearStudentSession(); listing = { ...base }; removed = false; failed = false; calls = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    calls.push({ path: `${url.pathname}${url.search}`, method, body, headers: new Headers(init?.headers) })
    if (url.pathname === '/api/auth/login') return json({ accessToken: 'test-token', user: { id: 'me', displayName: 'Fuat', role: 'USER' } })
    if (url.pathname === '/api/housing/districts') return json({ districts: [district] })
    if (url.pathname === '/api/housing' && method === 'POST') { listing = { ...listing, ...body }; return json({ listing }, 201) }
    if (url.pathname === '/api/housing/listing-1' && method === 'PATCH') { listing = { ...listing, ...body }; return json({ listing }) }
    if (url.pathname === '/api/housing/listing-1' && method === 'DELETE') { removed = true; return new Response(null, { status: 204 }) }
    if (url.pathname === '/api/housing/listing-1') return json({ listing })
    if (url.pathname === '/api/housing' || url.pathname === '/api/housing/mine') return failed ? json({ error: { code: 'TEMPORARY', message: 'Liste yüklenemedi.' } }, 503) : json({ listings: removed ? [] : [listing], page: Number(url.searchParams.get('page') ?? 1), hasMore: true })
    return json({ error: { code: 'NOT_FOUND', message: 'Bulunamadı.' } }, 404)
  })
  await signIn('student@itu.edu.tr', 'test-password')
})
afterEach(() => { cleanup(); clearStudentSession(); vi.restoreAllMocks() })
function open(path = '/barinma') { render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AppRoutes /></MemoryRouter>) }
test('browses and combines district/type filters, paginates, and preserves filters for own listings', async () => {
  const user = userEvent.setup(); open()
  await screen.findByRole('link', { name: base.title })
  await user.selectOptions(screen.getByLabelText('İlçe filtresi'), district.id)
  await user.selectOptions(screen.getByLabelText('Tür filtresi'), 'HAVE_ROOM')
  await screen.findByRole('link', { name: base.title })
  await user.click(screen.getByRole('button', { name: 'Sonraki' }))
  await waitFor(() => expect(calls.some(c => c.path.includes('page=2') && c.path.includes('districtId=') && c.path.includes('listingType=HAVE_ROOM'))).toBe(true))
  await user.click(screen.getByRole('checkbox'))
  await waitFor(() => expect(calls.some(c => c.path.startsWith('/api/housing/mine?') && c.path.includes('districtId=') && c.path.includes('listingType='))).toBe(true))
  expect(calls.find(c => c.path.startsWith('/api/housing'))?.headers.get('Authorization')).toBe('Bearer test-token')
})
test('creates a listing with explicit optional contact and opens its detail', async () => {
  const user = userEvent.setup(); open('/barinma/yeni')
  await screen.findByRole('option', { name: district.name })
  await user.selectOptions(screen.getByLabelText(/^İlçe/), district.id)
  await user.selectOptions(screen.getByLabelText(/^İlan türü/), 'NEED_ROOM')
  await user.type(screen.getByLabelText(/^Başlık/), 'Oda arıyorum')
  await user.type(screen.getByLabelText(/^Açıklama/), 'Kampüse yakın olmalı.')
  await user.type(screen.getByLabelText(/^İletişim bilgisi/), 'İletişim metni')
  await user.click(screen.getByRole('button', { name: 'İlanı yayınla' }))
  await screen.findByRole('heading', { name: 'Oda arıyorum', level: 2 })
  expect(calls.find(c => c.method === 'POST' && c.path === '/api/housing')?.body).toMatchObject({ districtId: district.id, listingType: 'NEED_ROOM', contactDetails: 'İletişim metni' })
})
test('edits own listing, removes optional contact, and escapes rendered user text', async () => {
  const user = userEvent.setup(); open('/barinma/listing-1/duzenle')
  const title = await screen.findByLabelText(/^Başlık/)
  await user.clear(title); await user.type(title, '<img src=x onerror=alert(1)>')
  await user.clear(screen.getByLabelText(/^İletişim bilgisi/))
  await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))
  await screen.findByRole('heading', { name: '<img src=x onerror=alert(1)>' })
  expect(screen.getByText('İlan sahibi iletişim bilgisi paylaşmadı.')).toBeInTheDocument()
  expect(document.querySelector('main img')).toBeNull()
})
test('closes and reopens an own listing', async () => {
  const user = userEvent.setup(); open('/barinma/listing-1')
  await user.click(await screen.findByRole('button', { name: 'İlanı kapat' }))
  await screen.findByText('İlan kapalı')
  await user.click(screen.getByRole('button', { name: 'İlanı yeniden aç' }))
  await screen.findByRole('button', { name: 'İlanı kapat' })
  expect(calls.filter(c => c.method === 'PATCH').map(c => c.body.status)).toEqual(['CLOSED', 'ACTIVE'])
})
test('requires confirmation before deletion and returns to the empty list', async () => {
  const user = userEvent.setup(); open('/barinma/listing-1')
  await user.click(await screen.findByRole('button', { name: 'İlanı sil' }))
  expect(calls.some(c => c.method === 'DELETE')).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Vazgeç' }))
  expect(calls.some(c => c.method === 'DELETE')).toBe(false)
  await user.click(screen.getByRole('button', { name: 'İlanı sil' }))
  await user.click(screen.getByRole('button', { name: 'Silmeyi onayla' }))
  await screen.findByText('Bu filtrelerde henüz ilan yok.')
})
test('hides owner actions on another student listing and denies direct editor route', async () => {
  listing.authorId = 'other'; open('/barinma/listing-1/duzenle')
  await screen.findByText('Bu ilanı düzenleme yetkiniz yok')
  expect(screen.queryByRole('button', { name: 'Değişiklikleri kaydet' })).not.toBeInTheDocument()
})
test('shows an API error and retries the list', async () => {
  failed = true; const user = userEvent.setup(); open()
  await screen.findByText('Liste yüklenemedi.')
  failed = false; await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
  await screen.findByRole('link', { name: base.title })
})
