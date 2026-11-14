import { useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { sections } from '../../config/navigation'
import { Button } from '../ui/Button'

export function Navigation() {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)

  function closeMenu() {
    setOpen(false)
  }

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 px-5 py-4 sm:px-8">
        <NavLink to="/" onClick={closeMenu} aria-label="İTÜ ShareMaxxing ana sayfa" className="flex min-h-11 items-center gap-3 rounded-lg">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-brand text-xl font-bold text-white">S<span className="text-mint">↗</span></span>
          <span className="text-lg font-bold tracking-tight text-ink"><span className="text-brand">İTÜ</span> ShareMaxxing</span>
        </NavLink>
        <div className="lg:hidden">
          <Button ref={toggleRef} variant="secondary" className="px-3" aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'} aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}>
            {open ? 'Kapat' : 'Menü'}
          </Button>
        </div>
        <nav
          id="main-navigation"
          aria-label="Ana menü"
          className={`${open ? 'block' : 'hidden'} w-full pt-4 lg:block lg:w-auto lg:pt-0`}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && open) {
              closeMenu()
              toggleRef.current?.focus()
            }
          }}
        >
          <ul className="flex flex-col gap-1 lg:flex-row lg:items-center">
            {[{ path: '/', title: 'Ana sayfa' }, ...sections].map(({ path, title }) => (
              <li key={path}>
                <NavLink to={path} end={path === '/'} onClick={closeMenu} className={({ isActive }) => `flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors ${isActive ? 'bg-brand/[0.08] text-brand' : 'text-muted hover:bg-surface hover:text-ink'}`}>
                  {title}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  )
}
