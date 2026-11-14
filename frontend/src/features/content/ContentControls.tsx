import { useState, type ReactNode } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { useAction } from './hooks'
export function ResourceState({ loading, error, reload }: { loading: boolean; error: string; reload: () => void }) {
  return <>{loading && <p role="status">Yükleniyor…</p>}{error && <div className="space-y-3"><Alert variant="error" title="İçerik yüklenemedi">{error}</Alert><Button onClick={reload}>Tekrar dene</Button></div>}</>
}
export function Pagination({ page, hasMore, change }: { page: number; hasMore: boolean; change: (page: number) => void }) {
  return <nav aria-label="Sayfalar" className="mt-6 flex flex-wrap items-center gap-3">
    <Button variant="secondary" disabled={page <= 1} onClick={() => change(page - 1)}>Önceki</Button>
    <span aria-live="polite">Sayfa {page}</span>
    <Button variant="secondary" disabled={!hasMore} onClick={() => change(page + 1)}>Sonraki</Button>
  </nav>
}
export function DeleteAction({ onDelete, children = 'Sil' }: { onDelete: () => Promise<void>; children?: ReactNode }) {
  const [confirm, setConfirm] = useState(false)
  const action = useAction()
  return <div className="space-y-3">{!confirm ? <Button variant="danger" onClick={() => setConfirm(true)}>{children}</Button> : <>
    <p>Bu içerik kalıcı olarak silinecek. Devam edilsin mi?</p>
    <div className="flex flex-wrap gap-3"><Button variant="danger" loading={action.busy} onClick={() => { void action.run(onDelete) }}>Silmeyi onayla</Button><Button variant="secondary" disabled={action.busy} onClick={() => setConfirm(false)}>Vazgeç</Button></div>
  </>}{action.error && <Alert variant="error" title="Silinemedi">{action.error}</Alert>}</div>
}
