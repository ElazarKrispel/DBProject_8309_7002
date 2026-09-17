import { Button, Group, Modal, NumberInput, PasswordInput, Select, SimpleGrid, Stack, Switch, Textarea, TextInput } from '@mantine/core'
import { DateInput, DateTimePicker } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createRow, updateRow } from '../../api/client'
import type { Row, TableMeta } from '../../api/types'
import { ErrorAlert } from '../ui/ErrorAlert'
import { FkSelect } from './FkSelect'
import { columnsOf, rowPk, showNotices } from './helpers'

interface Props { table: TableMeta; row?: Row; opened?: boolean; inline?: boolean; onClose: () => void; onSaved?: () => void }
export function RecordForm({ table, row, opened = true, inline = false, onClose, onSaved }: Props) {
  const [values, setValues] = useState<Row>(() => row ? { ...row } : {})
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const cache = useQueryClient()
  const set = (name: string, value: unknown) => setValues(old => ({ ...old, [name]: value }))
  const save = async () => {
    setBusy(true); setError(null)
    const body: Row = {}
    for (const c of columnsOf(table)) {
      if (c.pk && (row || c.auto)) continue
      const v = values[c.name]
      body[c.name] = v === undefined || v === '' ? (c.type === 'bool' && !c.nullable ? false : null) : v
    }
    try {
      const result = row ? await updateRow(table.key, rowPk(table, row), body) : await createRow(table.key, body)
      await cache.invalidateQueries()
      notifications.show({ title: 'Saved', message: `${table.label} record saved successfully`, color: 'emerald' })
      showNotices(result.notices); onSaved?.(); onClose()
    } catch (e) { setError(e) } finally { setBusy(false) }
  }
  const content = <form onSubmit={e => { e.preventDefault(); void save() }}><Stack gap="md"><ErrorAlert error={error} /><SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">{columnsOf(table).map(c => {
    const v = values[c.name]
    const common = { label: c.label, required: !c.nullable && !c.auto, disabled: busy || (!!row && c.pk), key: c.name }
    if (!row && c.pk && c.auto) return <TextInput key={c.name} label={c.label} disabled placeholder="auto (next id)" />
    if (c.fk) return <FkSelect {...common} table={c.fk.table} value={v == null ? null : String(v)} currentLabel={row?._labels?.[c.name]} onChange={value => set(c.name, value)} />
    if (c.options) return <Select {...common} data={c.options} value={v == null ? null : String(v)} onChange={value => set(c.name, value)} clearable={c.nullable} />
    if (c.type === 'bool') return c.nullable ? <Select {...common} data={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} clearable value={v == null ? null : String(v)} onChange={value => set(c.name, value === null ? null : value === 'true')} /> : <Switch {...common} required={false} mt="lg" checked={Boolean(v)} onChange={e => set(c.name, e.currentTarget.checked)} />
    if (c.type === 'int' || c.type === 'number') return <NumberInput {...common} value={typeof v === 'number' || typeof v === 'string' ? v : ''} onChange={value => set(c.name, value)} allowDecimal={c.type !== 'int'} decimalScale={c.type === 'number' ? 2 : 0} />
    if (c.type === 'date') return <DateInput {...common} value={v ? String(v).slice(0, 10) : null} onChange={value => set(c.name, value)} valueFormat="YYYY-MM-DD" clearable={c.nullable} />
    if (c.type === 'timestamp') return <DateTimePicker {...common} value={v ? String(v).replace('T', ' ').slice(0, 19) : null} onChange={value => set(c.name, value)} valueFormat="YYYY-MM-DD HH:mm" clearable={c.nullable} />
    const props = { ...common, value: v == null ? '' : String(v), maxLength: c.maxLength, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(c.name, e.currentTarget.value) }
    return c.secret ? <PasswordInput {...props} /> : (c.maxLength ?? 0) > 200 ? <Textarea {...props} /> : <TextInput {...props} />
  })}</SimpleGrid><Group justify="flex-end"><Button variant="default" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" loading={busy}>Save record</Button></Group></Stack></form>
  return inline ? content : <Modal opened={opened} onClose={onClose} title={row ? `Edit ${table.label} record` : `New ${table.label} record`} size="xl" closeOnClickOutside={!busy}>{content}</Modal>
}

