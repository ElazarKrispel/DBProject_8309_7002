import { Badge, Box, Group, ScrollArea, Text } from '@mantine/core'
import type { Notice } from '../../api/types'

interface NoticeConsoleProps {
  notices: Notice[] | undefined
  title?: string
  maxHeight?: number
}

const SEVERITY_COLOR: Record<string, string> = {
  NOTICE: 'emerald',
  INFO: 'blue',
  LOG: 'gray',
  DEBUG: 'gray',
  WARNING: 'yellow',
  EXCEPTION: 'red',
  ERROR: 'red',
}

/** Terminal-like panel for RAISE NOTICE / WARNING output captured by the backend. */
export function NoticeConsole({ notices, title = 'Server notices', maxHeight = 240 }: NoticeConsoleProps) {
  const items = notices ?? []
  return (
    <Box
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        border: '1px solid var(--mantine-color-default-border)',
        background: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))',
        overflow: 'hidden',
      }}
    >
      <Group
        justify="space-between"
        px="sm"
        py={6}
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Text fz="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.04em' }}>
          {title}
        </Text>
        <Badge size="xs" variant="default">
          {items.length}
        </Badge>
      </Group>
      <ScrollArea.Autosize mah={maxHeight} type="auto">
        <Box px="sm" py="xs" ff="monospace" fz="xs">
          {items.length === 0 ? (
            <Text c="dimmed" fz="xs" ff="monospace">
              No notices
            </Text>
          ) : (
            items.map((n, i) => {
              const sev = (n.severity || 'NOTICE').toUpperCase()
              return (
                <Group key={i} gap="xs" align="flex-start" wrap="nowrap" py={2}>
                  <Badge size="xs" variant="light" color={SEVERITY_COLOR[sev] ?? 'gray'} miw={72} style={{ flexShrink: 0 }}>
                    {sev}
                  </Badge>
                  <Text fz="xs" ff="monospace" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {n.message}
                  </Text>
                </Group>
              )
            })
          )}
        </Box>
      </ScrollArea.Autosize>
    </Box>
  )
}

export default NoticeConsole
