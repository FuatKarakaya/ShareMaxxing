import { createRef, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../src/components/ui/Button'
import { Alert } from '../src/components/ui/Alert'
import { Card } from '../src/components/ui/Card'
import { Form } from '../src/components/ui/Form'
import { Input, Select, Textarea } from '../src/components/ui/FormControls'

test('form controls forward native element refs under React 18', () => {
  const input = createRef<HTMLInputElement>()
  const select = createRef<HTMLSelectElement>()
  const textarea = createRef<HTMLTextAreaElement>()
  render(<>
    <Input ref={input} label="Ad" />
    <Select ref={select} label="Kategori"><option>Genel</option></Select>
    <Textarea ref={textarea} label="Not" />
  </>)
  expect(input.current).toBe(screen.getByLabelText('Ad'))
  expect(select.current).toBe(screen.getByLabelText('Kategori'))
  expect(textarea.current).toBe(screen.getByLabelText('Not'))
})

test('buttons default to non-submit and prevent interactions while busy or disabled', async () => {
  const user = userEvent.setup()
  const click = vi.fn()
  const { rerender } = render(<Button onClick={click}>Kaydet</Button>)
  expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  await user.click(screen.getByRole('button'))
  expect(click).toHaveBeenCalledTimes(1)
  rerender(<Button loading onClick={click}>Kaydet</Button>)
  expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  await user.click(screen.getByRole('button'))
  expect(click).toHaveBeenCalledTimes(1)
  rerender(<Button disabled onClick={click}>Kaydet</Button>)
  expect(screen.getByRole('button')).toBeDisabled()
})

test('controls associate unique labels, hints, external descriptions, and errors', () => {
  render(<>
    <p id="external-note">Herkese açık değildir.</p>
    <Input label="E-posta" type="email" required hint="İTÜ adresini kullan." error="Adresini kontrol et." aria-describedby="external-note" />
    <Input label="Ad" />
    <Select label="Bölüm" hint="Birini seç." error="Seçim gerekli."><option value="">Seç</option></Select>
    <Textarea label="Açıklama" error="Açıklama gerekli." />
  </>)
  const email = screen.getByLabelText('E-posta *')
  expect(email).toBeRequired()
  expect(email).toHaveAttribute('aria-invalid', 'true')
  expect(email).toHaveAccessibleDescription('Herkese açık değildir. İTÜ adresini kullan. Adresini kontrol et.')
  expect(email.id).not.toBe(screen.getByLabelText('Ad').id)
  expect(screen.getByLabelText('Bölüm')).toHaveAccessibleDescription('Birini seç. Seçim gerekli.')
  expect(screen.getByLabelText('Açıklama')).toHaveAttribute('aria-invalid', 'true')
})

// A local harness exercises the shared form contract without implementing a feature or calling an API.
function FormExample() {
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  return (
    <Card>
      <Form aria-label="Örnek form" onSubmit={(event) => {
        event.preventDefault()
        const values = new FormData(event.currentTarget)
        if (!String(values.get('title')).trim()) {
          setError('Başlık gerekli.')
          setSubmitted(false)
          return
        }
        setError('')
        setSubmitted(true)
      }}>
        <Input name="title" label="Başlık" error={error} />
        <Select name="category" label="Kategori"><option value="general">Genel</option><option value="other">Diğer</option></Select>
        <Textarea name="body" label="Not" />
        <Button type="submit">Kontrol et</Button>
        {submitted && <Alert variant="success" title="Form hazır">Alanlar kontrol edildi.</Alert>}
      </Form>
    </Card>
  )
}

test('shared form controls work together and announce validation and success', async () => {
  const user = userEvent.setup()
  render(<FormExample />)
  await user.click(screen.getByRole('button', { name: 'Kontrol et' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Başlık gerekli.')
  await user.type(screen.getByLabelText('Başlık'), 'Örnek başlık')
  await user.selectOptions(screen.getByLabelText('Kategori'), 'other')
  await user.type(screen.getByLabelText('Not'), 'Örnek açıklama')
  await user.click(screen.getByRole('button', { name: 'Kontrol et' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Form hazır')
  expect(screen.getByLabelText('Kategori')).toHaveValue('other')
  expect(screen.getByLabelText('Not')).toHaveValue('Örnek açıklama')
})

test('error messages are urgent and success messages use polite status announcements', () => {
  render(<>
    <Alert variant="error" title="İşlem tamamlanamadı">Tekrar dene.</Alert>
    <Alert variant="success" title="İşlem tamamlandı">Kaydedildi.</Alert>
  </>)
  expect(screen.getByRole('alert')).toHaveTextContent('İşlem tamamlanamadı')
  expect(screen.getByRole('status')).toHaveTextContent('İşlem tamamlandı')
})
