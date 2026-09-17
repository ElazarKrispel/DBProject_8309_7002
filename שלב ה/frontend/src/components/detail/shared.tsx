import { Anchor, Badge, ScrollArea, Table, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { Row, Notice } from "../../api/types";
export interface Result {
  ok: boolean;
  columns: string[];
  rows: Row[];
  rowcount: number;
  elapsed_ms: number;
  notices: Notice[];
  truncated?: boolean;
  readonly?: boolean;
  error?: { message: string; code?: string; hint?: string; detail?: string };
}
export const value = (v: unknown): string =>
  v == null ? "Not set" : typeof v === "object" ? JSON.stringify(v) : String(v);
export const label = (row: Row, key: string) =>
  row._labels?.[key] || value(row[key]);
export const linked = (v: unknown, url: string) => (
  <Anchor component={Link} to={url} size="sm">
    {value(v)}
  </Anchor>
);
export const status = (v: unknown) => (
  <Badge
    color={
      v === "banned" || v === "failed"
        ? "red"
        : v === "suspended" || v === "pending"
          ? "yellow"
          : "emerald"
    }
  >
    {value(v)}
  </Badge>
);
export function DataGrid({
  rows,
  columns,
}: {
  rows: Row[];
  columns: { label: string; render: (row: Row) => ReactNode }[];
}) {
  return rows.length ? (
    <ScrollArea mah={540} type="auto" offsetScrollbars>
      <Table miw={650} stickyHeader>
        <Table.Thead>
          <Table.Tr>
            {columns.map((c) => (
              <Table.Th key={c.label}>{c.label}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r, i) => (
            <Table.Tr key={i}>
              {columns.map((c) => (
                <Table.Td key={c.label}>{c.render(r)}</Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  ) : (
    <Text c="dimmed" py="lg" ta="center">
      No records to display.
    </Text>
  );
}
