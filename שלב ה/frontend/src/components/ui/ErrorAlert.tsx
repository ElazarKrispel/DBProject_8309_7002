import { Alert, Badge, Group, Text } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { ApiError } from '../../api/types'

interface ErrorAlertProps {
  error: unknown
  title?: string
  onClose?: () => void
}

/** Renders any thrown value; ApiError gets message + SQLSTATE code badge + hint. */
export function ErrorAlert({ error, title = 'Request failed', onClose }: ErrorAlertProps) {
  if (!error) return null
  const api = error instanceof ApiError ? error : undefined
  const message = error instanceof Error ? error.message : String(error)

  return (
    <Alert
      color="red"
      variant="light"
      icon={<IconAlertCircle size={18} />}
      title={
        <Group gap="xs">
          <span>{title}</span>
          {api?.code && (
            <Badge color="red" variant="outline" size="xs" ff="monospace">
              {api.code}
            </Badge>
          )}
        </Group>
      }
      withCloseButton={!!onClose}
      onClose={onClose}
    >
      <Text ff="monospace" fz="xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {message}
      </Text>
      {api?.hint && (
        <Text fz="xs" mt="xs" c="dimmed">
          Hint: {api.hint}
        </Text>
      )}
    </Alert>
  )
}

export default ErrorAlert
