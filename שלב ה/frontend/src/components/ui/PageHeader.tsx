import { Anchor, Breadcrumbs, Group, Stack, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface Crumb {
  label: string
  to?: string
}

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Right-side slot for buttons and controls. */
  actions?: ReactNode
  breadcrumbs?: Crumb[]
}

export function PageHeader({ title, description, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <Stack gap="xs" mb="lg">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs separatorMargin="xs" fz="sm">
          {breadcrumbs.map((c, i) =>
            c.to ? (
              <Anchor key={i} component={Link} to={c.to} c="dimmed" fz="sm">
                {c.label}
              </Anchor>
            ) : (
              <Text key={i} fz="sm" c="dimmed">
                {c.label}
              </Text>
            ),
          )}
        </Breadcrumbs>
      )}
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <div>
          <Title order={1}>{title}</Title>
          {description && (
            <Text c="dimmed" fz="sm" mt={4} maw={720}>
              {description}
            </Text>
          )}
        </div>
        {actions && <Group gap="sm">{actions}</Group>}
      </Group>
    </Stack>
  )
}

export default PageHeader
