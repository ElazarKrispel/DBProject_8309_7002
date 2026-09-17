// Types for the Stage 5 API contract (see plan: "API contract").

export type ColumnType = 'int' | 'number' | 'text' | 'date' | 'timestamp' | 'bool'

export interface ColumnMeta {
  name: string
  label: string
  type: ColumnType
  nullable: boolean
  pk: boolean
  auto: boolean
  fk?: { table: string; column: string }
  secret?: boolean
  maxLength?: number
}

export interface TableMeta {
  key: string
  label: string
  group: string
  icon: string
  pk: string[]
  readonly: boolean
  columns: ColumnMeta[]
  displayColumn: string
  searchColumns: string[]
}

/** A generic row: column name -> value, plus resolved FK labels. */
export type Row = Record<string, unknown> & { _labels?: Record<string, string> }

/** Primary key as column -> value (supports composite keys). */
export type PkValue = Record<string, string | number>

export interface ListParams {
  page?: number
  size?: number
  q?: string
  sort?: string
  dir?: 'asc' | 'desc'
  /** Column equality filters, sent as <col>=<value>. */
  filters?: Record<string, string | number | boolean>
}

export interface ListResponse {
  rows: Row[]
  total: number
  page: number
  size: number
}

export interface Option {
  value: string | number
  label: string
}

export interface Notice {
  severity: string
  message: string
}

export interface MutationResult {
  row: Row
  notices: Notice[]
}

export interface DeleteResult {
  deleted: number
  notices: Notice[]
}

export type RunMode = 'preview' | 'apply'
export type VariantKey = 'A' | 'B'

export interface QueryParam {
  name: string
  label: string
  type: ColumnType
  default?: unknown
  options?: Option[]
}

export interface QueryVariant {
  key: VariantKey
  label: string
  sql: string
  note?: string
}

export interface QueryDef {
  id: string
  title: string
  description: string
  screen: string
  kind: 'select' | 'update' | 'delete'
  params: QueryParam[]
  variants: QueryVariant[]
}

export interface QueryRunBody {
  params: Record<string, unknown>
  variant: VariantKey
  mode: RunMode
}

/** Tabular result: columns in order, rows keyed by column name. */
export interface TabularResult {
  columns: string[]
  rows: Row[]
}

export interface QueryRunResult extends TabularResult {
  rowcount: number
  elapsed_ms: number
  sql: string
  before?: Row[]
  after?: Row[]
  notices: Notice[]
}

export interface SqlBody {
  sql: string
  mode: RunMode
}

export interface SqlError {
  message: string
  code?: string
  hint?: string
}

export interface SqlResult extends TabularResult {
  rowcount: number
  elapsed_ms: number
  notices: Notice[]
  error?: SqlError
}

// Programs (Stage 4 functions, procedures, triggers)

export interface ProgramsHealth {
  ok: boolean
  [key: string]: unknown
}

export interface ActivityScoreBody {
  player_id: number
  days_back: number
}
export interface ActivityScoreResult {
  score: number
  notices: Notice[]
}

export interface ClubReportBody {
  country: string | null
  min_members: number
}
export interface ClubReportResult extends TabularResult {
  notices: Notice[]
}

export interface BillingCycleBody {
  as_of: string
  limit: number
  mode: RunMode
}
export interface BillingCycleResult {
  renewed: number
  expired: number
  notices: Notice[]
  before: Row[]
  after: Row[]
}

export interface SecurityReviewBody {
  days_back: number
  min_logins: number
  threshold_pct: number
  mode: RunMode
}
export interface SecuritySnapshot {
  players: Row[]
  memberships: Row[]
}
export interface SecurityReviewResult {
  notices: Notice[]
  before: SecuritySnapshot
  after: SecuritySnapshot
}

export interface TriggerRatingJumpBody {
  player_id: number
  delta: number
  mode: RunMode
}
export interface TriggerBanCascadeBody {
  player_id: number
  mode: RunMode
}
export interface TriggerLoginInsertBody {
  payload: Row
  mode: RunMode
}
export interface TriggerDemoResult {
  ok: boolean
  error?: SqlError
  notices: Notice[]
  before?: Row | Row[]
  after?: Row | Row[]
}

// Dashboard

export interface DashboardKpis {
  players_total: number
  players_active: number
  clubs: number
  active_memberships: number
  active_subscriptions: number
  logins_total: number
  suspicious_pct: number
  engines: number
  nodes: number
}

export interface LoginsByMonth {
  month: string
  total: number
  failed: number
  suspicious: number
}

/** Generic chart point: category label + numeric value. */
export interface ChartPoint {
  label: string
  value: number
}

export interface DashboardData {
  kpis: DashboardKpis
  charts: {
    logins_by_month: LoginsByMonth[]
    rating_buckets: ChartPoint[]
    top_tiers: ChartPoint[]
    players_by_country: ChartPoint[]
    players_by_status: ChartPoint[]
  }
}

export interface LoginResponse {
  token: string
}

/** Thrown by the API client for any non-2xx response (except 401, which redirects). */
export class ApiError extends Error {
  status: number
  code?: string
  hint?: string

  constructor(message: string, status: number, code?: string, hint?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.hint = hint
  }
}
