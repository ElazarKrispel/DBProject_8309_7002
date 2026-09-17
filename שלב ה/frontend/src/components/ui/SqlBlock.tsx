import { Box, Text } from '@mantine/core'
import { CodeHighlight } from '@mantine/code-highlight'

interface SqlBlockProps {
  sql: string
  title?: string
  /** Collapse long statements behind an expand button. */
  collapsible?: boolean
}

// ponytail: no syntax highlighting adapter registered (plain mono). Add highlight.js + CodeHighlightAdapterProvider in main.tsx if colors matter.
export function SqlBlock({ sql, title, collapsible = false }: SqlBlockProps) {
  return (
    <Box>
      {title && (
        <Text fz="xs" fw={600} c="dimmed" tt="uppercase" mb={4} style={{ letterSpacing: '0.04em' }}>
          {title}
        </Text>
      )}
      <CodeHighlight
        code={sql.trim()}
        language="sql"
        radius="md"
        withCopyButton
        copyLabel="Copy SQL"
        copiedLabel="Copied"
        withExpandButton={collapsible}
        defaultExpanded={!collapsible}
        maxCollapsedHeight={180}
        styles={{ code: { fontSize: 'var(--mantine-font-size-xs)', lineHeight: 1.55 } }}
      />
    </Box>
  )
}

export default SqlBlock
