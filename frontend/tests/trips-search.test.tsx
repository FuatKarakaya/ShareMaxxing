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

type TestTrip = {
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
}

const openTrip: TestTrip = {
  id: 'trip-open',
  status: 'PUBLISHED',
  departureAt: '2026-12-20T09:00:00.000Z',
  seatCapacity: 3,
  occupiedSeats: 1,
  freeSeats: 2,
  isFull: false,
  priceMinor: 40000,
  description: 'Sabah Maslak çıkışlı.',
  contactDetails: '0555 111 22 33',
  originCity: { code: 34, name: 'İstanbul' },
  destinationCity: { code: 6, name: 'Ankara' },
  driver: { id: 'driver-1', displayName: 'Mert Yılmaz' },
}

const fullTrip: TestTrip = {
  id: 'trip-full',
  status: 'PUBLISHED',
  departureAt: '2026-12-20T14:00:00.000Z',
  seatCapacity: 2,
  occupiedSeats: 2,
  freeSeats: 0,
  isFull: true,
  priceMinor: 35000,
  description: 'Koltuk kalmadı.',
  contactDetails: null,
  originCity: { code: 34, name: 'İstanbul' },
  destinationCity: { code: 6, name: 'Ankara' },
  driver: { id: 'driver-2', displayName: 'Ayşe Demir' },
}

