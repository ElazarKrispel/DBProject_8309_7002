import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DonutChart } from "@mantine/charts";
import { Link, useParams } from "react-router-dom";
import { api, getRow, listRows } from "../api/client";
import { ApiError } from "../api/types";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import ErrorAlert from "../components/ui/ErrorAlert";
import LoadingState from "../components/ui/LoadingState";
import KpiCard from "../components/ui/KpiCard";
import { DataGrid, linked, value } from "../components/detail/shared";
import type { Result } from "../components/detail/shared";
export default function ClubDetail() {
  const { id = "" } = useParams();
  const [search, setSearch] = useState("");
  const valid = /^\d+$/.test(id);
  const club = useQuery({
    queryKey: ["club", id],
    queryFn: () => getRow("club", { club_id: id }),
    enabled: valid,
    retry: false,
  });
  const members = useQuery({
    queryKey: ["club-members", id],
    queryFn: async () => {
      const first = await listRows("vw_player_club_membership", {
        size: 100,
        filters: { club_id: id },
      });
      const rest = await Promise.all(
        Array.from({ length: Math.ceil(first.total / 100) - 1 }, (_, i) =>
          listRows("vw_player_club_membership", {
            size: 100,
            page: i + 2,
            filters: { club_id: id },
          }),
        ),
      );
      return [...first.rows, ...rest.flatMap((p) => p.rows)];
    },
    enabled: valid,
  });
  const stats = useQuery({
    queryKey: ["club-stats", id],
    queryFn: () =>
      api.post<Result>("/sql", {
        sql: `SELECT COUNT(*) AS members, COUNT(*) FILTER (WHERE role_code='owner') AS owners, COUNT(*) FILTER (WHERE role_code='admin') AS admins, ROUND(AVG(rating_classical)) AS average_rating, MIN(join_date) AS oldest_join FROM vw_player_club_membership WHERE club_id=${id}`,
        mode: "preview",
      }),
    enabled: valid,
  });
  if (!valid || (club.error instanceof ApiError && club.error.status === 404))
    return (
      <EmptyState
        title="Club not found"
        text="This club does not exist."
        action={
          <Button component={Link} to="/tables/club">
            Back to clubs
          </Button>
        }
      />
    );
  if (club.isLoading) return <LoadingState />;
  if (club.error) return <ErrorAlert error={club.error} />;
  const c = club.data;
  if (!c) return null;
  const rows = members.data ?? [];
  const s = stats.data?.rows[0];
  const roles = ["owner", "admin", "moderator", "member"]
    .map((name, i) => ({
      name,
      value: rows.filter((r) => r.role_code === name).length,
      color: ["emerald.6", "blue.6", "violet.6", "gray.5"][i],
    }))
    .filter((r) => r.value > 0);
  return (
    <Stack>
      <PageHeader
        title={value(c.club_name)}
        description={[c.country_code, c.city].filter(Boolean).join(" / ")}
        breadcrumbs={[
          { label: "Clubs", to: "/tables/club" },
          { label: value(c.club_name) },
        ]}
        actions={
          <>
            <Button
              component={Link}
              to={`/tables/club?updateKey=${id}`}
              variant="default"
            >
              Edit
            </Button>
            <Button
              component={Link}
              to={`/tables/club_membership?club_id=${id}`}
            >
              Open memberships
            </Button>
          </>
        }
      />
      <Card>
        <Group justify="space-between">
          <Title order={3}>Club profile</Title>
          {c.is_official === true && <Badge>Official club</Badge>}
        </Group>
        <Text mt="sm">{value(c.description)}</Text>
        <Text size="sm" c="dimmed" mt="sm">
          Founded {value(c.founded_date)}
        </Text>
      </Card>
      <SimpleGrid cols={{ base: 2, lg: 5 }}>
        {[
          ["Active members", "members"],
          ["Owners", "owners"],
          ["Admins", "admins"],
          ["Average classical", "average_rating"],
          ["Oldest join date", "oldest_join"],
        ].map(([name, key]) => (
          <KpiCard
            key={key}
            label={name}
            value={s ? value(s[key]) : "Loading"}
          />
        ))}
      </SimpleGrid>
      {stats.error && <ErrorAlert error={stats.error} />}
      {stats.data?.ok === false && (
        <ErrorAlert error={stats.data.error?.message} />
      )}
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Card>
          <Title order={3}>Role distribution</Title>
          {roles.length ? (
            <DonutChart
              mt="lg"
              data={roles}
              withLabels
              withTooltip
              size={190}
            />
          ) : (
            <Text c="dimmed" mt="md">
              No active memberships
            </Text>
          )}
          <Group mt="md">
            {roles.map((r) => (
              <Badge key={r.name} color={r.color.split(".")[0]}>
                {r.name}: {r.value}
              </Badge>
            ))}
          </Group>
        </Card>
        <Card>
          <Title order={3}>Membership directory</Title>
          <Text c="dimmed" mt="sm">
            Explore all active members and open their player profiles.
          </Text>
          <Text fw={700} size="xl" mt="lg">
            {rows.length} active members
          </Text>
          <Anchor
            component={Link}
            to={`/tables/club_membership?club_id=${id}`}
            mt="md"
          >
            Manage all membership statuses
          </Anchor>
        </Card>
      </SimpleGrid>
      <Card>
        <Group justify="space-between" mb="md">
          <Title order={3}>Members</Title>
          <TextInput
            aria-label="Search members"
            placeholder="Search members"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </Group>
        {members.error ? (
          <ErrorAlert error={members.error} />
        ) : members.isLoading ? (
          <LoadingState />
        ) : (
          <DataGrid
            rows={rows.filter((r) =>
              `${r.username} ${r.full_name} ${r.country_code}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )}
            columns={[
              {
                label: "Player",
                render: (r) => linked(r.username, `/players/${r.player_id}`),
              },
              { label: "Full name", render: (r) => value(r.full_name) },
              { label: "Country", render: (r) => value(r.country_code) },
              { label: "Classical", render: (r) => value(r.rating_classical) },
              {
                label: "Role",
                render: (r) => <Badge>{value(r.role_code)}</Badge>,
              },
              { label: "Joined", render: (r) => value(r.join_date) },
            ]}
          />
        )}
      </Card>
    </Stack>
  );
}
