import { ReportButton } from '../content/ReportButton'
import { useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageLayout } from '../../components/layout/PageLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Form } from '../../components/ui/Form'
import { Input, Select, Textarea } from '../../components/ui/FormControls'
import { LinkButton } from '../../components/ui/LinkButton'
import { ResourceState } from '../content/ContentControls'
import { StudentSignIn } from '../content/StudentSignIn'
import { useAction, useResource } from '../content/hooks'
import { clearStudentSession, contentRequest, useStudentSession } from '../content/session'

type City = { code: number; name: string }
type TripStatus = 'PUBLISHED' | 'CANCELLED' | 'COMPLETED'
type TripRating = { score: number; review: string | null; createdAt: string }
type TripItem = {
  id: string
  status: TripStatus
  departureAt: string
  seatCapacity: number
  occupiedSeats: number
  freeSeats: number
  isFull: boolean
  priceMinor: number
  description: string | null
  contactDetails: string | null
  originCity: City
  destinationCity: City
  driver: { id: string; displayName: string }
}

type TripDetailItem = TripItem & {
  driver: {
    id: string
    displayName: string
    bio: string | null
    ratingSummary: { averageScore: number | null; ratingCount: number }
    ratings: TripRating[]
  }
}

const ISTANBUL_CITY_CODE = 34

const STATUS_LABELS: Record<TripStatus, string> = {
  PUBLISHED: 'Yayında',
  CANCELLED: 'İptal edildi',
  COMPLETED: 'Tamamlandı',
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(value))
}

function formatPriceTl(priceMinor: number) {
  return `${(priceMinor / 100).toFixed(2)} TL`
}

function validateRoutePair(originCode: number, destinationCode: number): string {
  if (!originCode || !destinationCode) {
    return 'Başlangıç ve varış şehri seçilmelidir.'
  }
  if (originCode === destinationCode) {
    return 'Başlangıç ve varış şehri aynı olamaz.'
  }
  if (originCode !== ISTANBUL_CITY_CODE && destinationCode !== ISTANBUL_CITY_CODE) {
    return 'Yolculuğun başlangıç veya varış şehirlerinden biri İstanbul (34) olmalıdır.'
  }
  return ''
}

export function TripsPage() {
  const session = useStudentSession()
  return (
    <PageLayout title="Yol arkadaşlığı" description="İstanbul’a giden ya da İstanbul’dan yola çıkan İTÜ’lülerle yolunu paylaş.">
      {!session ? (
        <StudentSignIn />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <LinkButton to="/yolculuklar" variant="secondary">Yolculuk ara</LinkButton>
            <LinkButton to="/yolculuklar/benim" variant="secondary">Yolculuklarım</LinkButton>
            <LinkButton to="/yolculuklar/yeni">Yolculuk yayınla</LinkButton>
            <Button variant="ghost" onClick={clearStudentSession}>Çıkış yap</Button>
          </div>
          <Routes>
            <Route index element={<TripSearch />} />
            <Route path="benim" element={<MyTripsList />} />
            <Route path="yeni" element={<TripEditor />} />
            <Route path=":tripId/duzenle" element={<EditTrip />} />
            <Route path=":tripId" element={<TripDetail />} />
            <Route path="*" element={<Alert variant="error" title="Sayfa bulunamadı" />} />
          </Routes>
        </>
      )}
    </PageLayout>
  )
}

function CancelTripAction({ onCancel }: { onCancel: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false)
  const action = useAction()

  return (
    <div className="space-y-3">
      {!confirm ? (
        <Button variant="danger" onClick={() => setConfirm(true)}>Yolculuğu iptal et</Button>
      ) : (
        <>
          <p>Bu yolculuk iptal edilecek ve aktif rezervasyonlar sonlandırılacak. Devam edilsin mi?</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" loading={action.busy} onClick={() => { void action.run(onCancel) }}>İptali onayla</Button>
            <Button variant="secondary" disabled={action.busy} onClick={() => setConfirm(false)}>Vazgeç</Button>
          </div>
        </>
      )}
      {action.error && <Alert variant="error" title="Yolculuk iptal edilemedi">{action.error}</Alert>}
    </div>
  )
}

