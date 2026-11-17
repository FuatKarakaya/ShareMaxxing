import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../src/App'
import { clearStudentSession, signIn } from '../src/features/content/session'

const istanbul = { code: 34, name: 'İstanbul' }
const ankara = { code: 6, name: 'Ankara' }
const fullTrip = {
  id: 'trip-full',
  status: 'PUBLISHED',
  departureAt: '2026-12-20T09:00:00.000Z',
  seatCapacity: 1,
  occupiedSeats: 1,
  freeSeats: 0,
  isFull: true,
  priceMinor: 40000,
  description: null,
  contactDetails: null,
  originCity: istanbul,
  destinationCity: ankara,
  driver: { id: 'driver-1', displayName: 'Mert Yılmaz', bio: null, ratingSummary: { averageScore: null, ratingCount: 0 }, ratings: [] },
}
const tripSummary = { id: 'trip-full', departureAt: fullTrip.departureAt, originCity: istanbul, destinationCity: ankara }
const waiting = { id: 'entry-1', status: 'WAITING', position: 2, offerExpiresAt: null, trip: tripSummary }
const offered = { ...waiting, status: 'OFFERED', position: null, offerExpiresAt: '2026-11-17T15:00:00.000Z' }

let detailTrip = fullTrip
let entries: unknown[] = []
let joinError: { status: number; code: string; message: string } | null = null
let calls: Array<{ path: string; method: string; body: string | null }> = []

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(async () => {
  clearStudentSession()
  detailTrip = fullTrip
  entries = []
  joinError = null
  calls = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    calls.push({ path: url.pathname, method, body: typeof init?.body === 'string' ? init.body : null })
    if (url.pathname === '/api/auth/login') return json({ accessToken: 'test-token', user: { id: 'passenger-1', displayName: 'Elif', role: 'USER' } })
    if (url.pathname.startsWith('/api/trips/')) return json({ trip: detailTrip })
    if (url.pathname === '/api/waitlist' && method === 'GET') return json({ entries })
    if (url.pathname === '/api/waitlist' && method === 'POST') {
      if (joinError) return json({ error: joinError }, joinError.status)
      entries = [{ ...waiting, position: 1 }]
      return json({ entry: entries[0] }, 201)
    }
    if (url.pathname === '/api/waitlist/trip-full' && method === 'DELETE') {
      entries = []
      return new Response(null, { status: 204 })
    }
    if (url.pathname === '/api/bookings' && method === 'GET') return json({ bookings: [] })
    return json({ error: { code: 'NOT_FOUND', message: 'Bulunamadı.' } }, 404)
  })
  await signIn('student@itu.edu.tr', 'test-password')
})

afterEach(() => {
  cleanup()
  clearStudentSession()
  vi.restoreAllMocks()
})

function open(path: string) {
  render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AppRoutes /></MemoryRouter>)
}

test('joins the waitlist of a full trip and shows the place in line', async () => {
  const user = userEvent.setup()
  open('/yolculuklar/trip-full')
  await user.click(await screen.findByRole('button', { name: 'Bekleme listesine katıl' }))
  expect(await screen.findByText(/1\. sıradasınız/)).toBeInTheDocument()
  const post = calls.find(call => call.path === '/api/waitlist' && call.method === 'POST')
  expect(JSON.parse(post?.body ?? '{}')).toEqual({ tripId: 'trip-full' })
  expect(screen.queryByRole('button', { name: 'Rezervasyon yap' })).not.toBeInTheDocument()
})

test('shows the server message when joining is refused', async () => {
  joinError = { status: 409, code: 'SEATS_AVAILABLE', message: 'Bu yolculukta boş koltuk var, doğrudan rezervasyon yapabilirsiniz.' }
  const user = userEvent.setup()
  open('/yolculuklar/trip-full')
  await user.click(await screen.findByRole('button', { name: 'Bekleme listesine katıl' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('doğrudan rezervasyon yapabilirsiniz')
})

test('a waiting passenger sees the place and can leave the list', async () => {
  entries = [waiting]
  const user = userEvent.setup()
  open('/yolculuklar/trip-full')
  expect(await screen.findByText(/2\. sıradasınız/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Bekleme listesinden çık' }))
  expect(await screen.findByRole('button', { name: 'Bekleme listesine katıl' })).toBeInTheDocument()
  expect(calls.some(call => call.path === '/api/waitlist/trip-full' && call.method === 'DELETE')).toBe(true)
})

test('a passenger with an offered seat sees the deadline and the booking button', async () => {
  entries = [offered]
  // The trip API still counts the held seat as free.
  detailTrip = { ...fullTrip, freeSeats: 1, occupiedSeats: 0, isFull: false }
  open('/yolculuklar/trip-full')
  expect(await screen.findByText('Sizin için bir koltuk ayrıldı')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Rezervasyon yap' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Bekleme listesinden çık' })).toBeInTheDocument()
})

test('my bookings page lists the waitlists', async () => {
  entries = [waiting, { ...offered, id: 'entry-2', trip: { ...tripSummary, id: 'trip-2', destinationCity: { code: 35, name: 'İzmir' } } }]
  open('/yolculuklar/rezervasyonlarim')
  expect(await screen.findByRole('heading', { name: 'Bekleme listelerim' })).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'İstanbul → İzmir' })).toHaveAttribute('href', '/yolculuklar/trip-2')
  expect(screen.getByText('2. sıradasınız.')).toBeInTheDocument()
  expect(screen.getByText(/Sizin için bir koltuk ayrıldı:/)).toBeInTheDocument()
})

test('the driver gets neither booking nor waitlist buttons', async () => {
  detailTrip = { ...fullTrip, driver: { ...fullTrip.driver, id: 'passenger-1' } }
  open('/yolculuklar/trip-full')
  await screen.findByRole('heading', { name: 'İstanbul → Ankara' })
  expect(screen.queryByRole('button', { name: 'Bekleme listesine katıl' })).not.toBeInTheDocument()
  expect(calls.some(call => call.path === '/api/waitlist')).toBe(false)
})
