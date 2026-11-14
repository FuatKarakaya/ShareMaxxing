import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Form } from '../../components/ui/Form'
import { Input } from '../../components/ui/FormControls'
import { LinkButton } from '../../components/ui/LinkButton'
import { signIn, errorMessage } from './session'
// Temporary content-page sign-in adapter until the shared authentication screens land.
export function StudentSignIn() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <div className="max-w-lg space-y-5">
    <p>Bu bölümü kullanmak için doğrulanmış İTÜ hesabınızla giriş yapın.</p>
    <Form aria-label="Öğrenci girişi" onSubmit={async event => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      setBusy(true); setError('')
      try { await signIn(String(data.get('email')), String(data.get('password'))) }
      catch (e) { setError(errorMessage(e)) }
      finally { setBusy(false) }
    }}>
      <Input label="E-posta" name="email" type="email" autoComplete="username" required />
      <Input label="Şifre" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" loading={busy}>Giriş yap</Button>
      {error && <Alert variant="error" title="Giriş yapılamadı">{error}</Alert>}
    </Form>
    <p className="text-sm text-muted">Bu oturum yalnızca açık sayfada tutulur; sayfayı yenilerseniz tekrar giriş gerekir.</p>
    <LinkButton to="/" variant="ghost">Ana sayfaya dön</LinkButton>
  </div>
}
