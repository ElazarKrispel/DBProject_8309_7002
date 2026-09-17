import { Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import dayjs from 'dayjs'
import { ApiError, type ColumnMeta, type Notice, type PkValue, type Row, type TableMeta } from '../../api/types'

/** The backend also sends `options` (fixed value list) which the shared ColumnMeta type does not declare. */
export type Column = ColumnMeta & { options?: string[] }

export const columnsOf = (t: TableMeta): Column[] => t.columns as Column[]

export const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === ''

export function rowPk(t: TableMeta, row: Row): PkValue {
  const pk: PkValue = {}
  for (const c of t.pk) {
    const v = row[c]
    pk[c] = typeof v === 'number' ? v : String(v ?? '')
  }
  return pk
}

/** Human label for a row: the display column, or "<Table> #key" when the display column is the key itself. */
export function rowLabel(t: TableMeta, row: Row): string {
  const v = row[t.displayColumn]
  if (t.pk.includes(t.displayColumn) || isEmpty(v)) {
    return `${t.label} #${t.pk.map((c) => String(row[c] ?? '')).join('/')}`
  }
  return String(v)
}

export const isLookupTable = (tables: TableMeta[] | undefined, key: string): boolean =>
  tables?.find((t) => t.key === key)?.group === 'Reference Data'

/** Detail page for entity rows (Player 360, Club detail). */
export function rowLink(t: TableMeta, row: Row): string | undefined {
  if (t.key === 'player') return `/players/${String(row.player_id)}`
  if (t.key === 'club') return `/clubs/${String(row.club_id)}`
  return undefined
}

export function formatDate(v: unknown, withTime: boolean): string {
  const d = dayjs(String(v))
  return d.isValid() ? d.format(withTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD') : String(v)
}

export function formatNumber(v: unknown, type: 'int' | 'number'): string {
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return String(v)
  return type === 'int' ? String(n) : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    return [err.message, err.code ? `[${err.code}]` : '', err.hint ? `Hint: ${err.hint}` : ''].filter(Boolean).join('\n')
  }
  return err instanceof Error ? err.message : String(err)
}

/** RAISE NOTICE output from triggers and procedures, surfaced as a toast. */
export function showNotices(notices: Notice[] | undefined): void {
  if (!notices?.length) return
  notifications.show({
    title: `Database notices (${notices.length})`,
    color: 'blue',
    autoClose: 10_000,
    message: (
      <Text fz="xs" ff="monospace" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {notices.map((n) => `${(n.severity || 'NOTICE').toUpperCase()}: ${n.message}`).join('\n')}
      </Text>
    ),
  })
}
