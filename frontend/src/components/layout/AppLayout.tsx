import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { sections } from '../../config/navigation'
import { Navigation } from './Navigation'

export function AppLayout() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)

  useEffect(() => {
    const title = pathname === '/' ? 'Ana sayfa' : sections.find((section) => section.path === pathname)?.title ?? 'Sayfa bulunamadı'
    document.title = `${title} | İTÜ ShareMaxxing`
    if (previousPath.current !== pathname) {
      mainRef.current?.focus()
      window.scrollTo({ top: 0 })
    }
    previousPath.current = pathname
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main-content" className="skip-link">İçeriğe geç</a>
      <Navigation />
      <main id="main-content" ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
        <Outlet />
      </main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="font-semibold text-ink">İTÜ ShareMaxxing</p>
          <p>İTÜ’lüler arasında, dayanışmayla.</p>
        </div>
      </footer>
    </div>
  )
}
