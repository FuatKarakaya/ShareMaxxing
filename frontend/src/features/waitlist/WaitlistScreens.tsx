import { Link } from 'react-router-dom'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { BookSeatAction } from '../bookings/BookingScreens'
import { ResourceState } from '../content/ContentControls'
import { useAction, useResource } from '../content/hooks'
import { contentRequest } from '../content/session'
import { formatDateTime } from '../trips/format'

// Waitlist screens (WBS-8.2), on top of the WBS-8.1 API (docs/Waitlist.md).

type City = { code: number; name: string }
export type WaitlistEntry = {
  id: string
  status: 'WAITING' | 'OFFERED'
  position: number | null
  offerExpiresAt: string | null
  trip: { id: string; departureAt: string; originCity: City; destinationCity: City }
}

function LeaveAction({ tripId, onLeft }: { tripId: string; onLeft: () => void }) {
  const action = useAction()
  return <div className="space-y-3">
    <Button variant="secondary" loading={action.busy} onClick={() => { void action.run(async () => {
      await contentRequest(`/waitlist/${tripId}`, { method: 'DELETE' })
      onLeft()
    }) }}>Bekleme listesinden çık</Button>
    {action.error && <Alert variant="error" title="Listeden çıkılamadı">{action.error}</Alert>}
  </div>
}

// Booking and waitlist actions of a passenger on the trip detail page.
export function SeatActions({ tripId, isFull }: { tripId: string; isFull: boolean }) {
  const list = useResource<{ entries: WaitlistEntry[] }>('/waitlist')
  const join = useAction()
  if (!list.data) return <div className="mt-6"><ResourceState {...list} /></div>
  const entry = list.data.entries.find(item => item.trip.id === tripId)

  if (entry?.status === 'OFFERED') {
    return <div className="mt-6 space-y-3">
      <Alert variant="success" title="Sizin için bir koltuk ayrıldı">
        {formatDateTime(entry.offerExpiresAt!)} saatine kadar rezervasyon yapabilirsiniz. Bu süre geçerse koltuk sıradaki kişiye verilir.
      </Alert>
      <BookSeatAction tripId={tripId} />
      <LeaveAction tripId={tripId} onLeft={list.reload} />
    </div>
  }
  if (entry) {
    return <div className="mt-6 space-y-3">
      <p role="status">Bekleme listesinde {entry.position}. sıradasınız. Bir koltuk boşalırsa size bildirim gelir.</p>
      <LeaveAction tripId={tripId} onLeft={list.reload} />
    </div>
  }
  if (!isFull) return <BookSeatAction tripId={tripId} />
  return <div className="mt-6 space-y-3">
    <p role="status">Bu yolculuk dolu. Bekleme listesine katılırsanız, boşalan koltuk sırayla size de sunulur.</p>
    <Button loading={join.busy} onClick={() => { void join.run(async () => {
      await contentRequest('/waitlist', { method: 'POST', body: JSON.stringify({ tripId }) })
      list.reload()
    }) }}>Bekleme listesine katıl</Button>
    {join.error && <Alert variant="error" title="Bekleme listesine katılınamadı">{join.error}</Alert>}
  </div>
}

// Shown on "Rezervasyonlarım" under the bookings.
export function MyWaitlist() {
  const list = useResource<{ entries: WaitlistEntry[] }>('/waitlist')
  return <section className="space-y-4" aria-labelledby="waitlist-heading">
    <h2 id="waitlist-heading" className="text-xl font-bold">Bekleme listelerim</h2>
    <ResourceState {...list} />
    {list.data && !list.data.entries.length && <p role="status">Hiçbir bekleme listesinde değilsiniz.</p>}
    {list.data?.entries.map(entry => <Card key={entry.id}>
      <h3 className="text-lg font-bold">
        <Link className="text-brand underline" to={`/yolculuklar/${entry.trip.id}`}>{entry.trip.originCity.name} → {entry.trip.destinationCity.name}</Link>
      </h3>
      <p className="mt-2 text-sm text-muted">Kalkış: {formatDateTime(entry.trip.departureAt)}</p>
      <p className="mt-2">{entry.status === 'OFFERED'
        ? `Sizin için bir koltuk ayrıldı: ${formatDateTime(entry.offerExpiresAt!)} saatine kadar rezervasyon yapın.`
        : `${entry.position}. sıradasınız.`}</p>
    </Card>)}
  </section>
}
