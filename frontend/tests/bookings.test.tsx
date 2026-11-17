import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../src/App'
import { clearStudentSession, signIn } from '../src/features/content/session'

const istanbul = { code: 34, name: 'İstanbul' }
const ankara = { code: 6, name: 'Ankara' }
const izmir = { code: 35, name: 'İzmir' }

const openTrip = {
  id: 'trip-open',
  status: 'PUBLISHED',
  departureAt: '2026-12-20T09:00:00.000Z',
  seatCapacity: 3,
  occupiedSeats: 1,
  freeSeats: 2,
  isFull: false,
  priceMinor: 40000,
  description: null,
  contactDetails: null,
  originCity: istanbul,
  destinationCity: ankara,
  driver: {
    id: 'driver-1',
    displayName: 'Mert Yılmaz',
    bio: null,
    ratingSummary: { averageScore: null, ratingCount: 0 },
    ratings: [],
  },
}

type TestBooking = {
  id: string
  status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED'
  priceMinor: number
  paymentStatus: string | null
  reservationExpiresAt: string
  cancelledAt: string | null
  createdAt: string
  trip: {
    id: string
    departureAt: string
    status: string
    originCity: { code: number; name: string }
    destinationCity: { code: number; name: string }
    driver: { id: string; displayName: string }
  }
}

const pendingBooking: TestBooking = {
  id: 'booking-pending',
  status: 'PENDING_PAYMENT',
  priceMinor: 40000,
  paymentStatus: null,
  reservationExpiresAt: '2026-11-16T15:15:00.000Z',
  cancelledAt: null,
  createdAt: '2026-11-16T15:00:00.000Z',
  trip: {
    id: 'trip-open',
    departureAt: '2026-12-20T09:00:00.000Z',
    status: 'PUBLISHED',
    originCity: istanbul,
    destinationCity: ankara,
    driver: { id: 'driver-1', displayName: 'Mert Yılmaz' },
  },
}

const confirmedBooking: TestBooking = {
  ...pendingBooking,
  id: 'booking-confirmed',
  status: 'CONFIRMED',
  paymentStatus: 'HELD',
  priceMinor: 35000,
  trip: { ...pendingBooking.trip, id: 'trip-izmir', destinationCity: izmir, driver: { id: 'driver-2', displayName: 'Ayşe Demir' } },
}

const expiredBooking: TestBooking = {
  ...pendingBooking,
  id: 'booking-expired',
  status: 'EXPIRED',
  trip: { ...pendingBooking.trip, id: 'trip-old', originCity: ankara, destinationCity: istanbul },
}

