import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Checkbox,
  Code,
  Group,
  NumberInput,
  RingProgress,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { ErrorAlert } from "../components/ui/ErrorAlert";
import { ProgramCard, PlayerPicker } from "../components/programs/ProgramCard";
import type { ProgramResult } from "../components/programs/ProgramCard";
import { Comparison, ResultGrid } from "../components/reports/ResultGrid";
import type { GridData } from "../components/reports/ResultGrid";
const grid = (r: ProgramResult, key: string) => r[key] as GridData;
function snapshots(r: ProgramResult, keys: string[]) {
  const before = r.before as Record<string, GridData>;
  const after = r.after as Record<string, GridData>;
  return (
    <Stack>
      {keys.map((k) => (
        <Comparison
          key={k}
          title={k.replaceAll("_", " ")}
          before={before[k]}
          after={after[k]}
        />
      ))}
    </Stack>
  );
}
function Functions() {
  const [player, setPlayer] = useState(1);
  const [days, setDays] = useState<string | number>(365);
  const [country, setCountry] = useState("IL");
  const [all, setAll] = useState(false);
  const [minimum, setMinimum] = useState<string | number>(25);
  return (
    <Stack>
      <ProgramCard
        name="fn_player_activity_score"
        description="A score from 0 to 100 based on login activity, club memberships and social connections."
        endpoint="activity-score"
        body={{ player_id: player, days_back: days }}
        exception
        quick={[
          { label: "Try unknown player", body: { player_id: 999999 } },
          { label: "Try days_back = -10", body: { days_back: -10 } },
        ]}
        render={(r) => {
          const p = r.player as {
            username: string;
            full_name: string;
            status: string;
          };
          return (
            <Group>
              <RingProgress
                size={130}
                sections={[
                  {
                    value: Number(r.score),
                    color: Number(r.score) >= 60 ? "emerald" : "orange",
                  },
                ]}
                label={
                  <Text ta="center" fw={700} size="xl">
                    {String(r.score)}
                  </Text>
                }
              />
              <Stack gap={4}>
                <Text fw={600}>{p.full_name}</Text>
                <Text size="sm">{p.username}</Text>
                <Badge>{p.status}</Badge>
              </Stack>
            </Group>
          );
        }}
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <PlayerPicker value={player} onChange={setPlayer} />
          <NumberInput
            label="Days back"
            value={days}
            onChange={setDays}
            min={1}
          />
        </SimpleGrid>
      </ProgramCard>
      <ProgramCard
        name="fn_club_report"
        description="Club membership and rating statistics returned through a REF CURSOR."
        endpoint="club-report"
        body={{ country: all ? null : country, min_members: minimum }}
        render={(r) => (
          <>
            <Text size="sm">{String(r.rowcount)} clubs matched</Text>
            <ResultGrid grid={r as unknown as GridData} />
            <Text size="xs" c="dimmed">
              The function returns a REF CURSOR, fetched with FETCH ALL inside
              one transaction.
            </Text>
          </>
        )}
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            label="Country code"
            value={country}
            onChange={(e) => setCountry(e.currentTarget.value.toUpperCase())}
            maxLength={2}
            disabled={all}
          />
          <NumberInput
            label="Minimum active members"
            value={minimum}
            onChange={setMinimum}
            min={0}
          />
        </SimpleGrid>
        <Checkbox
          label="All countries"
          checked={all}
          onChange={(e) => setAll(e.currentTarget.checked)}
        />
      </ProgramCard>
    </Stack>
  );
}
function Procedures() {
  const [date, setDate] = useState<string | null>("2026-08-18");
  const [limit, setLimit] = useState<string | number>(50);
  const [days, setDays] = useState<string | number>(3000);
  const [logins, setLogins] = useState<string | number>(20);
  const [threshold, setThreshold] = useState<string | number>(15);
  return (
    <Stack>
      <ProgramCard
        name="sp_process_billing_cycle"
        description="Process due subscriptions and inspect renewed and expired INOUT values."
        endpoint="billing-cycle"
        body={{ as_of: date, limit }}
        mutates
        render={(r) => (
          <>
            <SimpleGrid cols={2}>
              <div>
                <Text c="dimmed" size="sm">
                  Renewed
                </Text>
                <Text size="xl" fw={700}>
                  {String(r.renewed)}
                </Text>
              </div>
              <div>
                <Text c="dimmed" size="sm">
                  Expired
                </Text>
                <Text size="xl" fw={700}>
                  {String(r.expired)}
                </Text>
              </div>
            </SimpleGrid>
            {snapshots(r, ["status", "due"])}
          </>
        )}
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <DateInput
            label="As of"
            value={date}
            onChange={setDate}
            valueFormat="YYYY-MM-DD"
          />
          <NumberInput
            label="Subscription limit"
            value={limit}
            onChange={setLimit}
            min={1}
          />
        </SimpleGrid>
      </ProgramCard>
      <ProgramCard
        name="sp_security_review"
        description="Review suspicious activity, update player status and cascade bans to club memberships."
        endpoint="security-review"
        body={{ days_back: days, min_logins: logins, threshold_pct: threshold }}
        mutates
        exception
        quick={[{ label: "Try days_back = 0", body: { days_back: 0 } }]}
        render={(r) => snapshots(r, ["players", "memberships"])}
      >
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <NumberInput
            label="Days back"
            value={days}
            onChange={setDays}
            min={1}
          />
          <NumberInput
            label="Minimum logins"
            value={logins}
            onChange={setLogins}
            min={1}
          />
          <NumberInput
            label="Suspicious threshold (%)"
            value={threshold}
            onChange={setThreshold}
            min={0.1}
            max={100}
          />
        </SimpleGrid>
      </ProgramCard>
    </Stack>
  );
}
function Triggers() {
  const [player, setPlayer] = useState(1);
  const [field, setField] = useState<string | null>("rating_classical");
  const [delta, setDelta] = useState<string | number>(500);
  const [ban, setBan] = useState<string | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const [device, setDevice] = useState<string | null>("mobile");
  const [status, setStatus] = useState<string | null>("success");
  const [reason, setReason] = useState("wrong password");
  const [date, setDate] = useState<string | null>("2026-03-25");
  const bans = useQuery({
    queryKey: ["ban-candidates"],
    queryFn: () =>
      api.get<
        { player_id: number; username: string; active_memberships: number }[]
      >("/programs/trigger/ban-candidates"),
  });
  const logins = useQuery({
    queryKey: ["login-candidates"],
    queryFn: () =>
      api.get<{
        active: { player_id: number; username: string }[];
        banned: { player_id: number; username: string }[];
      }>("/programs/trigger/login-candidates"),
  });
  const banId = ban ?? String(bans.data?.[0]?.player_id ?? 1);
  const loginId = login ?? String(logins.data?.active[0]?.player_id ?? 1);
  return (
    <Stack>
      <ProgramCard
        name="trg_player_update: rating guard"
        description="What this proves: a rating change above 400 points is rejected; a smaller change is accepted."
        endpoint="trigger/rating-jump"
        body={{ player_id: player, field, delta }}
        mutates
        render={(r) => (
          <Comparison before={grid(r, "before")} after={grid(r, "after")} />
        )}
      >
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <PlayerPicker value={player} onChange={setPlayer} />
          <Select
            label="Rating field"
            data={["rating_classical", "rating_rapid", "rating_blitz"]}
            value={field}
            onChange={setField}
          />
          <NumberInput label="Rating delta" value={delta} onChange={setDelta} />
        </SimpleGrid>
        <Group>
          <Button variant="light" color="red" onClick={() => setDelta(500)}>
            +500 (rejected)
          </Button>
          <Button variant="light" onClick={() => setDelta(50)}>
            +50 (accepted)
          </Button>
        </Group>
      </ProgramCard>
      <ProgramCard
        name="trg_player_update: ban cascade"
        description="What this proves: banning a player also bans their active club memberships in the same transaction."
        endpoint="trigger/ban-cascade"
        body={{ player_id: Number(banId) }}
        mutates
        render={(r) => snapshots(r, ["player", "memberships"])}
      >
        {bans.error && <ErrorAlert error={bans.error} />}
        <Select
          label="Player with active memberships"
          value={banId}
          onChange={setBan}
          data={(bans.data ?? []).map((p) => ({
            value: String(p.player_id),
            label: `${p.username}: ${p.active_memberships} active memberships`,
          }))}
        />
      </ProgramCard>
      <ProgramCard
        name="trg_login_log_insert"
        description="What this proves: the trigger fills client_id, clears failure_reason for successful logins and rejects banned players."
        endpoint="trigger/login-insert"
        body={{
          player_id: Number(loginId),
          device_type: device,
          login_status_code: status,
          failure_reason: reason,
          login_date: date,
        }}
        mutates
        render={(r) => (
          <>
            <Text size="sm">
              Inserted row: inspect <Code>client_id</Code> and{" "}
              <Code>failure_reason</Code>.
            </Text>
            <ResultGrid
              grid={{
                columns: Object.keys(r.row as object),
                rows: [r.row as Record<string, unknown>],
              }}
            />
          </>
        )}
      >
        {logins.error && <ErrorAlert error={logins.error} />}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label="Player"
            value={loginId}
            onChange={setLogin}
            data={["active", "banned"].map((k) => ({
              group:
                k === "active" ? "Active players" : "Banned players (rejected)",
              items: (logins.data?.[k as "active" | "banned"] ?? []).map(
                (p) => ({ value: String(p.player_id), label: p.username }),
              ),
            }))}
          />
          <Select
            label="Device"
            value={device}
            onChange={setDevice}
            data={["mobile", "tablet", "desktop"]}
          />
          <Select
            label="Login status"
            value={status}
            onChange={setStatus}
            data={["success", "failed", "blocked"]}
          />
          <TextInput
            label="Failure reason"
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
          />
          <DateInput
            label="Login date"
            value={date}
            onChange={setDate}
            valueFormat="YYYY-MM-DD"
          />
        </SimpleGrid>
      </ProgramCard>
    </Stack>
  );
}
export default function Programs() {
  const health = useQuery({
    queryKey: ["programs-health"],
    queryFn: () =>
      api.get<{ ok: boolean; missing: string[] }>("/programs/health"),
  });
  return (
    <>
      <PageHeader
        title="Programs"
        description="Stage 4 functions, procedures and trigger demonstrations"
        actions={
          <Badge color={health.data?.ok ? "emerald" : "red"}>
            {health.isLoading
              ? "Checking installation"
              : health.data?.ok
                ? "4 routines · 2 triggers installed"
                : `Missing: ${health.data?.missing.join(", ") ?? "health check unavailable"}`}
          </Badge>
        }
      />
      {health.error && <ErrorAlert error={health.error} />}
      <Tabs defaultValue="functions" keepMounted>
        <Tabs.List mb="lg">
          <Tabs.Tab value="functions">Functions</Tabs.Tab>
          <Tabs.Tab value="procedures">Procedures</Tabs.Tab>
          <Tabs.Tab value="triggers">Triggers</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="functions">
          <Functions />
        </Tabs.Panel>
        <Tabs.Panel value="procedures">
          <Procedures />
        </Tabs.Panel>
        <Tabs.Panel value="triggers">
          <Triggers />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
