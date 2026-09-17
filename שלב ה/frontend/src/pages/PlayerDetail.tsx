import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  RingProgress,
  ScrollArea,
  Code,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { Link, useParams } from "react-router-dom";
import { activityScore, api, getRow, listRows } from "../api/client";
import { ApiError } from "../api/types";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import ErrorAlert from "../components/ui/ErrorAlert";
import LoadingState from "../components/ui/LoadingState";
import KpiCard from "../components/ui/KpiCard";
import NoticeConsole from "../components/ui/NoticeConsole";
import {
  DataGrid,
  label,
  linked,
  status,
  value,
} from "../components/detail/shared";
import type { Result } from "../components/detail/shared";
export default function PlayerDetail() {
  const { id = "" } = useParams();
  const valid = /^\d+$/.test(id);
  const [days, setDays] = useState("365");
  const [demo, setDemo] = useState<"login-insert" | "ban-cascade" | null>(null);
  const [apply, setApply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<unknown>(null);
  const qc = useQueryClient();
  const player = useQuery({
    queryKey: ["player", id],
    queryFn: () => getRow("player", { player_id: id }),
    enabled: valid,
    retry: false,
  });
  const score = useQuery({
    queryKey: ["activity", id, days],
    queryFn: () =>
      activityScore({ player_id: Number(id), days_back: Number(days) }),
    enabled: valid,
  });
  const clubs = useQuery({
    queryKey: ["player-clubs", id],
    queryFn: () =>
      listRows("vw_player_club_membership", {
        size: 200,
        filters: { player_id: id },
      }),
    enabled: valid,
  });
  const subs = useQuery({
    queryKey: ["player-subs", id],
    queryFn: () =>
      listRows("player_subscription", {
        size: 200,
        sort: "start_date",
        dir: "desc",
        filters: { player_id: id },
      }),
    enabled: valid,
  });
  const logins = useQuery({
    queryKey: ["player-logins", id],
    queryFn: () =>
      listRows("login_log", {
        size: 10,
        sort: "login_date",
        dir: "desc",
        filters: { player_id: id },
      }),
    enabled: valid,
  });
  const social = useQuery({
    queryKey: ["player-social", id],
    queryFn: () =>
      api.post<Result>("/sql", {
        sql: `SELECT s.*, p.username AS other_username, p.player_id AS other_id FROM social_connection s JOIN player p ON p.player_id=CASE WHEN s.from_player_id=${id} THEN s.to_player_id ELSE s.from_player_id END WHERE s.from_player_id=${id} OR s.to_player_id=${id} ORDER BY s.created_date DESC, s.connection_id DESC LIMIT 10`,
        mode: "preview",
      }),
    enabled: valid,
  });
  const counts = useQuery({
    queryKey: ["player-social-counts", id],
    queryFn: () =>
      api.post<Result>("/sql", {
        sql: `SELECT COUNT(*) FILTER (WHERE connection_type_code='follow' AND to_player_id=${id} AND status_code='accepted') AS followers, COUNT(*) FILTER (WHERE connection_type_code='follow' AND from_player_id=${id} AND status_code='accepted') AS following, COUNT(DISTINCT CASE WHEN from_player_id=${id} THEN to_player_id ELSE from_player_id END) FILTER (WHERE connection_type_code='friend' AND status_code='accepted') AS friends FROM social_connection WHERE from_player_id=${id} OR to_player_id=${id}`,
        mode: "preview",
      }),
    enabled: valid,
  });
  async function runDemo() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Result>(`/programs/trigger/${demo}`, {
        player_id: Number(id),
        mode: demo === "ban-cascade" && apply ? "apply" : "preview",
      });
      setResult(r);
      if (r.ok && apply) await qc.invalidateQueries();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  if (
    !valid ||
    (player.error instanceof ApiError && player.error.status === 404)
  )
    return (
      <EmptyState
        title="Player not found"
        text="This player does not exist."
        action={
          <Button component={Link} to="/tables/player">
            Back to players
          </Button>
        }
      />
    );
  if (player.isLoading) return <LoadingState />;
  if (player.error) return <ErrorAlert error={player.error} />;
  const p = player.data;
  if (!p) return null;
  return (
    <Stack>
      <PageHeader
        title="Player 360"
        description="Ratings, memberships and activity in one place."
        breadcrumbs={[
          { label: "Players", to: "/tables/player" },
          { label: value(p.username) },
        ]}
        actions={
          <>
            <Button
              variant="default"
              component={Link}
              to={`/tables/player?updateKey=${id}`}
            >
              Edit
            </Button>
            <Button
              variant="light"
              onClick={() => {
                setDemo("login-insert");
                setApply(false);
                setResult(null);
                setError(null);
              }}
            >
              Record login (trigger demo)
            </Button>
            <Button
              color="red"
              variant="light"
              onClick={() => {
                setDemo("ban-cascade");
                setApply(false);
                setResult(null);
                setError(null);
              }}
            >
              Ban player (trigger demo)
            </Button>
          </>
        }
      />
      <Card>
        <Group align="flex-start">
          <Avatar
            size={72}
            radius="xl"
            color="emerald"
          >{`${value(p.first_name).slice(0, 1)}${value(p.last_name).slice(0, 1)}`}</Avatar>
          <Stack gap={5}>
            <Group>
              <Title order={2}>{value(p.username)}</Title>
              {status(p.status_code)}
            </Group>
            <Text>
              {value(p.first_name)} {value(p.last_name)}
            </Text>
            <Text c="dimmed" size="sm">
              {[p.country_code, p.city].filter(Boolean).join(" / ")} | Joined{" "}
              {value(p.registration_date)}
            </Text>
            <Text c="dimmed" size="sm">
              {value(p.email)} | Language: {value(p.language_code)}
            </Text>
          </Stack>
        </Group>
      </Card>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        {["classical", "rapid", "blitz"].map((r) => (
          <KpiCard
            key={r}
            label={`${r} rating`}
            value={value(p[`rating_${r}`])}
          />
        ))}
      </SimpleGrid>
      <Card>
        <Group justify="space-between">
          <Group>
            <RingProgress
              size={110}
              thickness={10}
              sections={[
                {
                  value: Math.min(
                    100,
                    Math.max(0, Number(score.data?.score ?? 0)),
                  ),
                  color: "emerald",
                },
              ]}
              label={
                <Text ta="center" fw={700}>
                  {score.isLoading
                    ? "..."
                    : Number(score.data?.score ?? 0).toFixed(1)}
                </Text>
              }
            />
            <div>
              <Title order={3}>Activity score</Title>
              <Text c="dimmed" size="sm">
                computed by fn_player_activity_score (Stage 4)
              </Text>
            </div>
          </Group>
          <Select
            label="Activity window"
            value={days}
            onChange={(v) => setDays(v ?? "365")}
            data={["90", "180", "365", "730"].map((v) => ({
              value: v,
              label: `Last ${v} days`,
            }))}
          />
        </Group>
        {score.error && <ErrorAlert error={score.error} />}
      </Card>
      <Tabs defaultValue="clubs">
        <Tabs.List>
          <Tabs.Tab value="clubs">Club memberships</Tabs.Tab>
          <Tabs.Tab value="subscriptions">Subscriptions</Tabs.Tab>
          <Tabs.Tab value="logins">Recent logins</Tabs.Tab>
          <Tabs.Tab value="social">Social</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="clubs" pt="md">
          <Card>
            {clubs.error ? (
              <ErrorAlert error={clubs.error} />
            ) : clubs.isLoading ? (
              <LoadingState />
            ) : (
              <DataGrid
                rows={clubs.data?.rows ?? []}
                columns={[
                  {
                    label: "Club",
                    render: (r) => linked(r.club_name, `/clubs/${r.club_id}`),
                  },
                  {
                    label: "Role",
                    render: (r) => <Badge>{value(r.role_code)}</Badge>,
                  },
                  {
                    label: "Official",
                    render: (r) => (r.is_official ? "Official" : "Community"),
                  },
                  { label: "Joined", render: (r) => value(r.join_date) },
                ]}
              />
            )}
          </Card>
        </Tabs.Panel>
        <Tabs.Panel value="subscriptions" pt="md">
          <Card>
            {subs.error ? (
              <ErrorAlert error={subs.error} />
            ) : subs.isLoading ? (
              <LoadingState />
            ) : (
              <DataGrid
                rows={subs.data?.rows ?? []}
                columns={[
                  { label: "Tier", render: (r) => label(r, "tier_id") },
                  { label: "Status", render: (r) => label(r, "status_code") },
                  {
                    label: "Billing cycle",
                    render: (r) => label(r, "billing_cycle_code"),
                  },
                  {
                    label: "Auto renew",
                    render: (r) => (r.auto_renew ? "Yes" : "No"),
                  },
                  { label: "Start", render: (r) => value(r.start_date) },
                  { label: "End", render: (r) => value(r.end_date) },
                ]}
              />
            )}
          </Card>
        </Tabs.Panel>
        <Tabs.Panel value="logins" pt="md">
          <Card>
            {logins.error ? (
              <ErrorAlert error={logins.error} />
            ) : logins.isLoading ? (
              <LoadingState />
            ) : (
              <DataGrid
                rows={logins.data?.rows ?? []}
                columns={[
                  { label: "Date", render: (r) => value(r.login_date) },
                  {
                    label: "Status",
                    render: (r) => label(r, "login_status_code"),
                  },
                  { label: "Device", render: (r) => value(r.device_type) },
                  {
                    label: "OS / Browser",
                    render: (r) =>
                      `${value(r.operating_system)} / ${value(r.browser)}`,
                  },
                  { label: "IP address", render: (r) => value(r.ip_address) },
                  {
                    label: "Suspicious",
                    render: (r) => (
                      <Badge color={r.is_suspicious ? "red" : "gray"}>
                        {r.is_suspicious ? "Yes" : "No"}
                      </Badge>
                    ),
                  },
                  { label: "Client", render: (r) => label(r, "client_id") },
                ]}
              />
            )}
          </Card>
        </Tabs.Panel>
        <Tabs.Panel value="social" pt="md">
          <Stack>
            <SimpleGrid cols={3}>
              {["followers", "following", "friends"].map((key) => (
                <KpiCard
                  key={key}
                  label={key}
                  value={value(counts.data?.rows[0]?.[key])}
                />
              ))}
            </SimpleGrid>
            <Card>
              {social.error ? (
                <ErrorAlert error={social.error} />
              ) : social.isLoading ? (
                <LoadingState />
              ) : (
                <DataGrid
                  rows={social.data?.rows ?? []}
                  columns={[
                    {
                      label: "Player",
                      render: (r) =>
                        linked(r.other_username, `/players/${r.other_id}`),
                    },
                    {
                      label: "Connection",
                      render: (r) => value(r.connection_type_code),
                    },
                    {
                      label: "Direction",
                      render: (r) =>
                        Number(r.from_player_id) === Number(id)
                          ? "Outgoing"
                          : "Incoming",
                    },
                    { label: "Status", render: (r) => status(r.status_code) },
                    { label: "Created", render: (r) => value(r.created_date) },
                  ]}
                />
              )}
            </Card>
          </Stack>
        </Tabs.Panel>
      </Tabs>
      <Modal
        opened={demo !== null}
        onClose={() => !busy && setDemo(null)}
        title={
          demo === "ban-cascade"
            ? "Ban player: trigger demonstration"
            : "Record login: trigger demonstration"
        }
        size="lg"
      >
        <Stack>
          <Alert color={apply ? "red" : "blue"}>
            {apply
              ? "This will ban the player and cascade the change to active memberships."
              : "Preview runs the trigger and rolls back every database change."}
          </Alert>
          {demo === "ban-cascade" && (
            <Switch
              checked={apply}
              onChange={(e) => setApply(e.currentTarget.checked)}
              label="Apply changes permanently"
            />
          )}
          <Text size="sm">
            Player: {value(p.username)}.{" "}
            {demo === "login-insert"
              ? "A successful mobile login is inserted in preview mode. The trigger fills its client and normalizes its failure reason."
              : "The trigger updates the player and their active memberships together."}
          </Text>
          <Button
            loading={busy}
            color={apply ? "red" : "emerald"}
            onClick={runDemo}
          >
            {apply ? "Confirm ban" : "Run preview"}
          </Button>
          {error != null && <ErrorAlert error={error} />}{" "}
          {result && (
            <>
              <Alert color={result.ok ? "emerald" : "red"}>
                {result.ok
                  ? apply
                    ? "Changes applied."
                    : "Preview completed. No changes saved."
                  : result.error?.message}
              </Alert>
              <NoticeConsole notices={result.notices} />
              <ScrollArea mah={260}>
                <Code block>{JSON.stringify(result, null, 2)}</Code>
              </ScrollArea>
            </>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}