let detailTrip = openTrip
let bookings: TestBooking[] = []
let bookingError: { status: number; code: string; message: string } | null = null
let cancelError: { status: number; code: string; message: string } | null = null
let calls: Array<{ path: string; method: string; body: string | null; headers: Headers }> = []

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(async () => {
  clearStudentSession()
  detailTrip = openTrip
  bookings = []
  bookingError = null
  cancelError = null
  calls = []

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    calls.push({ path: url.pathname, method, body: typeof init?.body === 'string' ? init.body : null, headers: new Headers(init?.headers) })

    if (url.pathname === '/api/auth/login') {
      return json({ accessToken: 'test-token', user: { id: 'passenger-1', displayName: 'Elif', role: 'USER' } })
    }
    if (url.pathname.startsWith('/api/trips/') && method === 'GET') {
      return json({ trip: detailTrip })
    }
    if (url.pathname === '/api/bookings' && method === 'POST') {
      if (bookingError) return json({ error: bookingError }, bookingError.status)
      bookings = [pendingBooking, ...bookings]
      return json({ booking: pendingBooking }, 201)
    }
    if (url.pathname === '/api/waitlist' && method === 'GET') {
      return json({ entries: [] })
    }
    if (url.pathname === '/api/bookings' && method === 'GET') {
      return json({ bookings })
    }
    const cancel = url.pathname.match(/^\/api\/bookings\/([^/]+)\/cancel$/)
    if (cancel && method === 'POST') {
      if (cancelError) return json({ error: cancelError }, cancelError.status)
      bookings = bookings.map((booking) => (booking.id === cancel[1] ? { ...booking, status: 'CANCELLED' } : booking))
      return json({ booking: bookings.find((booking) => booking.id === cancel[1]) })
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

function open(path: string) {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

test('books a seat from the trip page and shows it in my bookings', async () => {
  const user = userEvent.setup()
  open('/yolculuklar/trip-open')

  await user.click(await screen.findByRole('button', { name: 'Rezervasyon yap' }))

  await screen.findByRole('heading', { name: 'Rezervasyonlarım' })
  expect(await screen.findByText('Koltuğunuz ayrıldı')).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'İstanbul → Ankara' })).toHaveAttribute('href', '/yolculuklar/trip-open')
  expect(screen.getByText('Ödeme bekleniyor')).toBeInTheDocument()

  const post = calls.find((call) => call.path === '/api/bookings' && call.method === 'POST')
  expect(JSON.parse(post?.body ?? '{}')).toEqual({ tripId: 'trip-open' })
  expect(post?.headers.get('Authorization')).toBe('Bearer test-token')
})

test('shows the server message when the booking is rejected', async () => {
  bookingError = { status: 409, code: 'ALREADY_BOOKED', message: 'Bu yolculukta zaten bir rezervasyonunuz var.' }
  const user = userEvent.setup()
  open('/yolculuklar/trip-open')

  await user.click(await screen.findByRole('button', { name: 'Rezervasyon yap' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Bu yolculukta zaten bir rezervasyonunuz var.')
  expect(screen.getByRole('heading', { name: 'İstanbul → Ankara' })).toBeInTheDocument()
  expect(within(screen.getByRole('alert')).getByRole('link', { name: 'Rezervasyonlarım' })).toHaveAttribute('href', '/yolculuklar/rezervasyonlarim')
})

test('does not offer booking to the driver, on a full trip or on a cancelled trip', async () => {
  detailTrip = { ...openTrip, driver: { ...openTrip.driver, id: 'passenger-1' } }
  open('/yolculuklar/trip-open')
  await screen.findByRole('heading', { name: 'İstanbul → Ankara' })
  expect(screen.queryByRole('button', { name: 'Rezervasyon yap' })).not.toBeInTheDocument()
  cleanup()

  detailTrip = { ...openTrip, freeSeats: 0, occupiedSeats: 3, isFull: true }
  open('/yolculuklar/trip-open')
  await screen.findByRole('button', { name: 'Bekleme listesine katıl' })
  expect(screen.queryByRole('button', { name: 'Rezervasyon yap' })).not.toBeInTheDocument()
  cleanup()

  detailTrip = { ...openTrip, status: 'CANCELLED' }
  open('/yolculuklar/trip-open')
  await screen.findByRole('heading', { name: 'İstanbul → Ankara' })
  expect(screen.queryByRole('button', { name: 'Rezervasyon yap' })).not.toBeInTheDocument()
})

test('lists bookings with their status and payment status', async () => {
  bookings = [pendingBooking, confirmedBooking, expiredBooking]
  open('/yolculuklar/rezervasyonlarim')

  await screen.findByRole('link', { name: 'İstanbul → İzmir' })
  expect(screen.getByText('Ödeme bekleniyor')).toBeInTheDocument()
  expect(screen.getByText('Onaylandı')).toBeInTheDocument()
  expect(screen.getByText('Süresi doldu')).toBeInTheDocument()
  expect(screen.getByText('Ödeme: Ödeme alındı, yolculuk bitene kadar tutuluyor')).toBeInTheDocument()
  expect(screen.getAllByText('Ödeme: Ödeme yapılmadı')).toHaveLength(2)
  expect(screen.getByText(/350\.00 TL/)).toBeInTheDocument()
  expect(screen.getByText(/saatine kadar ayrıldı/)).toBeInTheDocument()
  // Only the pending and the confirmed booking can be cancelled.
  expect(screen.getAllByRole('button', { name: 'Rezervasyonu iptal et' })).toHaveLength(2)
  expect(screen.queryByText('Koltuğunuz ayrıldı')).not.toBeInTheDocument()
})

test('cancels a booking only after confirmation', async () => {
  bookings = [pendingBooking]
  const user = userEvent.setup()
  open('/yolculuklar/rezervasyonlarim')

  await user.click(await screen.findByRole('button', { name: 'Rezervasyonu iptal et' }))
  expect(calls.some((call) => call.path.endsWith('/cancel'))).toBe(false)

  await user.click(screen.getByRole('button', { name: 'Vazgeç' }))
  await user.click(screen.getByRole('button', { name: 'Rezervasyonu iptal et' }))
  await user.click(screen.getByRole('button', { name: 'İptali onayla' }))

  expect(await screen.findByText('İptal edildi')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Rezervasyonu iptal et' })).not.toBeInTheDocument()
  const cancel = calls.find((call) => call.path === '/api/bookings/booking-pending/cancel')
  expect(cancel?.method).toBe('POST')
  expect(cancel?.headers.get('Authorization')).toBe('Bearer test-token')
})

test('shows the server message when a booking cannot be cancelled', async () => {
  bookings = [confirmedBooking]
  cancelError = { status: 409, code: 'TRIP_ALREADY_STARTED', message: 'Yolculuk başladıktan sonra rezervasyon iptal edilemez.' }
  const user = userEvent.setup()
  open('/yolculuklar/rezervasyonlarim')

  await user.click(await screen.findByRole('button', { name: 'Rezervasyonu iptal et' }))
  await user.click(screen.getByRole('button', { name: 'İptali onayla' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Yolculuk başladıktan sonra rezervasyon iptal edilemez.')
  expect(screen.getByText('Onaylandı')).toBeInTheDocument()
})

test('shows an empty message and a search link when there are no bookings', async () => {
  open('/yolculuklar/rezervasyonlarim')

  await screen.findByText('Henüz bir rezervasyonunuz yok.')
  expect(screen.getAllByRole('link', { name: 'Yolculuk ara' }).length).toBeGreaterThan(0)
})
