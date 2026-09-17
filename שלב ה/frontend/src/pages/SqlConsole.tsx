import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Kbd,
  Menu,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Textarea,
} from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import { api } from "../api/client";
import PageHeader from "../components/ui/PageHeader";
import NoticeConsole from "../components/ui/NoticeConsole";
import ErrorAlert from "../components/ui/ErrorAlert";
import type { Result } from "../components/detail/shared";
const snippets = [
  {
    label: "Top rated players per country",
    sql: "SELECT country_code, username, rating_classical, RANK() OVER (PARTITION BY country_code ORDER BY rating_classical DESC) AS country_rank\nFROM player\nORDER BY country_code, country_rank\nLIMIT 50;",
  },
  {
    label: "Monthly login activity",
    sql: "SELECT EXTRACT(YEAR FROM login_date) AS year, EXTRACT(MONTH FROM login_date) AS month, COUNT(*) AS logins\nFROM login_log\nGROUP BY 1, 2\nORDER BY 1 DESC, 2 DESC;",
  },
  {
    label: "Clubs with most members",
    sql: "SELECT c.club_name, COUNT(*) AS active_members\nFROM club c JOIN club_membership m USING (club_id)\nWHERE m.status_code = 'active'\nGROUP BY c.club_id, c.club_name\nORDER BY active_members DESC LIMIT 20;",
  },
  {
    label: "Client login bridge",
    sql: "SELECT l.login_date, p.username, u.name AS client, u.client_type\nFROM login_log l JOIN uiclient u USING (client_id) JOIN player p USING (player_id)\nORDER BY l.login_date DESC LIMIT 30;",
  },
  {
    label: "Player status lookup",
    sql: "SELECT status_code, status_name FROM player_status\nWHERE status_code IN ('active', 'suspended', 'banned')\nORDER BY status_name;",
  },
  {
    label: "Preview a player update",
    sql: "UPDATE player SET rating_rapid = rating_rapid + 1\nWHERE player_id = 1\nRETURNING player_id, username, rating_rapid;",
  },
  {
    label: "Active subscriptions",
    sql: "SELECT p.username, t.tier_name, s.start_date, s.end_date\nFROM player_subscription s JOIN player p USING (player_id) JOIN subscription_tier t USING (tier_id)\nWHERE s.status_code = 'active'\nORDER BY s.end_date LIMIT 25;",
  },
  {
    label: "Engine overview",
    sql: "SELECT * FROM vw_engine_overview ORDER BY engine_name;",
  },
];
function readHistory(): string[] {
  try {
    const v: unknown = JSON.parse(
      localStorage.getItem("chess-sql-history") ?? "[]",
    );
    return Array.isArray(v)
      ? v.filter((s): s is string => typeof s === "string").slice(0, 10)
      : [];
  } catch {
    return [];
  }
}
function display(v: unknown) {
  if (v == null)
    return (
      <Text span c="dimmed" fs="italic">
        null
      </Text>
    );
  if (typeof v === "boolean")
    return v ? (
      <IconCheck
        size={16}
        aria-label="True"
        color="var(--mantine-color-emerald-6)"
      />
    ) : (
      <IconX size={16} aria-label="False" color="var(--mantine-color-gray-6)" />
    );
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}
export default function SqlConsole() {
  const [sql, setSql] = useState(snippets[0].sql);
  const [mode, setMode] = useState("preview");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [history, setHistory] = useState(readHistory);
  const [resultMode, setResultMode] = useState("preview");
  async function execute() {
    if (!sql.trim() || busy) return;
    setConfirm(false);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await api.post<Result>("/sql", { sql, mode });
      setResult(response);
      setResultMode(mode);
      const next = [sql, ...history.filter((s) => s !== sql)].slice(0, 10);
      setHistory(next);
      try {
        localStorage.setItem("chess-sql-history", JSON.stringify(next));
      } catch {
        /* History remains available for this session. */
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function run() {
    if (mode === "apply") setConfirm(true);
    else void execute();
  }
  function download() {
    if (!result) return;
    const escape = (v: unknown) =>
      `"${(v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)).replace(/"/g, '""')}"`;
    const csv = [
      result.columns.map(escape).join(","),
      ...result.rows.map((r) =>
        result.columns.map((c) => escape(r[c])).join(","),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "query-results.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Stack>
      <PageHeader
        title="SQL Console"
        description="Run any SQL against chess_db. Preview rolls back all changes. Apply commits the transaction."
      />
      <Card>
        <Stack>
          <Group justify="space-between">
            <Group>
              <Menu>
                <Menu.Target>
                  <Button variant="default">Examples</Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {snippets.map((s) => (
                    <Menu.Item key={s.label} onClick={() => setSql(s.sql)}>
                      {s.label}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
              <Menu>
                <Menu.Target>
                  <Button variant="default" disabled={!history.length}>
                    History ({history.length})
                  </Button>
                </Menu.Target>
                <Menu.Dropdown w={420}>
                  {history.map((s, i) => (
                    <Menu.Item key={i} onClick={() => setSql(s)}>
                      <Text truncate size="sm">
                        {s}
                      </Text>
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            </Group>
            <SegmentedControl
              aria-label="Execution mode"
              value={mode}
              onChange={setMode}
              color={mode === "apply" ? "red" : "emerald"}
              data={[
                { label: "Preview", value: "preview" },
                { label: "Apply", value: "apply" },
              ]}
            />
          </Group>
          <Textarea
            label="SQL statement"
            description="Run one statement or a SQL script. Results show the final result set."
            minRows={9}
            maxRows={24}
            autosize
            value={sql}
            onChange={(e) => setSql(e.currentTarget.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                run();
              }
            }}
            styles={{
              input: {
                fontFamily: "var(--mantine-font-family-monospace)",
                fontSize: 13,
                lineHeight: 1.7,
              },
            }}
            spellCheck={false}
          />
          {mode === "apply" && (
            <Alert color="red" title="Apply changes">
              Statements run against the live database and commit. Review your
              SQL before continuing.
            </Alert>
          )}
          <Group justify="space-between">
            <Group>
              <Button
                loading={busy}
                disabled={!sql.trim()}
                color={mode === "apply" ? "red" : "emerald"}
                onClick={run}
              >
                Run SQL
              </Button>
              <Button
                variant="subtle"
                disabled={busy}
                onClick={() => {
                  setSql("");
                  setResult(null);
                  setError(null);
                }}
              >
                Clear
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> to run
            </Text>
          </Group>
        </Stack>
      </Card>
      {error != null && <ErrorAlert error={error} />}{" "}
      {result && (
        <Card>
          <Stack>
            {!result.ok ? (
              <Alert
                color="red"
                title={`SQL error${result.error?.code ? ` (${result.error.code})` : ""}`}
              >
                <Text size="sm">
                  {result.error?.message ??
                    "The statement could not be executed."}
                </Text>
                {result.error?.hint && (
                  <Text size="sm" mt="sm">
                    Hint: {result.error.hint}
                  </Text>
                )}
                {result.error?.detail && (
                  <Text size="sm" mt="sm">
                    Detail: {result.error.detail}
                  </Text>
                )}
              </Alert>
            ) : (
              <>
                <Group justify="space-between">
                  <Group>
                    <Badge color={resultMode === "preview" ? "blue" : "orange"}>
                      {resultMode === "preview" ? "Rolled back" : "Committed"}
                    </Badge>
                    <Text size="sm">
                      {result.rows.length} displayed / {result.rowcount}{" "}
                      affected or returned
                    </Text>
                    <Text size="sm" c="dimmed">
                      {result.elapsed_ms.toFixed(1)} ms
                    </Text>
                    {result.readonly && <Badge color="gray">Read-only</Badge>}
                  </Group>
                  <Button
                    variant="default"
                    size="xs"
                    onClick={download}
                    disabled={!result.columns.length}
                  >
                    Export CSV
                  </Button>
                </Group>
                {result.truncated && (
                  <Alert color="yellow">
                    Results were truncated by the server. Add a LIMIT or narrow
                    your query to export a complete result.
                  </Alert>
                )}
                {result.columns.length ? (
                  <ScrollArea mah={520}>
                    <Table stickyHeader miw={600}>
                      <Table.Thead>
                        <Table.Tr>
                          {result.columns.map((c) => (
                            <Table.Th key={c}>{c}</Table.Th>
                          ))}
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {result.rows.map((row, i) => (
                          <Table.Tr key={i}>
                            {result.columns.map((c) => (
                              <Table.Td
                                key={c}
                                style={{
                                  whiteSpace: "nowrap",
                                  fontFamily:
                                    "var(--mantine-font-family-monospace)",
                                  fontSize: 12,
                                }}
                              >
                                {display(row[c])}
                              </Table.Td>
                            ))}
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                    {result.rows.length === 0 && (
                      <Text ta="center" c="dimmed" py="md">
                        The statement returned no rows.
                      </Text>
                    )}
                  </ScrollArea>
                ) : (
                  <Text c="dimmed">
                    Statement completed without a result table.
                  </Text>
                )}
              </>
            )}
            <NoticeConsole notices={result.notices} />
          </Stack>
        </Card>
      )}
      <Modal
        opened={confirm}
        onClose={() => setConfirm(false)}
        title="Commit SQL to the live database"
      >
        <Stack>
          <Alert color="red">
            Apply commits all changes in this script. This action can modify or
            delete real records.
          </Alert>
          <Text
            size="sm"
            ff="monospace"
            style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
          >
            {sql}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void execute()}>
              Confirm and apply
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
