import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/FormControls'
import { ApiClientError } from '../../lib/api'
import { contentRequest, errorMessage } from '../content/session'

// AI search box (WBS-23.3) on top of GET /api/forum/ai-search (docs/AiForumSearch.md).
type Result = { questionId: string; title: string; excerpt: string; matchedAnswer: boolean; link: string }
type State = { kind: 'idle' } | { kind: 'results'; results: Result[] } | { kind: 'unavailable' | 'error'; message: string }

export function AiSearchBox({ onKeywordSearch }: { onKeywordSearch: (keyword: string) => void }) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const keywordButton = <Button variant="secondary" onClick={() => onKeywordSearch(query.trim().slice(0, 200))}>Anahtar kelimeyle ara</Button>

  return <Card>
    <form role="search" aria-label="Yapay zekâ ile forum araması" className="space-y-3" onSubmit={async event => {
      event.preventDefault()
      setBusy(true)
      try {
        const data = await contentRequest<{ results: Result[] }>(`/forum/ai-search?${new URLSearchParams({ q: query.trim() })}`)
        setState({ kind: 'results', results: data.results })
      } catch (error) {
        const unavailable = error instanceof ApiClientError && error.code === 'AI_SEARCH_UNAVAILABLE'
        setState({ kind: unavailable ? 'unavailable' : 'error', message: errorMessage(error) })
      } finally {
        setBusy(false)
      }
    }}>
      <Input label="Sorunu kendi cümlelerinle sor" hint="Yapay zekâ benzer soruları ve yanıtları bulur." value={query} maxLength={300} required onChange={event => setQuery(event.target.value)} placeholder="Örneğin: Yemekhane hafta sonu açık mı?" />
      <Button type="submit" loading={busy} disabled={!query.trim()}>Yapay zekâyla ara</Button>
    </form>

    {state.kind === 'results' && state.results.length > 0 && <div className="mt-5 space-y-3">
      <h2 className="font-bold">İlgili gönderiler</h2>
      <ul className="space-y-3">{state.results.map(result => <li key={result.questionId}>
        <Link className="font-semibold text-brand underline" to={result.link}>{result.title}</Link>
        <p className="mt-1 text-sm text-muted">{result.matchedAnswer ? 'Bir yanıtta: ' : ''}{result.excerpt}</p>
      </li>)}</ul>
    </div>}
    {state.kind === 'results' && !state.results.length && <div className="mt-5 space-y-3">
      <p role="status">Sorunla ilgili bir gönderi bulunamadı. Anahtar kelimeyle aramayı deneyebilir ya da soruyu sen sorabilirsin.</p>
      <div className="flex flex-wrap gap-3">{keywordButton}<Link className="self-center text-brand underline" to="/forum/yeni">Soru sor</Link></div>
    </div>}
    {state.kind === 'unavailable' && <div className="mt-5 space-y-3">
      <Alert variant="info" title="Yapay zekâ araması şu an kullanılamıyor">{state.message}</Alert>
      {keywordButton}
    </div>}
    {state.kind === 'error' && <div className="mt-5"><Alert variant="error" title="Arama yapılamadı">{state.message}</Alert></div>}
  </Card>
}
