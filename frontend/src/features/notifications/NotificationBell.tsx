import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { contentRequest, errorMessage, useStudentSession } from '../content/session'
import { formatDateTime } from '../trips/format'

type NotificationItem = {
  id: string
  recipientId: string
  kind: string
  text: string
  link: string | null
  isRead: boolean
  readAt: string | null
  createdAt: string
}

type NotificationListResponse = {
  notifications: NotificationItem[]
  unreadCount: number
  page: number
  hasMore: boolean
}

export function NotificationBell({ onNavigate }: { onNavigate?: () => void }) {
  const session = useStudentSession()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyAll, setBusyAll] = useState(false)

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await contentRequest<NotificationListResponse>('/notifications')
      setNotifications(data.notifications)
      setUnreadCount(data.unreadCount)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setOpen(false)
      setNotifications([])
      setUnreadCount(0)
      setError('')
      setLoading(false)
      return
    }
    if (pathname === '/') {
      void loadNotifications()
    }
  }, [session, pathname, loadNotifications])

  if (!session) return null

  async function handleReadOne(id: string) {
    setBusyId(id)
    setError('')
    try {
      const data = await contentRequest<{ notification: NotificationItem; unreadCount: number }>(`/notifications/${id}/read`, {
        method: 'POST',
      })
      setNotifications((prev) => prev.map((item) => (item.id === id ? data.notification : item)))
      setUnreadCount(data.unreadCount)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleReadAll() {
    setBusyAll(true)
    setError('')
    try {
      const data = await contentRequest<{ updatedCount: number; unreadCount: number }>('/notifications/read-all', {
        method: 'POST',
      })
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })))
      setUnreadCount(data.unreadCount)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusyAll(false)
    }
  }

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next) {
      void loadNotifications()
    }
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        aria-label="Bildirimler"
        aria-expanded={open}
        aria-controls="notification-panel"
        className="w-full justify-start lg:w-auto lg:justify-center"
        onClick={handleToggle}
      >
        <span aria-hidden="true">🔔</span>
        <span>Bildirimler</span>
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} okunmamış bildirim`}
            className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white"
          >
            {unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <section
          id="notification-panel"
          aria-label="Bildirim listesi"
          className="mt-2 w-full rounded-2xl border border-line bg-white p-4 shadow-lg lg:absolute lg:right-0 lg:z-30 lg:w-96"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-ink">Bildirimler</h2>
            {unreadCount > 0 && (
              <Button variant="secondary" className="min-h-11 px-3 py-1.5 text-xs" loading={busyAll} onClick={() => { void handleReadAll() }}>
                Tümünü okundu işaretle
              </Button>
            )}
          </div>

          {loading && <p role="status" className="text-sm text-muted">Yükleniyor…</p>}

          {error && (
            <div className="space-y-3">
              <Alert variant="error" title="Bildirimler yüklenemedi">{error}</Alert>
              <Button variant="secondary" onClick={() => { void loadNotifications() }}>Tekrar dene</Button>
            </div>
          )}

          {!loading && !error && !notifications.length && (
            <p role="status" className="text-sm text-muted">Henüz bildiriminiz yok.</p>
          )}

          {!error && notifications.length > 0 && (
            <ul className="max-h-96 space-y-3 overflow-y-auto">
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className={`rounded-xl border p-3 text-sm ${notification.isRead ? 'border-line bg-white' : 'border-brand/30 bg-surface'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted">{formatDateTime(notification.createdAt)}</span>
                    {!notification.isRead && (
                      <span className="rounded bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">Yeni</span>
                    )}
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-ink">{notification.text}</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-3">
                    {notification.link && (
                      <Link
                        to={notification.link}
                        className="text-sm font-medium text-brand underline"
                        onClick={() => {
                          setOpen(false)
                          onNavigate?.()
                        }}
                      >
                        İlgili sayfaya git
                      </Link>
                    )}
                    {!notification.isRead && (
                      <Button
                        variant="secondary"
                        className="min-h-11 px-3 py-1.5 text-xs"
                        loading={busyId === notification.id}
                        disabled={busyAll}
                        onClick={() => { void handleReadOne(notification.id) }}
                      >
                        Okundu işaretle
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
