import { createElement, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

const KEY = 'chess_admin_token'

export function getToken(): string | null {
  return localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY)
}

/** remember=false keeps the token for the browser session only. */
export function setToken(token: string, remember = true): void {
  clearToken()
  ;(remember ? localStorage : sessionStorage).setItem(KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(KEY)
  sessionStorage.removeItem(KEY)
}

export function isAuthed(): boolean {
  return getToken() !== null
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  if (!isAuthed()) {
    return createElement(Navigate, { to: '/login', replace: true, state: { from: location.pathname } })
  }
  return children
}
