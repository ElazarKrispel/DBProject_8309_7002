import { useQuery } from '@tanstack/react-query'
import { clearToken, getToken } from '../auth'
import {
  ApiError,
  type ActivityScoreBody,
  type ActivityScoreResult,
  type BillingCycleBody,
  type BillingCycleResult,
  type ClubReportBody,
  type ClubReportResult,
  type DashboardData,
  type DeleteResult,
  type ListParams,
  type ListResponse,
  type LoginResponse,
  type MutationResult,
  type Option,
  type PkValue,
  type ProgramsHealth,
  type QueryDef,
  type QueryRunBody,
  type QueryRunResult,
  type Row,
  type SecurityReviewBody,
  type SecurityReviewResult,
  type SqlBody,
  type SqlResult,
  type TableMeta,
  type TriggerBanCascadeBody,
  type TriggerDemoResult,
  type TriggerLoginInsertBody,
  type TriggerRatingJumpBody,
} from './types'

const BASE = '/api'

type Query = Record<string, string | number | boolean | null | undefined>

function qs(query?: Query): string {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

interface Detail {
  message?: string
  code?: string
  hint?: string
}

async function toError(res: Response): Promise<ApiError> {
  let detail: Detail | string | undefined
  try {
    const json = (await res.json()) as { detail?: Detail | string }
    detail = json.detail
  } catch {
    detail = undefined
  }
  if (typeof detail === 'string') return new ApiError(detail, res.status)
  return new ApiError(detail?.message ?? `Request failed (${res.status})`, res.status, detail?.code, detail?.hint)
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(BASE + path + qs(query), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 401 && path !== '/auth/login') {
    clearToken()
    if (window.location.pathname !== '/login') window.location.assign('/login')
    throw new ApiError('Session expired, please sign in again', 401)
  }
  if (!res.ok) throw await toError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>('POST', path, body, query),
  put: <T>(path: string, body?: unknown, query?: Query) => request<T>('PUT', path, body, query),
  del: <T>(path: string, query?: Query) => request<T>('DELETE', path, undefined, query),
}

// Auth
export const login = (username: string, password: string) =>
  api.post<LoginResponse>('/auth/login', { username, password })

// Meta
export const getMeta = () => api.get<TableMeta[]>('/meta/tables')

// Generic CRUD
export const listRows = (table: string, params: ListParams = {}) => {
  const { filters, ...rest } = params
  return api.get<ListResponse>(`/tables/${table}`, { ...filters, ...rest })
}
export const getRow = (table: string, pk: PkValue) => api.get<Row>(`/tables/${table}/row`, pk)
export const createRow = (table: string, row: Row) => api.post<MutationResult>(`/tables/${table}`, row)
export const updateRow = (table: string, pk: PkValue, row: Row) =>
  api.put<MutationResult>(`/tables/${table}`, row, pk)
export const deleteRow = (table: string, pk: PkValue) => api.del<DeleteResult>(`/tables/${table}`, pk)
export const getOptions = (table: string, q = '', limit = 50) =>
  api.get<Option[]>(`/tables/${table}/options`, { q, limit })

// Queries (Q1-Q8, U1-U3, D1-D3)
export const getQueries = () => api.get<QueryDef[]>('/queries')
export const runQuery = (id: string, body: QueryRunBody) => api.post<QueryRunResult>(`/queries/${id}/run`, body)

// Dashboard and SQL console
export const getDashboard = () => api.get<DashboardData>('/dashboard')
export const runSql = (body: SqlBody) => api.post<SqlResult>('/sql', body)

// Programs (Stage 4 objects)
export const programsHealth = () => api.get<ProgramsHealth>('/programs/health')
export const activityScore = (body: ActivityScoreBody) =>
  api.post<ActivityScoreResult>('/programs/activity-score', body)
export const clubReport = (body: ClubReportBody) => api.post<ClubReportResult>('/programs/club-report', body)
export const billingCycle = (body: BillingCycleBody) => api.post<BillingCycleResult>('/programs/billing-cycle', body)
export const securityReview = (body: SecurityReviewBody) =>
  api.post<SecurityReviewResult>('/programs/security-review', body)
export const triggerRatingJump = (body: TriggerRatingJumpBody) =>
  api.post<TriggerDemoResult>('/programs/trigger/rating-jump', body)
export const triggerBanCascade = (body: TriggerBanCascadeBody) =>
  api.post<TriggerDemoResult>('/programs/trigger/ban-cascade', body)
export const triggerLoginInsert = (body: TriggerLoginInsertBody) =>
  api.post<TriggerDemoResult>('/programs/trigger/login-insert', body)

// Hooks
export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: getMeta, staleTime: Infinity })
}

/** Finds one table in the meta registry. `table` is undefined while loading or if the key is unknown. */
export function useTableMeta(key: string | undefined) {
  const meta = useMeta()
  const table = key ? meta.data?.find((t) => t.key === key) : undefined
  return { table, isLoading: meta.isLoading, error: meta.error, tables: meta.data }
}
