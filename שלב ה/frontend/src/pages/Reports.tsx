import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { BarChart, LineChart } from "@mantine/charts";
import { modals } from "@mantine/modals";
import { IconPlayerPlay } from "@tabler/icons-react";
import { api } from "../api/client";
import type { Notice } from "../api/types";
import { PageHeader } from "../components/ui/PageHeader";
import { ErrorAlert } from "../components/ui/ErrorAlert";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingState } from "../components/ui/LoadingState";
import { SqlBlock } from "../components/ui/SqlBlock";
import { NoticeConsole } from "../components/ui/NoticeConsole";
import { Comparison, ResultGrid } from "../components/reports/ResultGrid";
import type { GridData } from "../components/reports/ResultGrid";
interface Definition {
  id: string;
  title: string;
  description: string;
  screen: string;
  kind: string;
  tables: string[];
  params: {
    name: string;
    label: string;
    type: string;
    default?: string | number;
    min?: number;
    max?: number;
    help?: string;
    options?: { value: string; label: string }[];
  }[];
  variants: { key: string; label: string; sql: string; note?: string }[];
  chart?: { type: string; x: string | string[]; series: string[] };
}
interface Result extends GridData {
  kind: string;
  rowcount: number;
  elapsed_ms: number;
  sql: string;
  notices: Notice[];
  affected?: number;
  before?: GridData;
  after?: GridData;
  sample?: GridData;
  truncated?: boolean;
  mode?: string;
}
function QueryPanel({ query }: { query: Definition }) {
  const [params, setParams] = useState<Record<string, unknown>>(
    Object.fromEntries(query.params.map((p) => [p.name, p.default])),
  );
  const [variant, setVariant] = useState("A");
  const [mode, setMode] = useState("preview");
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const selected =
    query.variants.find((v) => v.key === variant) ?? query.variants[0];
  async function run() {
    setBusy(true);
    setError(undefined);
    try {
      setResult(
        await api.post<Result>(`/queries/${query.id}/run`, {
          params,
          variant,
          mode,
        }),
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const launch = () =>
    mode === "apply" && query.kind !== "select"
      ? modals.openConfirmModal({
          title: "Apply database changes?",
          children: (
            <Text>
              This commits {query.title.toLowerCase()} to the live database.
              Review the preview first.
            </Text>
          ),
          labels: { confirm: "Apply changes", cancel: "Cancel" },
          confirmProps: { color: "red" },
          onConfirm: run,
        })
      : void run();
  const hint = query.chart;
  const ys = hint ? hint.series : [];
  const chartRows =
    result?.rows?.map((r) => ({
      ...r,
      chart_label: hint
        ? Array.isArray(hint.x)
          ? hint.x.map((k) => r[k]).join("-")
          : String(r[hint.x])
        : "",
    })) ?? [];
  if (hint?.type === "line") chartRows.reverse();
  return (
    <Stack>
      <Card>
        <Stack>
          <Group>
            <Badge>{query.id.toUpperCase()}</Badge>
            <Title order={2}>{query.title}</Title>
          </Group>
          <Text c="dimmed" size="sm">
            {query.description}
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {query.params.map((p) => {
              const common = {

                label: p.label,
                description: p.help,
              };
              const change = (value: unknown) =>
                setParams((x) => ({ ...x, [p.name]: value }));
              return p.type === "int" || p.type === "number" ? (
                <NumberInput
                  key={p.name} {...common}
                  value={params[p.name] as number}
                  min={p.min}
                  max={p.max}
                  onChange={change}
                />
              ) : p.type === "select" ? (
                <Select
                  key={p.name} {...common}
                  data={p.options}
                  value={String(params[p.name])}
                  onChange={change}
                />
              ) : p.type === "date" ? (
                <DateInput
                  key={p.name} {...common}
                  value={params[p.name] as string}
                  onChange={change}
                  valueFormat="YYYY-MM-DD"
                />
              ) : (
                <TextInput
                  key={p.name} {...common}
                  value={String(params[p.name] ?? "")}
                  onChange={(e) => change(e.currentTarget.value)}
                />
              );
            })}
          </SimpleGrid>
          {query.variants.length > 1 && (
            <SegmentedControl
              value={variant}
              onChange={setVariant}
              data={query.variants.map((v) => ({
                value: v.key,
                label: `${v.key}: ${v.label}`,
              }))}
            />
          )}
          <Accordion variant="contained"><Accordion.Item value="query-sql"><Accordion.Control>Query SQL: variant {variant}</Accordion.Control><Accordion.Panel><SqlBlock sql={selected.sql} collapsible /></Accordion.Panel></Accordion.Item></Accordion>
          {selected.note && (
            <Accordion variant="contained">
              <Accordion.Item value="note">
                <Accordion.Control>{query.variants.length > 1 ? "Why is one form faster?" : "Query notes"}</Accordion.Control>
                <Accordion.Panel>
                  <Alert color="blue">{selected.note}</Alert>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          )}
          <Group justify="space-between">
            {query.kind !== "select" ? (
              <SegmentedControl
                value={mode}
                onChange={setMode}
                data={[
                  { value: "preview", label: "Preview (rollback)" },
                  { value: "apply", label: "Apply" },
                ]}
              />
            ) : (
              <Text size="xs" c="dimmed">
                Read-only query
              </Text>
            )}
            <Button
              loading={busy}
              leftSection={<IconPlayerPlay size={16} />}
              onClick={launch}
            >
              Run query
            </Button>
          </Group>
        </Stack>
      </Card>
      {error != null && <ErrorAlert error={error} />}
      <Card>
        {!result ? (
          <EmptyState
            title="Ready to run"
            text="Choose parameters and run the query to inspect live results."
          />
        ) : (
          <Stack>
            <Group justify="space-between">
              <Title order={3}>Results</Title>
              <Badge variant="default">
                {result.kind === "select"
                  ? `${result.rowcount} rows`
                  : `${result.affected} affected`}{" "}
                · {result.elapsed_ms} ms
              </Badge>
            </Group>
            {result.mode && (
              <Alert color={result.mode === "preview" ? "blue" : "orange"}>
                {result.mode === "preview"
                  ? "Preview complete. All changes were rolled back."
                  : "Changes committed to the database."}
              </Alert>
            )}
            {result.kind === "select" ? (
              <>
                {hint &&
                  chartRows.length > 0 &&
                  (hint.type === "line" ? (
                    <LineChart
                      h={280}
                      data={chartRows}
                      dataKey="chart_label"
                      series={ys.map((name, i) => ({
                        name,
                        color: ["emerald.6", "blue.6", "orange.6", "red.6"][
                          i % 4
                        ],
                      }))}
                      withLegend
                    />
                  ) : (
                    <BarChart
                      h={280}
                      data={chartRows}
                      dataKey="chart_label"
                      series={ys.map((name, i) => ({
                        name,
                        color: ["emerald.6", "blue.6"][i % 2],
                      }))}
                      withLegend
                    />
                  ))}
                {result.truncated && (
                  <Alert color="yellow">
                    Showing the first {result.rows.length} rows of{" "}
                    {result.rowcount}.
                  </Alert>
                )}
                <ResultGrid grid={result} />
              </>
            ) : (
              <>
                <Text size="xl" fw={700}>
                  {result.affected} rows affected
                </Text>
                {result.before && result.after && (
                  <Comparison before={result.before} after={result.after} />
                )}
                {result.sample && (
                  <>
                    <Text fw={600}>Affected row sample</Text>
                    <ResultGrid grid={result.sample} />
                  </>
                )}
              </>
            )}
            <Accordion>
              <Accordion.Item value="sql">
                <Accordion.Control>Executed SQL</Accordion.Control>
                <Accordion.Panel>
                  <SqlBlock sql={result.sql} />
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
            <NoticeConsole notices={result.notices} />
          </Stack>
        )}
      </Card>
    </Stack>
  );
}
export default function Reports() {
  const catalog = useQuery({
    queryKey: ["queries"],
    queryFn: () => api.get<Definition[]>("/queries"),
  });
  const [kind, setKind] = useState("select");
  const [id, setId] = useState("q1");
  const items = catalog.data?.filter((q) => q.kind === kind) ?? [];
  return (
    <>
      <PageHeader
        title="Reports"
        description="Stage 2 queries against the integrated database"
      />
      {catalog.isLoading ? (
        <LoadingState />
      ) : catalog.error ? (
        <ErrorAlert error={catalog.error} />
      ) : (
        <Grid>
          <Grid.Col span={{ base: 12, md: 4, lg: 3 }}>
            <Stack>
              <SegmentedControl
                value={kind}
                onChange={(v) => {
                  setKind(v);
                  setId(catalog.data?.find((q) => q.kind === v)?.id ?? "");
                }}
                data={[
                  { value: "select", label: "Select" },
                  { value: "update", label: "Update" },
                  { value: "delete", label: "Delete" },
                ]}
              />
              {items.map((q) => (
                <Card
                  key={q.id}
                  component="button"
                  onClick={() => setId(q.id)}
                  ta="left"
                  p="md"
                  style={{
                    borderColor:
                      q.id === id
                        ? "var(--mantine-primary-color-filled)"
                        : undefined,
                    cursor: "pointer",
                  }}
                >
                  <Group gap="xs">
                    <Badge size="sm">{q.id.toUpperCase()}</Badge>
                    <Text fw={600} size="sm">
                      {q.title}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed" mt="xs">
                    {q.screen}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    {q.tables.join(", ")}
                  </Text>
                </Card>
              ))}
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 8, lg: 9 }}>
            {catalog.data?.map((q) => (
              <div
                key={q.id}
                style={{ display: q.id === id ? "block" : "none" }}
              >
                <QueryPanel query={q} />
              </div>
            ))}
          </Grid.Col>
        </Grid>
      )}
    </>
  );
}
