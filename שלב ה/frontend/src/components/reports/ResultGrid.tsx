import {
  Badge,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
export interface GridData {
  columns: string[];
  rows: Record<string, unknown>[];
}
export function ResultGrid({
  grid,
  compare,
}: {
  grid: GridData;
  compare?: GridData;
}) {
  if (!grid.rows.length)
    return (
      <Text c="dimmed" size="sm" py="md">
        No matching rows.
      </Text>
    );
  return (
    <ScrollArea.Autosize mah={440}>
      <Table stickyHeader striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            {grid.columns.map((c) => (
              <Table.Th key={c} style={{ whiteSpace: "nowrap" }}>
                {c.replaceAll("_", " ")}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {grid.rows.map((r, i) => (
            <Table.Tr key={i}>
              {grid.columns.map((c) => {
                const v = r[c];
                const changed = compare?.rows[i] && compare.rows[i][c] !== v;
                return (
                  <Table.Td
                    key={c}
                    ta={typeof v === "number" ? "right" : undefined}
                    style={{
                      whiteSpace: "nowrap",
                      background: changed
                        ? "var(--mantine-color-yellow-light)"
                        : undefined,
                      fontWeight: changed ? 700 : undefined,
                    }}
                  >
                    {v == null ? (
                      <Text span c="dimmed">
                        NULL
                      </Text>
                    ) : typeof v === "boolean" ? (
                      v ? (
                        <IconCheck size={16} aria-label="Yes" />
                      ) : (
                        <IconX size={16} aria-label="No" />
                      )
                    ) : typeof v === "object" ? (
                      JSON.stringify(v)
                    ) : (
                      String(v)
                    )}
                  </Table.Td>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea.Autosize>
  );
}
export function Comparison({
  before,
  after,
  title,
}: {
  before: GridData;
  after: GridData;
  title?: string;
}) {
  return (
    <Stack gap="xs">
      {title && <Text fw={600}>{title}</Text>}
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Stack gap="xs">
          <Badge color="gray">Before</Badge>
          <ResultGrid grid={before} />
        </Stack>
        <Stack gap="xs">
          <Badge>After</Badge>
          <ResultGrid grid={after} compare={before} />
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}
