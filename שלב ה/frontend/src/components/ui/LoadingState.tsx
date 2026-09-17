import { Skeleton, Stack } from '@mantine/core'

interface LoadingStateProps {
  rows?: number
  height?: number
}

export function LoadingState({ rows = 6, height = 36 }: LoadingStateProps) {
  return (
    <Stack gap="xs" py="xs">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} radius="sm" />
      ))}
    </Stack>
  )
}

export default LoadingState
