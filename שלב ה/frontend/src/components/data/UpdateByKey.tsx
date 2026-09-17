import { Button, Divider, Modal, NumberInput, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { getRow } from '../../api/client'
import { ApiError, type PkValue, type Row, type TableMeta } from '../../api/types'
import { ErrorAlert } from '../ui/ErrorAlert'
import { FkSelect } from './FkSelect'
import { RecordForm } from './RecordForm'

export function UpdateByKey({ table, initialKey, onClose }: { table: TableMeta; initialKey?: string; onClose: () => void }) {
  const [keys, setKeys] = useState<PkValue>(() => initialKey && table.pk.length === 1 ? { [table.pk[0]]: initialKey } : {})
  const [row, setRow] = useState<Row>()
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const load = async () => {
    setBusy(true); setError(null); setRow(undefined)
    try { setRow(await getRow(table.key, keys)) } catch (e) { setError(e instanceof ApiError && e.status === 404 ? new Error('No record with this key') : e) } finally { setBusy(false) }
  }
  return <Modal opened onClose={onClose} size="xl" title="Update by key"><Stack><Text size="sm" c="dimmed">Enter the primary key, load the existing record, then edit its fields.</Text><SimpleGrid cols={{ base: 1, sm: 2 }}>{table.columns.filter(c => c.pk).map(c => {
    const common = { key: c.name, label: c.label, required: true }
    const change = (v: string | number | null) => { setKeys(old => ({ ...old, [c.name]: v ?? '' })); setRow(undefined) }
    return c.fk ? <FkSelect {...common} table={c.fk.table} value={keys[c.name] == null ? null : String(keys[c.name])} onChange={change} /> : c.type === 'int' ? <NumberInput {...common} allowDecimal={false} value={keys[c.name] ?? ''} onChange={change} /> : <TextInput {...common} value={keys[c.name] ?? ''} onChange={e => change(e.currentTarget.value)} />
  })}</SimpleGrid><Button onClick={() => void load()} loading={busy} disabled={table.pk.some(k => keys[k] === undefined || keys[k] === '')}>Load record</Button><ErrorAlert error={error} />{row && <><Divider label="Existing record" /><RecordForm key={JSON.stringify(keys)} table={table} row={row} inline onClose={onClose} /></>}</Stack></Modal>
}
