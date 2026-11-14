import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../src/App'
import { sections } from '../src/config/navigation'

function renderApp(path = '/') {
  return render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AppRoutes /></MemoryRouter>)
}

test('opens the Turkish home page inside the shared shell', () => {
  renderApp()
  expect(screen.getByRole('heading', { level: 1, name: 'Birlikte daha kolay.' })).toBeInTheDocument()
  expect(screen.getByRole('banner')).toBeInTheDocument()
  expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
  expect(screen.getByRole('contentinfo')).toHaveTextContent('İTÜ ShareMaxxing')
  expect(screen.getByRole('link', { name: 'İçeriğe geç' })).toHaveAttribute('href', '#main-content')
  expect(document.title).toBe('Ana sayfa | İTÜ ShareMaxxing')
})

test.each(sections)('opens $path directly with the shared layout', ({ path, title }) => {
  renderApp(path)
  expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Bu bölüm hazırlanıyor')
  expect(screen.getByRole('banner')).toBeInTheDocument()
  expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  expect(document.title).toBe(`${title} | İTÜ ShareMaxxing`)
})

test('navigates from a home card and returns without a page reload', async () => {
  const user = userEvent.setup()
  renderApp()
  await user.click(screen.getByRole('link', { name: 'Öğrenci forumu bölümünü keşfet' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Öğrenci forumu' })).toBeInTheDocument()
  expect(screen.getByRole('main')).toHaveFocus()
  await user.click(screen.getByRole('link', { name: 'Ana sayfaya dön' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Birlikte daha kolay.' })).toBeInTheDocument()
})

test('supports mobile menu state, active links, selection, and Escape', async () => {
  const user = userEvent.setup()
  renderApp()
  const toggle = screen.getByRole('button', { name: 'Menüyü aç' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await user.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const navigation = screen.getByRole('navigation', { name: 'Ana menü' })
  await user.click(within(navigation).getByRole('link', { name: 'Askıda bilet' }))
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(within(navigation).getByRole('link', { name: 'Askıda bilet' })).toHaveAttribute('aria-current', 'page')
  await user.click(toggle)
  within(navigation).getByRole('link', { name: 'Ana sayfa' }).focus()
  await user.keyboard('{Escape}')
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(toggle).toHaveFocus()
})

test('shows a Turkish 404 page and a working recovery link', async () => {
  const user = userEvent.setup()
  renderApp('/olmayan/sayfa')
  expect(screen.getByRole('heading', { level: 1, name: 'Sayfa bulunamadı' })).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Bu adreste bir sayfa yok')
  await user.click(screen.getByRole('link', { name: 'Ana sayfaya dön' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Birlikte daha kolay.' })).toBeInTheDocument()
})