function TripSearch() {
  const cities = useResource<{ cities: City[] }>('/cities')
  const [params, setParams] = useSearchParams()

  const paramOrigin = params.get('originCityCode') ?? ''
  const paramDestination = params.get('destinationCityCode') ?? ''
  const paramDate = params.get('date') ?? ''

  const [originCityCode, setOriginCityCode] = useState(paramOrigin || String(ISTANBUL_CITY_CODE))
  const [destinationCityCode, setDestinationCityCode] = useState(paramDestination)
  const [dateFilter, setDateFilter] = useState(paramDate)
  const [searchError, setSearchError] = useState('')

  const activeRouteValid =
    Boolean(paramOrigin && paramDestination) && !validateRoutePair(Number(paramOrigin), Number(paramDestination))

  const searchQuery = activeRouteValid
    ? `/trips?${new URLSearchParams({
        originCityCode: paramOrigin,
        destinationCityCode: paramDestination,
        ...(paramDate ? { date: paramDate } : {}),
      })}`
    : ''

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-4 text-xl font-bold">Yolculuk ara</h2>
        <ResourceState {...cities} />
        <Form
          aria-label="Yolculuk arama"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            const routeError = validateRoutePair(Number(originCityCode), Number(destinationCityCode))
            if (routeError) {
              setSearchError(routeError)
              return
            }
            setSearchError('')
            setParams({
              originCityCode,
              destinationCityCode,
              ...(dateFilter ? { date: dateFilter } : {}),
            })
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Başlangıç şehri" value={originCityCode} onChange={(e) => setOriginCityCode(e.target.value)} required>
              <option value="">Şehir seçin</option>
              {cities.data?.cities.map((city) => (
                <option key={city.code} value={city.code}>{city.name}</option>
              ))}
            </Select>
            <Select label="Varış şehri" value={destinationCityCode} onChange={(e) => setDestinationCityCode(e.target.value)} required>
              <option value="">Şehir seçin</option>
              {cities.data?.cities.map((city) => (
                <option key={city.code} value={city.code}>{city.name}</option>
              ))}
            </Select>
            <Input label="Tarih (isteğe bağlı)" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={!cities.data}>Yolculuk ara</Button>
          </div>
          {searchError && <Alert variant="error" title="Arama yapılamadı">{searchError}</Alert>}
        </Form>
      </Card>

      {searchQuery ? (
        <TripSearchResults path={searchQuery} />
      ) : (
        <p role="status">Aramak için başlangıç ve varış şehrini seçin.</p>
      )}
    </div>
  )
}