let searchResults = [openTrip, fullTrip]
let detailTrip = {
  ...openTrip,
  driver: {
    id: 'driver-1',
    displayName: 'Mert Yılmaz',
    bio: '4. sınıf Bilgisayar Mühendisliği' as string | null,
    ratingSummary: { averageScore: 4.5 as number | null, ratingCount: 2 },
    ratings: [
      { score: 5, review: 'Çok dakik bir yolculuktu.', createdAt: '2026-11-10T12:00:00.000Z' },
      { score: 4, review: null as string | null, createdAt: '2026-11-05T12:00:00.000Z' },
    ],
  },
}
let failSearch = false
let failDetail = false
let calls: Array<{ path: string; method: string; headers: Headers }> = []

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(async () => {
  clearStudentSession()
  searchResults = [openTrip, fullTrip]
  detailTrip = {
    ...openTrip,
    driver: {
      id: 'driver-1',
      displayName: 'Mert Yılmaz',
      bio: '4. sınıf Bilgisayar Mühendisliği',
      ratingSummary: { averageScore: 4.5, ratingCount: 2 },
      ratings: [
        { score: 5, review: 'Çok dakik bir yolculuktu.', createdAt: '2026-11-10T12:00:00.000Z' },
        { score: 4, review: null, createdAt: '2026-11-05T12:00:00.000Z' },
      ],
    },
  }
  failSearch = false
  failDetail = false
  calls = []

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    calls.push({ path: `${url.pathname}${url.search}`, method, headers: new Headers(init?.headers) })

    if (url.pathname === '/api/auth/login') {
      return json({ accessToken: 'test-token', user: { id: 'passenger-1', displayName: 'Elif', role: 'USER' } })
    }
    if (url.pathname === '/api/reports' && method === 'POST') {
      if (JSON.parse(String(init?.body)).targetId !== 'trip-open') return json({}, 400)
      return json({ report: { id: 'report-1', status: 'ACTIVE' } }, 201)
    }
    if (url.pathname === '/api/waitlist' && method === 'GET') {
      return json({ entries: [] })
    }
    if (url.pathname === '/api/cities') {
      return json({ cities })
    }
    if (url.pathname === '/api/trips' && method === 'GET') {
      if (failSearch) {
        return json({ error: { code: 'TEMPORARY', message: 'Arama şu an yapılamıyor.' } }, 503)
      }
      return json({ trips: searchResults })
    }
    if (url.pathname.startsWith('/api/trips/') && method === 'GET') {
      if (failDetail) {
        return json({ error: { code: 'TEMPORARY', message: 'Detay yüklenemedi.' } }, 503)
      }
      return json({ trip: detailTrip })
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

function open(path = '/yolculuklar') {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

test('searches trips by cities and date, showing free-seat trips first and full badge', async () => {
  const user = userEvent.setup()
  open()
  await screen.findAllByRole('option', { name: 'Ankara' })

  await user.selectOptions(screen.getByLabelText(/^Başlangıç şehri/), '34')
  await user.selectOptions(screen.getByLabelText(/^Varış şehri/), '6')
  await user.type(screen.getByLabelText('Tarih (isteğe bağlı)'), '2026-12-20')
  await user.click(screen.getByRole('button', { name: 'Yolculuk ara' }))

  const links = await screen.findAllByRole('link', { name: 'İstanbul → Ankara' })
  expect(links).toHaveLength(2)
  expect(links[0]).toHaveAttribute('href', '/yolculuklar/trip-open')
  expect(links[1]).toHaveAttribute('href', '/yolculuklar/trip-full')
  expect(screen.getByText('2 / 3 boş koltuk')).toBeInTheDocument()
  expect(screen.getByText('0 / 2 boş koltuk')).toBeInTheDocument()
  expect(screen.getByText('Dolu')).toBeInTheDocument()

  const searchCall = calls.find((c) => c.path.startsWith('/api/trips?'))
  expect(searchCall?.path).toBe('/api/trips?originCityCode=34&destinationCityCode=6&date=2026-12-20')
  expect(searchCall?.headers.get('Authorization')).toBe('Bearer test-token')
})

test('validates search inputs and rejects same-city or non-İstanbul routes', async () => {
  const user = userEvent.setup()
  open()
  await screen.findAllByRole('option', { name: 'Ankara' })

  await user.selectOptions(screen.getByLabelText(/^Başlangıç şehri/), '34')
  await user.selectOptions(screen.getByLabelText(/^Varış şehri/), '34')
  await user.click(screen.getByRole('button', { name: 'Yolculuk ara' }))

  expect(screen.getByRole('alert')).toHaveTextContent('Başlangıç ve varış şehri aynı olamaz.')

  await user.selectOptions(screen.getByLabelText(/^Başlangıç şehri/), '6')
  await user.selectOptions(screen.getByLabelText(/^Varış şehri/), '35')
  await user.click(screen.getByRole('button', { name: 'Yolculuk ara' }))

  expect(screen.getByRole('alert')).toHaveTextContent('Yolculuğun başlangıç veya varış şehirlerinden biri İstanbul (34) olmalıdır.')
  expect(calls.some((c) => c.path.startsWith('/api/trips?'))).toBe(false)
})

test('shows an empty message when no trips match search filters', async () => {
  searchResults = []
  open('/yolculuklar?originCityCode=34&destinationCityCode=35')
  await screen.findByText('Seçilen kriterlere uygun yolculuk bulunamadı.')
})

test('displays trip details, contact details, driver bio, and two-way revealed ratings', async () => {
  open('/yolculuklar/trip-open')
  await screen.findByRole('heading', { name: 'İstanbul → Ankara' })

  expect(screen.getByText('400.00 TL', { exact: false })).toBeInTheDocument()
  expect(screen.getByText('Sabah Maslak çıkışlı.')).toBeInTheDocument()
  expect(screen.getByText('0555 111 22 33')).toBeInTheDocument()
  expect(screen.getByText('Mert Yılmaz')).toBeInTheDocument()
  expect(screen.getByText('4. sınıf Bilgisayar Mühendisliği')).toBeInTheDocument()
  expect(screen.getByText('Ortalama puan: 4.5 / 5 (2 değerlendirme)')).toBeInTheDocument()
  expect(screen.getByText('Çok dakik bir yolculuktu.')).toBeInTheDocument()
})

test('marks a full trip as unbookable on detail view and handles missing optional contact details', async () => {
  detailTrip = {
    ...fullTrip,
    driver: {
      id: 'driver-2',
      displayName: 'Ayşe Demir',
      bio: null,
      ratingSummary: { averageScore: null, ratingCount: 0 },
      ratings: [],
    },
  }
  open('/yolculuklar/trip-full')

  // A full trip offers the waitlist (WBS-8.2) instead of booking.
  await screen.findByText(/Bu yolculuk dolu\./)
  expect(screen.getByRole('button', { name: 'Bekleme listesine katıl' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Rezervasyon yap' })).not.toBeInTheDocument()
  expect(screen.getByText('Sürücü iletişim bilgisi paylaşmadı.')).toBeInTheDocument()
  expect(screen.getByText('Henüz görünür değerlendirme yok.')).toBeInTheDocument()
})

test('handles API failure and retries search and detail views', async () => {
  failSearch = true
  const user = userEvent.setup()
  open('/yolculuklar?originCityCode=34&destinationCityCode=6')

  await screen.findByText('Arama şu an yapılamıyor.')
  failSearch = false
  await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
  await screen.findAllByRole('link', { name: 'İstanbul → Ankara' })

  failDetail = true
  await user.click(screen.getAllByRole('link', { name: 'İstanbul → Ankara' })[0])
  await screen.findByText('Detay yüklenemedi.')
  failDetail = false
  await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
  await screen.findByText('Mert Yılmaz')
})

test('reports the trip from its detail page', async () => {
  const user = userEvent.setup()
  render(<MemoryRouter initialEntries={['/yolculuklar/trip-open']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AppRoutes /></MemoryRouter>)
  await user.click(await screen.findByRole('button', { name: 'Yolculuğu bildir' }))
  await user.type(screen.getByLabelText(/Bildirim nedeni/), 'İncelensin')
  await user.click(screen.getByRole('button', { name: 'Bildirimi gönder' }))
  expect(await screen.findByText('Bildiriminiz moderasyon ekibine iletildi.')).toBeVisible()
  expect(calls.find(c => c.path === '/api/reports')?.headers.get('Authorization')).toBe('Bearer test-token')
})
