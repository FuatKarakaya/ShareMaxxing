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
import { AiSearchBox } from './AiSearchBox'
type Category = { id: string; code: string; labelTr: string }
type Post = { id: string; authorId: string; title: string | null; body: string; hiddenAt: string | null; createdAt: string; author: { id: string; displayName: string }; category: Category | null }
type Detail = { question: Post; answers: Post[]; page: number; hasMore: boolean }
const date = (value: string) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeZone: 'Europe/Istanbul' }).format(new Date(value))
export function ForumPage() {
  const session = useStudentSession()
  return <PageLayout title="Öğrenci forumu" description="Sorularını paylaş, İTÜ topluluğunun yanıtlarına katıl.">
    {!session ? <StudentSignIn /> : <>
      <div className="mb-6 flex flex-wrap items-center gap-3"><LinkButton to="/forum" variant="secondary">Tüm sorular</LinkButton><LinkButton to="/forum/yeni">Soru sor</LinkButton><Button variant="ghost" onClick={clearStudentSession}>Çıkış yap</Button></div>
      <Routes><Route index element={<QuestionList />} /><Route path="yeni" element={<QuestionEditor />} /><Route path=":id/duzenle" element={<EditQuestion />} /><Route path=":id" element={<QuestionDetail />} /><Route path="*" element={<Alert variant="error" title="Sayfa bulunamadı" />} /></Routes>
    </>}
  </PageLayout>
}
function QuestionList() {
  const [params, setParams] = useSearchParams()
  const keyword = params.get('q') ?? ''
  const category = params.get('categoryId') ?? ''
  const current = Number(params.get('page') ?? 1)
  const mine = params.get('mine') === '1'
  const categories = useResource<{ categories: Category[] }>('/forum/categories')
  const query = new URLSearchParams({ page: String(current), ...(keyword ? { q: keyword } : {}), ...(category ? { categoryId: category } : {}) })
  const list = useResource<{ questions: Post[]; page: number; hasMore: boolean }>(`/forum/questions${mine ? '/mine' : ''}?${query}`)
  return <div className="space-y-5">
    <AiSearchBox onKeywordSearch={q => setParams({ ...(category ? { categoryId: category } : {}), ...(mine ? { mine: '1' } : {}), ...(q ? { q } : {}) })} />
    <SearchForm key={keyword} keyword={keyword} search={q => setParams({ ...(category ? { categoryId: category } : {}), ...(mine ? { mine: '1' } : {}), ...(q ? { q } : {}) })} />
    <div className="grid gap-4 sm:grid-cols-2"><Select label="Kategori" value={category} onChange={e => setParams({ ...(keyword ? { q: keyword } : {}), ...(mine ? { mine: '1' } : {}), ...(e.target.value ? { categoryId: e.target.value } : {}) })}><option value="">Tüm kategoriler</option>{categories.data?.categories.map(c => <option key={c.id} value={c.id}>{c.labelTr}</option>)}</Select>
    <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={mine} onChange={e => setParams({ ...(keyword ? { q: keyword } : {}), ...(category ? { categoryId: category } : {}), ...(e.target.checked ? { mine: '1' } : {}) })} />Yalnızca sorularım</label></div>
    <ResourceState {...categories} /><ResourceState {...list} />
    {list.data && <>{!list.data.questions.length && <p role="status">Bu filtrelerde henüz soru yok.</p>}<div className="grid gap-4">{list.data.questions.map(q => <Card key={q.id}><h2 className="text-xl font-bold"><Link className="text-brand underline" to={`/forum/${q.id}`}>{q.title}</Link></h2><p className="mt-2 text-sm text-muted">{q.category?.labelTr} · <Link className="text-brand underline" to={`/profil/${q.author.id}`}>{q.author.displayName}</Link> · {date(q.createdAt)}</p>{q.hiddenAt && <p>Bu gönderi moderasyon nedeniyle gizli.</p>}<p className="mt-3 whitespace-pre-wrap">{q.body.slice(0, 240)}{q.body.length > 240 ? '…' : ''}</p></Card>)}</div><Pagination page={list.data.page} hasMore={list.data.hasMore} change={page => setParams({ ...(keyword ? { q: keyword } : {}), ...(category ? { categoryId: category } : {}), ...(mine ? { mine: '1' } : {}), page: String(page) })} /></>}
  </div>
}
function SearchForm({ keyword, search }: { keyword: string; search: (q: string) => void }) {
  const [draft, setDraft] = useState(keyword)
  return <form role="search" aria-label="Forum araması" className="space-y-3" onSubmit={e => { e.preventDefault(); search(draft.trim()) }}>
    <Input label="Forumda ara" type="search" value={draft} maxLength={200} onChange={e => setDraft(e.target.value)} placeholder="Başlık, soru veya yanıtta ara" />
    <div className="flex gap-3"><Button type="submit">Ara</Button><Button variant="secondary" onClick={() => { setDraft(''); search('') }}>Aramayı temizle</Button></div>
  </form>
}
function QuestionDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const detail = useResource<Detail>(`/forum/questions/${id}?page=${params.get('page') ?? 1}`)
  const session = useStudentSession()
  const navigate = useNavigate()
  const answer = useAction()
  const [body, setBody] = useState('')
  if (!detail.data) return <ResourceState {...detail} />
  const q = detail.data.question
  return <div className="space-y-6"><Card><h2 className="text-2xl font-bold">{q.title}</h2><p className="my-3 text-sm text-muted">{q.category?.labelTr} · <Link className="text-brand underline" to={`/profil/${q.author.id}`}>{q.author.displayName}</Link> · {date(q.createdAt)}</p>{q.hiddenAt && <Alert variant="info" title="Gönderi gizli" />}<p className="whitespace-pre-wrap">{q.body}</p>
    {q.authorId === session?.user.id && <div className="mt-5 flex flex-wrap items-start gap-3"><LinkButton to={`/forum/${q.id}/duzenle`} variant="secondary">Soruyu düzenle</LinkButton><DeleteAction onDelete={async () => { await contentRequest(`/forum/posts/${q.id}`, { method: 'DELETE' }); navigate('/forum') }}>Soruyu sil</DeleteAction></div>}
    {!q.hiddenAt && <div className="mt-4 space-y-2">
      <ReportButton key={q.id} targetType="POST" targetId={q.id} label="Soruyu bildir" />
      {q.authorId !== session?.user.id && <ReportButton key={q.authorId} targetType="USER" targetId={q.authorId} label="Yazarı bildir" />}
    </div>}
    </Card><h2 className="text-xl font-bold">Yanıtlar</h2>
    {!detail.data.answers.length && <p>Henüz yanıt yok. İlk yanıtı sen yaz.</p>}
    {detail.data.answers.map(a => <Answer key={a.id} post={a} own={a.authorId === session?.user.id} reload={detail.reload} />)}
    <Pagination page={detail.data.page} hasMore={detail.data.hasMore} change={page => setParams({ page: String(page) })} />
    <Card><h2 className="mb-4 text-xl font-bold">Yanıt yaz</h2><Form onSubmit={e => { e.preventDefault(); void answer.run(async () => { await contentRequest(`/forum/questions/${id}/answers`, { method: 'POST', body: JSON.stringify({ body }) }); setBody(''); detail.reload() }) }}>
      <Textarea label="Yanıtınız" value={body} onChange={e => setBody(e.target.value)} required maxLength={6000} /><Button type="submit" loading={answer.busy}>Yanıtı gönder</Button>{answer.error && <Alert variant="error" title="Yanıt gönderilemedi">{answer.error}</Alert>}
    </Form></Card><ResourceState loading={detail.loading} error={detail.error} reload={detail.reload} />
  </div>
}
function Answer({ post, own, reload }: { post: Post; own: boolean; reload: () => void }) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(post.body)
  const action = useAction()
  return <article aria-label={`${post.author.displayName} yanıtı`}><Card><p className="mb-3 text-sm text-muted"><Link className="text-brand underline" to={`/profil/${post.author.id}`}>{post.author.displayName}</Link> · {date(post.createdAt)}</p>{post.hiddenAt && <p>Bu yanıt moderasyon nedeniyle gizli.</p>}
    {editing ? <Form onSubmit={e => { e.preventDefault(); void action.run(async () => { await contentRequest(`/forum/posts/${post.id}`, { method: 'PATCH', body: JSON.stringify({ body }) }); setEditing(false); reload() }) }}><Textarea label="Yanıtı düzenle" value={body} onChange={e => setBody(e.target.value)} required maxLength={6000} /><div className="flex gap-3"><Button type="submit" loading={action.busy}>Kaydet</Button><Button variant="secondary" onClick={() => { setEditing(false); setBody(post.body) }}>Vazgeç</Button></div></Form> : <p className="whitespace-pre-wrap">{post.body}</p>}
    {own && !editing && <div className="mt-4 flex flex-wrap items-start gap-3"><Button variant="secondary" onClick={() => setEditing(true)}>Yanıtı düzenle</Button><DeleteAction onDelete={async () => { await contentRequest(`/forum/posts/${post.id}`, { method: 'DELETE' }); reload() }}>Yanıtı sil</DeleteAction></div>}{action.error && <Alert variant="error" title="Yanıt kaydedilemedi">{action.error}</Alert>}
    {!post.hiddenAt && !editing && <div className="mt-4 space-y-2">
      <ReportButton targetType="POST" targetId={post.id} label="Yanıtı bildir" />
      {!own && <ReportButton targetType="USER" targetId={post.authorId} label="Yanıt yazarını bildir" />}
    </div>}
  </Card></article>
}
function EditQuestion() {
  const { id } = useParams()
  const detail = useResource<Detail>(`/forum/questions/${id}`)
  const session = useStudentSession()
  if (!detail.data) return <ResourceState {...detail} />
  if (detail.data.question.authorId !== session?.user.id) return <Alert variant="error" title="Bu soruyu düzenleme yetkiniz yok" />
  return <QuestionEditor key={detail.data.question.id} question={detail.data.question} />
}
function QuestionEditor({ question }: { question?: Post }) {
  const categories = useResource<{ categories: Category[] }>('/forum/categories')
  const [title, setTitle] = useState(question?.title ?? '')
  const [body, setBody] = useState(question?.body ?? '')
  const [categoryId, setCategoryId] = useState(question?.category?.id ?? '')
  const action = useAction()
  const navigate = useNavigate()
  return <Card><h2 className="mb-5 text-xl font-bold">{question ? 'Soruyu düzenle' : 'Yeni soru'}</h2><ResourceState {...categories} />
    <Form onSubmit={e => { e.preventDefault(); void action.run(async () => {
      const result = await contentRequest<{ question?: Post; post?: Post }>(question ? `/forum/posts/${question.id}` : '/forum/questions', { method: question ? 'PATCH' : 'POST', body: JSON.stringify({ title, body, categoryId }) })
      navigate(`/forum/${(result.question ?? result.post)!.id}`)
    }) }}><Input label="Başlık" value={title} onChange={e => setTitle(e.target.value)} required maxLength={180} />
    <Select label="Kategori" value={categoryId} onChange={e => setCategoryId(e.target.value)} required><option value="">Kategori seçin</option>{categories.data?.categories.map(c => <option key={c.id} value={c.id}>{c.labelTr}</option>)}</Select>
    <Textarea label="Soru" value={body} onChange={e => setBody(e.target.value)} required maxLength={6000} />
    <div className="flex flex-wrap gap-3"><Button type="submit" loading={action.busy} disabled={!categories.data}>{question ? 'Değişiklikleri kaydet' : 'Soruyu yayınla'}</Button><LinkButton variant="secondary" to={question ? `/forum/${question.id}` : '/forum'}>Vazgeç</LinkButton></div>
    {action.error && <Alert variant="error" title="Soru kaydedilemedi">{action.error}</Alert>}
  </Form></Card>
}
