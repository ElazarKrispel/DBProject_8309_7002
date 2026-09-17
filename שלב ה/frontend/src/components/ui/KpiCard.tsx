import { Card, Group, Text, ThemeIcon } from '@mantine/core'
import { IconArrowDownRight, IconArrowUpRight, type Icon } from '@tabler/icons-react'
import type { ReactNode } from 'react'

interface KpiCardProps {
  label: string
  value: ReactNode
  icon?: Icon
  color?: string
  /** Percentage change; sign decides the arrow and color. */
  delta?: number
  description?: ReactNode
}

export function KpiCard({ label, value, icon: IconCmp, color = 'emerald', delta, description }: KpiCardProps) {
  const DeltaIcon = delta !== undefined && delta < 0 ? IconArrowDownRight : IconArrowUpRight
  return (
    <Card padding="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Text fz="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.04em' }}>
            {label}
          </Text>
          <Text fz={28} fw={700} lh={1.2} mt={4} style={{ letterSpacing: '-0.02em' }}>
            {value}
          </Text>
        </div>
        {IconCmp && (
          <ThemeIcon size={40} radius="md" variant="light" color={color}>
            <IconCmp size={22} stroke={1.6} />
          </ThemeIcon>
        )}
      </Group>
      {(delta !== undefined || description) && (
        <Group gap={6} mt="sm" wrap="nowrap">
          {delta !== undefined && (
            <Text fz="xs" fw={600} c={delta < 0 ? 'red' : 'emerald'} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <DeltaIcon size={14} stroke={2} />
              {Math.abs(delta).toFixed(1)}%
            </Text>
          )}
          {description && (
            <Text fz="xs" c="dimmed" truncate>
              {description}
            </Text>
          )}
        </Group>
      )}
    </Card>
  )
}

export default KpiCard
