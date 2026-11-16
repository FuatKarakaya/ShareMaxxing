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
import { StudentSignIn } from '../content/StudentSignIn'
import { clearStudentSession, contentRequest, useStudentSession } from '../content/session'
import { useAction, useResource } from '../content/hooks'
import { DeleteAction, Pagination, ResourceState } from '../content/ContentControls'
type District = { id: string; name: string }
type Listing = { id: string; authorId: string; districtId: string; listingType: string; title: string; description: string; contactDetails: string | null; status: string; hiddenAt: string | null; createdAt: string; author: { id: string; displayName: string }; district: District }
const label = (type: string) => type === 'HAVE_ROOM' ? 'Odam var' : 'Oda arıyorum'
const date = (value: string) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeZone: 'Europe/Istanbul' }).format(new Date(value))
export function HousingPage() {
  const session = useStudentSession()
  return <PageLayout title="Ev ve oda arkadaşı" description="İstanbul'da bir oda ya da ev arkadaşı bul.">
    {!session ? <StudentSignIn /> : <>
      <div className="mb-6 flex flex-wrap items-center gap-3"><LinkButton to="/barinma" variant="secondary">Tüm ilanlar</LinkButton><LinkButton to="/barinma/yeni">İlan ver</LinkButton><Button variant="ghost" onClick={clearStudentSession}>Çıkış yap</Button></div>
      <Routes><Route index element={<ListingList />} /><Route path="yeni" element={<ListingEditor />} /><Route path=":id/duzenle" element={<EditListing />} /><Route path=":id" element={<ListingDetail />} /><Route path="*" element={<Alert variant="error" title="Sayfa bulunamadı" />} /></Routes>
    </>}
  </PageLayout>
}
function ListingList() {
  const [params, setParams] = useSearchParams()
  const districtId = params.get('districtId') ?? ''
  const listingType = params.get('listingType') ?? ''
  const mine = params.get('mine') === '1'
  const current = Number(params.get('page') ?? 1)
  const districts = useResource<{ districts: District[] }>('/housing/districts')
  const filters = { ...(districtId ? { districtId } : {}), ...(listingType ? { listingType } : {}) }
  const query = new URLSearchParams({ ...filters, page: String(current) })
  const list = useResource<{ listings: Listing[]; page: number; hasMore: boolean }>(`/housing${mine ? '/mine' : ''}?${query}`)
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params)
    next.delete('page'); if (value) next.set(key, value); else next.delete(key)
    setParams(next)
  }
  return <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2">
    <Select label="İlçe filtresi" value={districtId} onChange={e => filter('districtId', e.target.value)}><option value="">Tüm ilçeler</option>{districts.data?.districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
    <Select label="Tür filtresi" value={listingType} onChange={e => filter('listingType', e.target.value)}><option value="">Tüm ilan türleri</option><option value="HAVE_ROOM">Odam var</option><option value="NEED_ROOM">Oda arıyorum</option></Select></div>
    <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={mine} onChange={e => filter('mine', e.target.checked ? '1' : '')} />Yalnızca ilanlarım (kapalı ve gizli dahil)</label>
    <ResourceState {...districts} /><ResourceState {...list} />
    {list.data && <>{!list.data.listings.length && <p role="status">Bu filtrelerde henüz ilan yok.</p>}<div className="grid gap-4 sm:grid-cols-2">{list.data.listings.map(row => <Card key={row.id}><p className="mb-2 text-sm font-semibold text-brand">{label(row.listingType)} · {row.district.name}</p><h2 className="text-xl font-bold"><Link className="text-brand underline" to={`/barinma/${row.id}`}>{row.title}</Link></h2><p className="mt-2 text-sm text-muted">{row.author.displayName} · {date(row.createdAt)}</p>{row.status === 'CLOSED' && <p>İlan kapalı.</p>}{row.hiddenAt && <p>İlan moderasyon nedeniyle gizli.</p>}<p className="mt-3 whitespace-pre-wrap">{row.description.slice(0, 240)}{row.description.length > 240 ? '…' : ''}</p></Card>)}</div><Pagination page={list.data.page} hasMore={list.data.hasMore} change={page => setParams({ ...filters, ...(mine ? { mine: '1' } : {}), page: String(page) })} /></>}
  </div>
}
function ListingDetail() {
  const { id } = useParams()
  const detail = useResource<{ listing: Listing }>(`/housing/${id}`)
  const session = useStudentSession()
  const navigate = useNavigate()
  const action = useAction()
  if (!detail.data) return <ResourceState {...detail} />
  const row = detail.data.listing
  return <Card><p className="mb-3 font-semibold text-brand">{label(row.listingType)} · {row.district.name}</p><h2 className="text-2xl font-bold">{row.title}</h2><p className="my-3 text-sm text-muted">{row.author.displayName} · {date(row.createdAt)}</p>
    {row.status === 'CLOSED' && <Alert variant="info" title="İlan kapalı" />}{row.hiddenAt && <Alert variant="info" title="İlan moderasyon nedeniyle gizli" />}
    <p className="mt-4 whitespace-pre-wrap">{row.description}</p><h3 className="mt-6 font-bold">İletişim</h3><p className="mt-2 whitespace-pre-wrap">{row.contactDetails || 'İlan sahibi iletişim bilgisi paylaşmadı.'}</p>
    {row.authorId === session?.user.id && <div className="mt-6 flex flex-wrap items-start gap-3"><LinkButton to={`/barinma/${row.id}/duzenle`} variant="secondary">İlanı düzenle</LinkButton><Button variant="secondary" loading={action.busy} onClick={() => { void action.run(async () => { await contentRequest(`/housing/${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: row.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE' }) }); detail.reload() }) }}>{row.status === 'ACTIVE' ? 'İlanı kapat' : 'İlanı yeniden aç'}</Button><DeleteAction onDelete={async () => { await contentRequest(`/housing/${row.id}`, { method: 'DELETE' }); navigate('/barinma') }}>İlanı sil</DeleteAction></div>}
    {!row.hiddenAt && <div className="mt-4 space-y-2">
      <ReportButton key={row.id} targetType="HOUSING" targetId={row.id} label="İlanı bildir" />
      {row.authorId !== session?.user.id && <ReportButton key={row.authorId} targetType="USER" targetId={row.authorId} label="İlan sahibini bildir" />}
    </div>}
    {action.error && <Alert variant="error" title="İlan güncellenemedi">{action.error}</Alert>}
  </Card>
}
function EditListing() {
  const { id } = useParams()
  const detail = useResource<{ listing: Listing }>(`/housing/${id}`)
  const session = useStudentSession()
  if (!detail.data) return <ResourceState {...detail} />
  if (detail.data.listing.authorId !== session?.user.id) return <Alert variant="error" title="Bu ilanı düzenleme yetkiniz yok" />
  return <ListingEditor key={detail.data.listing.id} listing={detail.data.listing} />
}
function ListingEditor({ listing }: { listing?: Listing }) {
  const districts = useResource<{ districts: District[] }>('/housing/districts')
  const [districtId, setDistrictId] = useState(listing?.districtId ?? '')
  const [listingType, setListingType] = useState(listing?.listingType ?? '')
  const [title, setTitle] = useState(listing?.title ?? '')
  const [description, setDescription] = useState(listing?.description ?? '')
  const [contactDetails, setContactDetails] = useState(listing?.contactDetails ?? '')
  const action = useAction()
  const navigate = useNavigate()
  return <Card><h2 className="mb-5 text-xl font-bold">{listing ? 'İlanı düzenle' : 'Yeni ilan'}</h2><ResourceState {...districts} />
    <Form onSubmit={e => { e.preventDefault(); void action.run(async () => { const result = await contentRequest<{ listing: Listing }>(listing ? `/housing/${listing.id}` : '/housing', { method: listing ? 'PATCH' : 'POST', body: JSON.stringify({ districtId, listingType, title, description, contactDetails: contactDetails.trim() || null }) }); navigate(`/barinma/${result.listing.id}`) }) }}>
      <div className="grid gap-4 sm:grid-cols-2"><Select label="İlçe" value={districtId} onChange={e => setDistrictId(e.target.value)} required><option value="">İlçe seçin</option>{districts.data?.districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</Select><Select label="İlan türü" value={listingType} onChange={e => setListingType(e.target.value)} required><option value="">Tür seçin</option><option value="HAVE_ROOM">Odam var</option><option value="NEED_ROOM">Oda arıyorum</option></Select></div>
      <Input label="Başlık" value={title} onChange={e => setTitle(e.target.value)} required maxLength={160} /><Textarea label="Açıklama" value={description} onChange={e => setDescription(e.target.value)} required maxLength={6000} /><Textarea label="İletişim bilgisi (isteğe bağlı)" hint="Yalnızca paylaşmak istediğin bilgileri yaz; doğrulanmış öğrenciler görebilir." value={contactDetails} onChange={e => setContactDetails(e.target.value)} maxLength={250} rows={2} />
      <div className="flex flex-wrap gap-3"><Button type="submit" loading={action.busy} disabled={!districts.data}>{listing ? 'Değişiklikleri kaydet' : 'İlanı yayınla'}</Button><LinkButton to={listing ? `/barinma/${listing.id}` : '/barinma'} variant="secondary">Vazgeç</LinkButton></div>
      {action.error && <Alert variant="error" title="İlan kaydedilemedi">{action.error}</Alert>}
    </Form>
  </Card>
}
