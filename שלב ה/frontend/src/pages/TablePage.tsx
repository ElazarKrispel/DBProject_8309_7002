import { ActionIcon, Badge, Button, Card, Group, Modal, Pagination, Select, Stack, Table, Text, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconKey, IconPlus, IconRefresh, IconSearch } from '@tabler/icons-react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { deleteRow, listRows, useTableMeta } from '../api/client'
import type { Row, TableMeta } from '../api/types'
import { CellValue } from '../components/data/CellValue'
import { DataTable } from '../components/data/DataTable'
import { FkSelect } from '../components/data/FkSelect'
import { RecordForm } from '../components/data/RecordForm'
import { UpdateByKey } from '../components/data/UpdateByKey'
import { columnsOf, errorText, isLookupTable, rowLabel, rowPk, showNotices } from '../components/data/helpers'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorAlert } from '../components/ui/ErrorAlert'
import { LoadingState } from '../components/ui/LoadingState'
import { PageHeader } from '../components/ui/PageHeader'

function TableScreen({ table, tables }: { table: TableMeta; tables: TableMeta[] }) {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [q] = useDebouncedValue(search, 300)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(25)
  const [sort, setSort] = useState<string>()
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [editing, setEditing] = useState<Row | null | undefined>()
  const [view, setView] = useState<Row>()
  const [updateOpen, setUpdateOpen] = useState(params.has('updateKey'))
  const cache = useQueryClient()
  const filters = Object.fromEntries([...params].filter(([name]) => table.columns.some(c => c.name === name)))
  const filterKey = JSON.stringify(filters)
  useEffect(() => { setPage(1) }, [q, size, filterKey])
  useEffect(() => { if (params.has('updateKey')) setUpdateOpen(true) }, [params])
  const query = useQuery({ queryKey: ['table', table.key, page, size, q, sort, dir, filters], queryFn: () => listRows(table.key, { page, size, q, sort, dir: sort ? dir : undefined, filters }), placeholderData: keepPreviousData })
  const total = query.data?.total ?? 0
  const closeUpdate = () => { setUpdateOpen(false); const next = new URLSearchParams(params); next.delete('updateKey'); setParams(next, { replace: true }) }
  const clear = () => { setSearch(''); setParams({}); setPage(1) }
  const remove = (row: Row) => modals.openConfirmModal({ title: 'Delete record', children: <Text size="sm">Delete {rowLabel(table, row)}? This action cannot be undone. Related records may prevent deletion.</Text>, labels: { confirm: 'Delete record', cancel: 'Cancel' }, confirmProps: { color: 'red' }, onConfirm: async () => {
    try { const result = await deleteRow(table.key, rowPk(table, row)); notifications.show({ title: 'Deleted', message: 'Record deleted successfully', color: 'emerald' }); showNotices(result.notices); await cache.invalidateQueries() } catch (e) { notifications.show({ title: 'Could not delete record', message: errorText(e), color: 'red', autoClose: false }) }
  } })
  return <><PageHeader title={<Group gap="sm">{table.label}{table.readonly && <Badge color="gray">Read-only view</Badge>}</Group>} description={`${total.toLocaleString()} records · ${table.group}`} actions={<>{!table.readonly && <><Button variant="default" leftSection={<IconKey size={16} />} onClick={() => setUpdateOpen(true)}>Update by key</Button><Button leftSection={<IconPlus size={16} />} onClick={() => setEditing(null)}>New record</Button></>}<ActionIcon variant="default" size="lg" aria-label="Refresh records" loading={query.isFetching} onClick={() => void query.refetch()}><IconRefresh size={18} /></ActionIcon></>} />
    <Card><Stack gap="md"><Group align="end"><TextInput aria-label="Search records" placeholder="Search records..." leftSection={<IconSearch size={16} />} value={search} onChange={e => setSearch(e.currentTarget.value)} style={{ flex: '1 1 220px' }} />{table.columns.filter(c => c.fk && isLookupTable(tables, c.fk.table)).slice(0, 3).map(c => <FkSelect key={c.name} label={c.label} table={c.fk!.table} value={filters[c.name] ?? null} onChange={value => { const next = new URLSearchParams(params); if (value) next.set(c.name, value); else next.delete(c.name); setParams(next) }} />)}<Select aria-label="Rows per page" label="Rows per page" w={110} data={['25', '50', '100']} value={String(size)} onChange={value => setSize(Number(value || 25))} /></Group>
    {Object.keys(filters).length > 0 && <Group gap="xs">{Object.entries(filters).map(([name, value]) => <Badge key={name} variant="outline">{table.columns.find(c => c.name === name)?.label}: {query.data?.rows.find(row => String(row[name]) === value)?._labels?.[name] || value}</Badge>)}<Button variant="subtle" size="compact-xs" onClick={clear}>Clear filters</Button></Group>}
    <ErrorAlert error={query.error} />{query.isLoading ? <LoadingState rows={10} /> : query.data?.rows.length ? <DataTable table={table} rows={query.data.rows} sort={sort} dir={dir} onSort={name => { setSort(name); setDir(sort === name && dir === 'asc' ? 'desc' : 'asc') }} onView={setView} onEdit={setEditing} onDelete={remove} /> : !query.error && <EmptyState title="No records found" text="Try another search or clear the current filters." action={<Button variant="light" onClick={clear}>Clear filters</Button>} />}
    <Group justify="space-between"><Text size="xs" c="dimmed">Showing {total ? (page - 1) * size + 1 : 0}-{Math.min(page * size, total)} of {total.toLocaleString()}</Text><Pagination total={Math.max(1, Math.ceil(total / size))} value={page} onChange={setPage} size="sm" /></Group></Stack></Card>
    {editing !== undefined && <RecordForm key={editing ? JSON.stringify(rowPk(table, editing)) : 'new'} table={table} row={editing ?? undefined} onClose={() => setEditing(undefined)} />}
    {updateOpen && !table.readonly && <UpdateByKey table={table} initialKey={params.get('updateKey') ?? undefined} onClose={closeUpdate} />}
    <Modal opened={!!view} onClose={() => setView(undefined)} title={view ? rowLabel(table, view) : 'Record'} size="lg">{view && <Table><Table.Tbody>{columnsOf(table).map(c => <Table.Tr key={c.name}><Table.Th>{c.label}</Table.Th><Table.Td><CellValue column={c} row={view} /></Table.Td></Table.Tr>)}</Table.Tbody></Table>}</Modal>
  </>
}
export default function TablePage() {
  const { key } = useParams()
  const { table, tables, error, isLoading } = useTableMeta(key)
  if (isLoading) return <LoadingState />
  if (error) return <ErrorAlert error={error} />
  if (!table) return <EmptyState title="Table not found" text="Choose a table from the navigation." />
  return <TableScreen key={table.key} table={table} tables={tables ?? []} />
}

