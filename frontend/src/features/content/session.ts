import { useSyncExternalStore } from 'react'
import { apiRequest, ApiClientError } from '../../lib/api'
export type Student = { id: string; displayName: string; role: 'USER' | 'MODERATOR' | 'ADMIN' }
type Session = { user: Student; token: string } | null
let session: Session = null
const listeners = new Set<() => void>()
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
function publish(value: Session) { session = value; listeners.forEach(listener => listener()) }
export function clearStudentSession() { publish(null) }
export function updateStudentName(id: string, displayName: string) {
  if (session?.user.id === id) publish({ ...session, user: { ...session.user, displayName } })
}
export function useStudentSession() { return useSyncExternalStore(subscribe, () => session, () => null) }
export async function signIn(email: string, password: string) {
  const result = await apiRequest<{ accessToken: string; user: Student }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  publish({ token: result.accessToken, user: result.user })
}
export async function contentRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  try { return await apiRequest<T>(path, { ...options, token: session?.token }) }
  catch (error) {
    if (error instanceof ApiClientError && (error.status === 401 || ['ACCOUNT_SUSPENDED', 'EMAIL_NOT_VERIFIED'].includes(error.code))) clearStudentSession()
    throw error
  }
}
export function errorMessage(error: unknown) { return error instanceof ApiClientError ? error.message : 'İşlem tamamlanamadı. Lütfen tekrar deneyin.' }