function TripSearchResults({ path }: { path: string }) {
  const results = useResource<{ trips: TripItem[] }>(path)

  return (
    <div className="space-y-4">
      <ResourceState {...results} />
      {results.data && (
        <>
          {!results.data.trips.length && (
            <p role="status">Seçilen kriterlere uygun yolculuk bulunamadı.</p>
          )}
          <div className="grid gap-4">
            {results.data.trips.map((trip) => (
              <Card key={trip.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xl font-bold">
                    <Link className="text-brand underline" to={`/yolculuklar/${trip.id}`}>
                      {trip.originCity.name} → {trip.destinationCity.name}
                    </Link>
                  </h3>
                  {trip.isFull && (
                    <span className="rounded-lg bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">Dolu</span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted">
                  Sürücü: {trip.driver.displayName} · Kalkış: {formatDateTime(trip.departureAt)} · Ücret: {formatPriceTl(trip.priceMinor)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {trip.freeSeats} / {trip.seatCapacity} boş koltuk
                </p>
                {trip.description && <p className="mt-3 whitespace-pre-wrap">{trip.description}</p>}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TripDetail() {
  const { tripId } = useParams()
  const detail = useResource<{ trip: TripDetailItem }>(`/trips/${tripId}`)
  const session = useStudentSession()
  const navigate = useNavigate()

  if (!detail.data) return <ResourceState {...detail} />

  const trip = detail.data.trip
  const isDriver = trip.driver.id === session?.user.id

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-bold">{trip.originCity.name} → {trip.destinationCity.name}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-surface px-3 py-1 text-sm font-semibold">{STATUS_LABELS[trip.status]}</span>
            {trip.isFull && (
              <span className="rounded-lg bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">Dolu</span>
            )}
          </div>
        </div>

        <p className="mt-3 text-sm text-muted">
          Kalkış: {formatDateTime(trip.departureAt)} · Koltuk başı ücret: {formatPriceTl(trip.priceMinor)}
        </p>
        <p className="mt-1 text-sm text-muted">
          {trip.freeSeats} / {trip.seatCapacity} boş koltuk
        </p>

        <h3 className="mt-6 font-bold">Açıklama</h3>
        <p className="mt-2 whitespace-pre-wrap">{trip.description || 'Sürücü açıklama eklemedi.'}</p>

        <h3 className="mt-6 font-bold">İletişim</h3>
        <p className="mt-2 whitespace-pre-wrap">{trip.contactDetails || 'Sürücü iletişim bilgisi paylaşmadı.'}</p>

        {isDriver && trip.status === 'PUBLISHED' && (
          <div className="mt-6 flex flex-wrap items-start gap-3">
            <LinkButton to={`/yolculuklar/${trip.id}/duzenle`} variant="secondary">Yolculuğu düzenle</LinkButton>
            <CancelTripAction onCancel={async () => {
              await contentRequest(`/trips/${trip.id}/cancel`, { method: 'POST' })
              navigate('/yolculuklar/benim')
            }} />
          </div>
        )}

        <div className="mt-4">
          <ReportButton key={trip.id} targetType="TRIP" targetId={trip.id} label="Yolculuğu bildir" />
        </div>

        {!isDriver && trip.isFull && (
          <div className="mt-6 space-y-3">
            <p role="status">Bu yolculuk dolu; koltuk rezervasyonu yapılamaz.</p>
            <Button disabled>Yolculuk dolu</Button>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-xl font-bold">Sürücü bilgileri</h3>
        <p className="mt-2 font-semibold">{trip.driver.displayName}</p>
        <p className="mt-2 whitespace-pre-wrap text-muted">{trip.driver.bio || 'Sürücü henüz biyografi eklemedi.'}</p>

        {!isDriver && <div className="mt-4">
          <ReportButton key={trip.driver.id} targetType="USER" targetId={trip.driver.id} label="Sürücüyü bildir" />
        </div>}

        <h4 className="mt-5 font-bold">Değerlendirmeler</h4>
        {trip.driver.ratingSummary.ratingCount > 0 && trip.driver.ratingSummary.averageScore !== null ? (
          <div className="mt-2 space-y-3">
            <p className="text-sm font-semibold">
              Ortalama puan: {trip.driver.ratingSummary.averageScore.toFixed(1)} / 5 ({trip.driver.ratingSummary.ratingCount} değerlendirme)
            </p>
            <div className="space-y-2">
              {trip.driver.ratings.map((rating, index) => (
                <div key={`${rating.createdAt}-${index}`} className="rounded-xl border border-line p-3 text-sm">
                  <p className="font-semibold">{rating.score} / 5</p>
                  {rating.review && <p className="mt-1 whitespace-pre-wrap">{rating.review}</p>}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Henüz görünür değerlendirme yok.</p>
        )}
      </Card>
    </div>
  )
}

function MyTripsList() {
  const list = useResource<{ trips: TripItem[] }>('/trips/mine')

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">Yolculuklarım</h2>
      <ResourceState {...list} />
      {list.data && (
        <>
          {!list.data.trips.length && <p role="status">Henüz yayınladığınız bir yolculuk yok.</p>}
          <div className="grid gap-4">
            {list.data.trips.map((trip) => (
              <Card key={trip.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xl font-bold">
                    <Link className="text-brand underline" to={`/yolculuklar/${trip.id}`}>
                      {trip.originCity.name} → {trip.destinationCity.name}
                    </Link>
                  </h3>
                  <span className="rounded-lg bg-surface px-3 py-1 text-sm font-semibold">{STATUS_LABELS[trip.status]}</span>
                </div>
                <p className="mt-2 text-sm text-muted">
                  Kalkış: {formatDateTime(trip.departureAt)} · Ücret: {formatPriceTl(trip.priceMinor)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Boş koltuk: {trip.freeSeats} / {trip.seatCapacity}{trip.isFull ? ' · Dolu' : ''}
                </p>
                {trip.description && <p className="mt-3 whitespace-pre-wrap">{trip.description}</p>}
                {trip.contactDetails && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted">İletişim: {trip.contactDetails}</p>
                )}
                {trip.status === 'PUBLISHED' && (
                  <div className="mt-5 flex flex-wrap items-start gap-3">
                    <LinkButton to={`/yolculuklar/${trip.id}/duzenle`} variant="secondary">Yolculuğu düzenle</LinkButton>
                    <CancelTripAction onCancel={async () => {
                      await contentRequest(`/trips/${trip.id}/cancel`, { method: 'POST' })
                      list.reload()
                    }} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function EditTrip() {
  const { tripId } = useParams()
  const detail = useResource<{ trip: TripItem }>(`/trips/${tripId}`)
  const session = useStudentSession()

  if (!detail.data) return <ResourceState {...detail} />
  if (detail.data.trip.driver.id !== session?.user.id) {
    return <Alert variant="error" title="Bu yolculuğu düzenleme yetkiniz yok" />
  }
  if (detail.data.trip.status !== 'PUBLISHED') {
    return (
      <Alert variant="error" title="Bu yolculuk düzenlenemez">
        Yalnızca yayında olan gelecekteki yolculuklar düzenlenebilir.
      </Alert>
    )
  }

  return <TripEditor key={detail.data.trip.id} trip={detail.data.trip} />
}

function TripEditor({ trip }: { trip?: TripItem }) {
  const cities = useResource<{ cities: City[] }>('/cities')
  const initialDate = trip ? trip.departureAt.slice(0, 10) : ''
  const initialTime = trip ? trip.departureAt.slice(11, 16) : ''
  const initialPriceTl = trip ? String(trip.priceMinor / 100) : ''

  const [originCityCode, setOriginCityCode] = useState(trip ? String(trip.originCity.code) : String(ISTANBUL_CITY_CODE))
  const [destinationCityCode, setDestinationCityCode] = useState(trip ? String(trip.destinationCity.code) : '')
  const [departureDate, setDepartureDate] = useState(initialDate)
  const [departureTime, setDepartureTime] = useState(initialTime)
  const [seatCapacity, setSeatCapacity] = useState(trip ? String(trip.seatCapacity) : '3')
  const [priceTl, setPriceTl] = useState(initialPriceTl)
  const [description, setDescription] = useState(trip?.description ?? '')
  const [contactDetails, setContactDetails] = useState(trip?.contactDetails ?? '')
  const [formError, setFormError] = useState('')

  const action = useAction()
  const navigate = useNavigate()

  function validateClient(): { origin: number; destination: number; departureAt: string; capacity: number; priceMinor: number } | null {
    const origin = Number(originCityCode)
    const destination = Number(destinationCityCode)
    const routeError = validateRoutePair(origin, destination)
    if (routeError) {
      setFormError(routeError)
      return null
    }
    if (!departureDate || !departureTime) {
      setFormError('Kalkış tarihi ve saati girilmelidir.')
      return null
    }
    const departure = new Date(`${departureDate}T${departureTime}:00.000Z`)
    if (Number.isNaN(departure.getTime())) {
      setFormError('Geçerli bir kalkış tarih ve saati girin.')
      return null
    }
    const capacity = Number(seatCapacity)
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
      setFormError('Boş koltuk kapasitesi 1 ile 50 arasında olmalıdır.')
      return null
    }
    const priceMinor = Math.round(Number(priceTl) * 100)
    if (!Number.isFinite(priceMinor) || priceMinor < 1) {
      setFormError('Koltuk başı ücret pozitif olmalıdır.')
      return null
    }
    setFormError('')
    return {
      origin,
      destination,
      departureAt: departure.toISOString(),
      capacity,
      priceMinor,
    }
  }

  return (
    <Card>
      <h2 className="mb-5 text-xl font-bold">{trip ? 'Yolculuğu düzenle' : 'Yolculuk yayınla'}</h2>
      <ResourceState {...cities} />
      <Form
        onSubmit={(event) => {
          event.preventDefault()
          const parsed = validateClient()
          if (!parsed) return

          void action.run(async () => {
            if (!trip) {
              await contentRequest<{ trip: TripItem }>('/trips', {
                method: 'POST',
                body: JSON.stringify({
                  originCityCode: parsed.origin,
                  destinationCityCode: parsed.destination,
                  departureAt: parsed.departureAt,
                  seatCapacity: parsed.capacity,
                  priceMinor: parsed.priceMinor,
                  description: description.trim() || null,
                  contactDetails: contactDetails.trim() || null,
                }),
              })
            } else {
              const patch: Record<string, unknown> = {
                seatCapacity: parsed.capacity,
                description: description.trim() || null,
                contactDetails: contactDetails.trim() || null,
              }
              if (parsed.origin !== trip.originCity.code) patch.originCityCode = parsed.origin
              if (parsed.destination !== trip.destinationCity.code) patch.destinationCityCode = parsed.destination
              if (departureDate !== initialDate || departureTime !== initialTime) patch.departureAt = parsed.departureAt
              if (parsed.priceMinor !== trip.priceMinor) patch.priceMinor = parsed.priceMinor

              await contentRequest<{ trip: TripItem }>(`/trips/${trip.id}`, {
                method: 'PATCH',
                body: JSON.stringify(patch),
              })
            }
            navigate('/yolculuklar/benim')
          })
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Başlangıç şehri" value={originCityCode} onChange={(e) => setOriginCityCode(e.target.value)} required>
            <option value="">Şehir seçin</option>
            {cities.data?.cities.map((city) => (
              <option key={city.code} value={city.code}>{city.name}</option>
            ))}
          </Select>
          <Select label="Varış şehri" value={destinationCityCode} onChange={(e) => setDestinationCityCode(e.target.value)} required>
            <option value="">Şehir seçin</option>
            {cities.data?.cities.map((city) => (
              <option key={city.code} value={city.code}>{city.name}</option>
            ))}
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Kalkış tarihi" type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} required />
          <Input label="Kalkış saati" type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Boş koltuk kapasitesi" type="number" min={1} max={50} value={seatCapacity} onChange={(e) => setSeatCapacity(e.target.value)} required />
          <Input label="Koltuk başı ücret (TL)" type="number" min="1" step="0.01" value={priceTl} onChange={(e) => setPriceTl(e.target.value)} required />
        </div>
        <Textarea
          label="Yolculuk açıklaması (isteğe bağlı)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
        />
        <Textarea
          label="İletişim bilgisi (isteğe bağlı)"
          hint="Yalnızca doğrulanmış İTÜ öğrencilerine gösterilir."
          value={contactDetails}
          onChange={(e) => setContactDetails(e.target.value)}
          maxLength={250}
          rows={2}
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={action.busy} disabled={!cities.data}>
            {trip ? 'Değişiklikleri kaydet' : 'Yolculuğu yayınla'}
          </Button>
          <LinkButton to="/yolculuklar/benim" variant="secondary">Vazgeç</LinkButton>
        </div>
        {(formError || action.error) && (
          <Alert variant="error" title="Yolculuk kaydedilemedi">{formError || action.error}</Alert>
        )}
      </Form>
    </Card>
  )
}
