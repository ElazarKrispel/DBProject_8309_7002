import { Loader, Select } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getOptions } from '../../api/client'

interface Props { table: string; value: string | null; onChange: (value: string | null) => void; label: string; currentLabel?: string; required?: boolean; disabled?: boolean }
export function FkSelect({ table, value, onChange, label, currentLabel, required, disabled }: Props) {
  const [search, setSearch] = useState('')
  const [q] = useDebouncedValue(search, 300)
  const query = useQuery({ queryKey: ['options', table, q], queryFn: () => getOptions(table, q), staleTime: 30_000 })
  const data = (query.data ?? []).map(o => ({ value: String(o.value), label: o.label }))
  if (value && !data.some(o => o.value === value)) data.unshift({ value, label: currentLabel || value })
  return <Select label={label} required={required} disabled={disabled} searchable clearable={!required} value={value} onChange={onChange} searchValue={search} onSearchChange={setSearch} data={data} filter={({ options }) => options} nothingFoundMessage={query.isFetching ? 'Loading options...' : 'No matches'} rightSection={query.isFetching ? <Loader size={14} /> : undefined} error={query.error?.message} comboboxProps={{ withinPortal: true }} />
}
