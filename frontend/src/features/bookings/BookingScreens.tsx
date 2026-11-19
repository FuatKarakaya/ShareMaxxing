import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { LinkButton } from '../../components/ui/LinkButton'
import { ResourceState } from '../content/ContentControls'
import { useAction, useResource } from '../content/hooks'
import { contentRequest } from '../content/session'
import { formatDateTime, formatPriceTl } from '../trips/format'
import { MyWaitlist } from '../waitlist/WaitlistScreens'

type City = { code: number; name: string }
type BookingStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED'
type PaymentStatus = 'CREATED' | 'PENDING' | 'HELD' | 'RELEASED' | 'REFUNDED' | 'FAILED'
type Booking = {
  id: string
  status: BookingStatus
  priceMinor: number
  paymentStatus: PaymentStatus | null
  reservationExpiresAt: string
  trip: {
    id: string
    departureAt: string
    originCity: City
    destinationCity: City
    driver: { id: string; displayName: string }
  }
}

const MY_BOOKINGS_PATH = '/yolculuklar/rezervasyonlarim'

const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING_PAYMENT: 'Ödeme bekleniyor',
  CONFIRMED: 'Onaylandı',
  COMPLETED: 'Tamamlandı',
  CANCELLED: 'İptal edildi',
  EXPIRED: 'Süresi doldu',
}

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  CREATED: 'Ödeme işleniyor',
  PENDING: 'Ödeme işleniyor',
  HELD: 'Ödeme alındı, yolculuk bitene kadar tutuluyor',
  RELEASED: 'Ödeme sürücüye aktarıldı',
  REFUNDED: 'Ödeme iade edildi',
  FAILED: 'Ödeme başarısız',
}

// Shown on the trip detail page (WBS-6.2) to passengers when the trip has a free seat.
export function BookSeatAction({ tripId }: { tripId: string }) {
  const action = useAction()
  const navigate = useNavigate()

  return (
    <div className="mt-6 space-y-3">
      <Button
        loading={action.busy}
        onClick={() => {
          void action.run(async () => {
            await contentRequest('/bookings', { method: 'POST', body: JSON.stringify({ tripId }) })
            navigate(MY_BOOKINGS_PATH, { state: { justBooked: true } })
          })
        }}
      >
        Rezervasyon yap
      </Button>
      {action.error && (
        <Alert variant="error" title="Rezervasyon yapılamadı">
          <p>{action.error}</p>
          <p className="mt-2"><Link className="underline" to={MY_BOOKINGS_PATH}>Rezervasyonlarım</Link></p>
        </Alert>
      )}
    </div>
  )
}

function CancelBookingAction({ onCancel }: { onCancel: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false)
  const action = useAction()

  return (
    <div className="space-y-3">
      {!confirm ? (
        <Button variant="danger" onClick={() => setConfirm(true)}>Rezervasyonu iptal et</Button>
      ) : (
        <>
          <p>Bu rezervasyon iptal edilecek ve koltuğunuz başkasına açılacak. Devam edilsin mi?</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" loading={action.busy} onClick={() => { void action.run(onCancel) }}>İptali onayla</Button>
            <Button variant="secondary" disabled={action.busy} onClick={() => setConfirm(false)}>Vazgeç</Button>
          </div>
        </>
      )}
      {action.error && <Alert variant="error" title="Rezervasyon iptal edilemedi">{action.error}</Alert>}
    </div>
  )
}

export function MyBookingsList() {
  const list = useResource<{ bookings: Booking[] }>('/bookings')
  const location = useLocation()
  const justBooked = Boolean((location.state as { justBooked?: boolean } | null)?.justBooked)

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">Rezervasyonlarım</h2>
      {justBooked && <Alert variant="success" title="Koltuğunuz ayrıldı">Rezervasyonunuz aşağıdaki listede.</Alert>}
      <ResourceState {...list} />
      {list.data && (
        <>
          {!list.data.bookings.length && (
            <div className="space-y-3">
              <p role="status">Henüz bir rezervasyonunuz yok.</p>
              <LinkButton to="/yolculuklar" variant="secondary">Yolculuk ara</LinkButton>
            </div>
          )}
          <div className="grid gap-4">
            {list.data.bookings.map((booking) => (
              <Card key={booking.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xl font-bold">
                    <Link className="text-brand underline" to={`/yolculuklar/${booking.trip.id}`}>
                      {booking.trip.originCity.name} → {booking.trip.destinationCity.name}
                    </Link>
                  </h3>
                  <span className="rounded-lg bg-surface px-3 py-1 text-sm font-semibold">{STATUS_LABELS[booking.status]}</span>
                </div>
                <p className="mt-2 text-sm text-muted">
                  Sürücü: {booking.trip.driver.displayName} · Kalkış: {formatDateTime(booking.trip.departureAt)} · Ücret: {formatPriceTl(booking.priceMinor)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Ödeme: {booking.paymentStatus ? PAYMENT_LABELS[booking.paymentStatus] : 'Ödeme yapılmadı'}
                </p>
                {booking.status === 'PENDING_PAYMENT' && (
                  <p className="mt-3">
                    Koltuğunuz {formatDateTime(booking.reservationExpiresAt)} saatine kadar ayrıldı. Bu süre içinde ödeme tamamlanmazsa rezervasyon düşer.
                  </p>
                )}
                {(booking.status === 'PENDING_PAYMENT' || booking.status === 'CONFIRMED') && (
                  <div className="mt-5">
                    <CancelBookingAction onCancel={async () => {
                      await contentRequest(`/bookings/${booking.id}/cancel`, { method: 'POST' })
                      list.reload()
                    }} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
      <MyWaitlist />
    </div>
  )
}
