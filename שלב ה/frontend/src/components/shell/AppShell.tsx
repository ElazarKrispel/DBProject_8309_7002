import {
  ActionIcon,
  AppShell as MantineAppShell,
  Avatar,
  Burger,
  Button,
  Container,
  Group,
  Kbd,
  Menu,
  NavLink,
  ScrollArea,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Spotlight, spotlight, type SpotlightActionGroupData } from '@mantine/spotlight'
import {
  IconChessKnight,
  IconChevronDown,
  IconLogout,
  IconMoon,
  IconSearch,
  IconSun,
} from '@tabler/icons-react'
import { useEffect, useMemo } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMeta } from '../../api/client'
import type { TableMeta } from '../../api/types'
import { clearToken } from '../../auth'
import { COLLAPSED_GROUPS, GROUP_ORDER, iconFor, NAV_PAGES } from '../../nav'

function usePageTitle(tables: TableMeta[] | undefined): string {
  const { pathname } = useLocation()
  let title: string
  const page = NAV_PAGES.find((p) => p.path === pathname)
  if (page) title = page.label
  else if (pathname.startsWith('/tables/')) title = tables?.find((t) => t.key === pathname.slice(8))?.label ?? 'Table'
  else if (pathname.startsWith('/players/')) title = `Player #${pathname.slice(9)}`
  else if (pathname.startsWith('/clubs/')) title = `Club #${pathname.slice(7)}`
  else title = 'Not found'

  useEffect(() => {
    document.title = `${title} - Chess Platform Admin`
  }, [title])
  return title
}

function groupTables(tables: TableMeta[] | undefined) {
  const by = new Map<string, TableMeta[]>()
  for (const t of tables ?? []) {
    const list = by.get(t.group) ?? []
    list.push(t)
    by.set(t.group, list)
  }
  const extra = [...by.keys()].filter((g) => !GROUP_ORDER.includes(g))
  return [...GROUP_ORDER, ...extra].filter((g) => by.has(g)).map((g) => ({ group: g, tables: by.get(g)! }))
}

export function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme()
  const computed = useComputedColorScheme('light')
  const dark = computed === 'dark'
  return (
    <Tooltip label={dark ? 'Light mode' : 'Dark mode'} withArrow>
      <ActionIcon
        variant="default"
        size="lg"
        aria-label="Toggle color scheme"
        onClick={() => setColorScheme(dark ? 'light' : 'dark')}
      >
        {dark ? <IconSun size={18} stroke={1.6} /> : <IconMoon size={18} stroke={1.6} />}
      </ActionIcon>
    </Tooltip>
  )
}

