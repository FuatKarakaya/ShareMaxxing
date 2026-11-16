import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Form } from '../../components/ui/Form'
import { Textarea } from '../../components/ui/FormControls'
import { contentRequest, errorMessage } from './session'

type Props = { targetType: 'USER' | 'TRIP' | 'HOUSING' | 'POST'; targetId: string; label: string }

export function ReportButton({ targetType, targetId, label }: Props) {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (sent) return <p role="status" className="text-sm">Bildiriminiz moderasyon ekibine iletildi.</p>
  if (!open) return <Button variant="ghost" onClick={() => setOpen(true)}>{label}</Button>

  return <Form aria-label={label} onSubmit={async event => {
    event.preventDefault()
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim()
    if (!reason) { setError('Bir bildirim nedeni yazın.'); return }
    setBusy(true)
    setError('')
    try {
      await contentRequest('/reports', { method: 'POST', body: JSON.stringify({ targetType, targetId, reason }) })
      setSent(true)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }}>
    <Textarea label="Bildirim nedeni" name="reason" required maxLength={1000} autoFocus />
    <div className="flex flex-wrap gap-2">
      <Button type="submit" loading={busy}>Bildirimi gönder</Button>
      <Button variant="secondary" disabled={busy} onClick={() => { setOpen(false); setError('') }}>Vazgeç</Button>
    </div>
    {error && <Alert variant="error" title="Bildirim gönderilemedi">{error}</Alert>}
  </Form>
}
