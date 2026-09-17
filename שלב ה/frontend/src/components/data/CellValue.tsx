import { Text, Tooltip } from '@mantine/core'
import { IconCheck, IconX } from '@tabler/icons-react'
import type { Row } from '../../api/types'
import { formatDate, formatNumber, isEmpty, type Column } from './helpers'

export function CellValue({ column, row }: { column: Column; row: Row }) {
  const value = row[column.name]
  if (isEmpty(value)) return <Text span c="dimmed" fz="xs">null</Text>
  if (column.secret) return <Text span ff="monospace">••••••••</Text>
  if (column.fk) return <Tooltip label={`ID: ${String(value)}`}><Text span fz="sm">{row._labels?.[column.name] || String(value)}</Text></Tooltip>
  if (column.type === 'bool') return value ? <IconCheck size={17} color="var(--mantine-color-emerald-6)" aria-label="True" /> : <IconX size={17} color="var(--mantine-color-gray-6)" aria-label="False" />
  if (column.type === 'date' || column.type === 'timestamp') return <Text span fz="xs" style={{ whiteSpace: 'nowrap' }}>{formatDate(value, column.type === 'timestamp')}</Text>
  if (column.type === 'int' || column.type === 'number') return <Text span fz="xs" ff="monospace">{formatNumber(value, column.type)}</Text>
  const text = String(value)
  return <Tooltip label={text} disabled={text.length < 35} multiline maw={440}><Text fz="sm" truncate maw={240}>{text}</Text></Tooltip>
}
