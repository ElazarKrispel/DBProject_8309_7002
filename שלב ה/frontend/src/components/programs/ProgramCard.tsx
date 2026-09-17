import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { api } from "../../api/client";
import type { Notice, Option } from "../../api/types";
import { ErrorAlert } from "../ui/ErrorAlert";
import { EmptyState } from "../ui/EmptyState";
import { NoticeConsole } from "../ui/NoticeConsole";
export interface ProgramResult {
  ok: boolean;
  elapsed_ms: number;
  notices: Notice[];
  error?: { message: string };
  [key: string]: unknown;
}
export function PlayerPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [search, setSearch] = useState("");
  const options = useQuery({
    queryKey: ["program-player-options", search],
    queryFn: () => api.get<Option[]>("/tables/player/options", { q: search }),
  });
  const selected = useQuery({
    queryKey: ["program-player", value],
    queryFn: () => api.get<{username: string; first_name: string; last_name: string}>("/tables/player/row", {player_id: value}),
  });
  const data = (options.data ?? []).map((o) => ({
    value: String(o.value),
    label: o.label,
  }));
  if (!data.some((o) => o.value === String(value)))
    data.unshift({ value: String(value), label: selected.data ? `${selected.data.username} (${selected.data.first_name} ${selected.data.last_name})` : `Player #${value}` });
  return (
    <Select
      label="Player"
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      value={String(value)}
      onChange={(v) => v && onChange(Number(v))}
      data={data}
      nothingFoundMessage="No players found"
      error={options.error?.message}
    />
  );
}
export function ProgramCard({
  name,
  description,
  endpoint,
  body,
  children,
  render,
  mutates = false,
  exception = false,
  quick,
}: {
  name: string;
  description: string;
  endpoint: string;
  body: Record<string, unknown>;
  children: ReactNode;
  render: (r: ProgramResult) => ReactNode;
  mutates?: boolean;
  exception?: boolean;
  quick?: { label: string; body: Record<string, unknown> }[];
}) {
  const [mode, setMode] = useState("preview");
  const [result, setResult] = useState<ProgramResult>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  async function run(override?: Record<string, unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      setResult(
        await api.post<ProgramResult>(`/programs/${endpoint}`, {
          ...body,
          ...override,
          ...(mutates ? { mode } : {}),
        }),
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function launch(override?: Record<string, unknown>) {
    if (mutates && mode === "apply")
      modals.openConfirmModal({
        title: "Commit changes to the database?",
        children: (
          <Text>
            Run a preview first. Applying this program permanently changes live
            records.
          </Text>
        ),
        labels: { confirm: "Apply changes", cancel: "Cancel" },
        confirmProps: { color: "red" },
        onConfirm: () => void run(override),
      });
    else void run(override);
  }
  return (
    <Card>
      <Stack>
        <div>
          <Title order={3}>
            <Code>{name}</Code>
          </Title>
          <Text c="dimmed" size="sm" mt="xs">
            {description}
          </Text>
        </div>
        {children}
        <Group justify="space-between">
          {mutates ? (
            <SegmentedControl
              value={mode}
              onChange={setMode}
              data={[
                { value: "preview", label: "Preview (rollback)" },
                { value: "apply", label: "Apply" },
              ]}
            />
          ) : (
            <Badge color="gray">Read-only function</Badge>
          )}
          <Button loading={busy} onClick={() => launch()}>
            Run {mutates ? "demo" : "function"}
          </Button>
        </Group>
        {quick && (
          <Group>
            {quick.map((q) => (
              <Button
                key={q.label}
                variant="light"
                color="orange"
                size="xs"
                disabled={busy}
                onClick={() => launch(q.body)}
              >
                {q.label}
              </Button>
            ))}
          </Group>
        )}
        {error != null && <ErrorAlert error={error} />}
        {!result ? (
          <EmptyState
            title="Ready to run"
            text="Run with the parameters above to inspect live database output."
            py={24}
          />
        ) : (
          <Stack gap="sm">
            <Group justify="space-between">
              <Badge color={result.ok ? "emerald" : "red"}>
                {result.ok ? "Completed" : "Rejected"}
              </Badge>
              <Text size="xs" c="dimmed">
                {result.elapsed_ms} ms
              </Text>
            </Group>
            {result.mode === "preview" && (
              <Alert color="blue">
                Preview complete. All changes were rolled back.
              </Alert>
            )}
            {result.mode === "apply" && (
              <Alert color="orange">Changes committed to the database.</Alert>
            )}
            {result.ok ? (
              render(result)
            ) : (
              <Alert
                color={exception ? "yellow" : "red"}
                title={
                  exception
                    ? "Function raised an exception (expected behaviour)"
                    : "Database rejected the operation"
                }
              >
                {result.error?.message ?? "Operation failed"}
              </Alert>
            )}
            <NoticeConsole notices={result.notices} />
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

