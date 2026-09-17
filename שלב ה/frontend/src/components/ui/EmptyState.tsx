import { Center, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconDatabaseOff, type Icon } from '@tabler/icons-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: Icon
  title: string
  text?: ReactNode
  action?: ReactNode
  py?: number | string
}

export function EmptyState({ icon: IconCmp = IconDatabaseOff, title, text, action, py = 48 }: EmptyStateProps) {
  return (
    <Center py={py}>
      <Stack align="center" gap="xs" maw={420}>
        <ThemeIcon size={48} radius="xl" variant="light" color="gray">
          <IconCmp size={26} stroke={1.6} />
        </ThemeIcon>
        <Text fw={600} mt="xs">
          {title}
        </Text>
        {text && (
          <Text c="dimmed" fz="sm" ta="center">
            {text}
          </Text>
        )}
        {action && <div style={{ marginTop: 8 }}>{action}</div>}
      </Stack>
    </Center>
  )
}

export default EmptyState