export function AppShell() {
  const [opened, { toggle, close }] = useDisclosure(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { data: tables } = useMeta()
  const title = usePageTitle(tables)
  const groups = useMemo(() => groupTables(tables), [tables])

  const actions: SpotlightActionGroupData[] = useMemo(
    () => [
      {
        group: 'Pages',
        actions: NAV_PAGES.map((p) => ({
          id: `page${p.path}`,
          label: p.label,
          leftSection: <p.icon size={18} stroke={1.5} />,
          onClick: () => navigate(p.path),
        })),
      },
      {
        group: 'Tables',
        actions: (tables ?? []).map((t) => {
          const IconCmp = iconFor(t.icon)
          return {
            id: `table-${t.key}`,
            label: t.label,
            description: t.group,
            leftSection: <IconCmp size={18} stroke={1.5} />,
            onClick: () => navigate(`/tables/${t.key}`),
          }
        }),
      },
    ],
    [tables, navigate],
  )

  const logout = () => {
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <MantineAppShell
      header={{ height: 56 }}
      navbar={{ width: 264, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding={0}
    >
      <Spotlight
        actions={actions}
        shortcut="mod + K"
        nothingFound="Nothing found"
        highlightQuery
        limit={12}
        searchProps={{ leftSection: <IconSearch size={18} stroke={1.5} />, placeholder: 'Search pages and tables' }}
      />

      <MantineAppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Group gap={6} wrap="nowrap" visibleFrom="xs" style={{ minWidth: 0 }}>
              <Text fz="sm" c="dimmed">
                Admin
              </Text>
              <Text fz="sm" c="dimmed">
                /
              </Text>
              <Text fz="sm" fw={600} truncate>
                {title}
              </Text>
            </Group>
          </Group>

          <Group gap="xs" wrap="nowrap">
            <Button
              variant="default"
              size="sm"
              visibleFrom="sm"
              leftSection={<IconSearch size={16} stroke={1.6} />}
              rightSection={
                <Kbd size="xs" ml={4}>
                  Ctrl+K
                </Kbd>
              }
              c="dimmed"
              fw={500}
              onClick={spotlight.open}
            >
              Search
            </Button>
            <ActionIcon variant="default" size="lg" hiddenFrom="sm" aria-label="Search" onClick={spotlight.open}>
              <IconSearch size={18} stroke={1.6} />
            </ActionIcon>
            <ColorSchemeToggle />
            <Menu position="bottom-end" width={180} withArrow>
              <Menu.Target>
                <UnstyledButton aria-label="User menu">
                  <Group gap={8} wrap="nowrap">
                    <Avatar radius="xl" size={32} color="emerald" variant="filled">
                      AD
                    </Avatar>
                    <Text fz="sm" fw={600} visibleFrom="sm">
                      admin
                    </Text>
                    <IconChevronDown size={14} stroke={1.8} style={{ opacity: 0.6 }} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Signed in as admin</Menu.Label>
                <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={logout}>
                  Logout
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar>
        <MantineAppShell.Section p="md" pb="sm">
          <UnstyledButton component={Link} to="/" onClick={close} style={{ display: 'block' }}>
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon size={38} radius="md" variant="filled" color="emerald">
                <IconChessKnight size={24} stroke={1.7} />
              </ThemeIcon>
              <div style={{ lineHeight: 1.15 }}>
                <Text fw={700} fz="md" style={{ letterSpacing: '-0.01em' }}>
                  Chess Platform
                </Text>
                <Text fz="xs" c="dimmed">
                  Admin Console
                </Text>
              </div>
            </Group>
          </UnstyledButton>
        </MantineAppShell.Section>

        <MantineAppShell.Section grow component={ScrollArea} px="sm" pb="md">
          {NAV_PAGES.map((p) => (
            <NavLink
              key={p.path}
              component={Link}
              to={p.path}
              label={p.label}
              leftSection={<p.icon size={18} stroke={1.6} />}
              active={pathname === p.path}
              onClick={close}
              style={{ borderRadius: 'var(--mantine-radius-sm)' }}
            />
          ))}

          {groups.map(({ group, tables: list }) => {
            const hasActive = list.some((t) => pathname === `/tables/${t.key}`)
            return (
              <NavLink
                key={group}
                label={group}
                defaultOpened={hasActive || !COLLAPSED_GROUPS.has(group)}
                childrenOffset={0}
                mt="sm"
                fw={600}
                fz="xs"
                c="dimmed"
                style={{ borderRadius: 'var(--mantine-radius-sm)' }}
              >
                {list.map((t) => {
                  const IconCmp = iconFor(t.icon)
                  return (
                    <NavLink
                      key={t.key}
                      component={Link}
                      to={`/tables/${t.key}`}
                      label={t.label}
                      leftSection={<IconCmp size={17} stroke={1.6} />}
                      active={pathname === `/tables/${t.key}`}
                      onClick={close}
                      fw={500}
                      fz="sm"
                      c="var(--mantine-color-text)"
                      style={{ borderRadius: 'var(--mantine-radius-sm)' }}
                    />
                  )
                })}
              </NavLink>
            )
          })}
        </MantineAppShell.Section>
      </MantineAppShell.Navbar>

      <MantineAppShell.Main
        style={{ background: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))' }}
      >
        <Container fluid px={{ base: 'md', lg: 'xl' }} py="lg">
          <Outlet />
        </Container>
      </MantineAppShell.Main>
    </MantineAppShell>
  )
}

export default AppShell
