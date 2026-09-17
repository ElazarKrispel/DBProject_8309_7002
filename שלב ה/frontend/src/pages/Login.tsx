import {
  Box,
  Button,
  Checkbox,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  useComputedColorScheme,
} from '@mantine/core'
import { IconChessKnight } from '@tabler/icons-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { login } from '../api/client'
import { isAuthed, setToken } from '../auth'
import { ColorSchemeToggle } from '../components/shell/AppShell'
import { ErrorAlert } from '../components/ui/ErrorAlert'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const dark = useComputedColorScheme('light') === 'dark'
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)

  if (isAuthed()) return <Navigate to="/" replace />

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { token } = await login(username.trim(), password)
      setToken(token, remember)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  const tint = dark ? 'rgba(16,185,129,0.10)' : 'rgba(5,150,105,0.08)'
  const square = dark ? 'rgba(255,255,255,0.025)' : 'rgba(6,78,59,0.045)'
  const base = dark ? 'var(--mantine-color-dark-8)' : '#f4f7f5'

  return (
    <Box
      mih="100vh"
      style={{
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        backgroundColor: base,
        backgroundImage: [
          `radial-gradient(ellipse 60% 50% at 50% -10%, ${tint}, transparent 70%)`,
          `repeating-conic-gradient(${square} 0% 25%, transparent 0% 50%)`,
        ].join(', '),
        backgroundSize: '100% 100%, 56px 56px',
      }}
    >
      <Box pos="absolute" top={16} right={16}>
        <ColorSchemeToggle />
      </Box>

      <Paper w="100%" maw={400} p="xl" radius="lg" shadow="md">
        <form onSubmit={submit}>
          <Stack gap="md">
            <Stack gap={6} align="center" mb="xs">
              <ThemeIcon size={56} radius="md" color="emerald" variant="filled">
                <IconChessKnight size={34} stroke={1.6} />
              </ThemeIcon>
              <Title order={2} ta="center" mt="xs">
                Chess Platform Admin
              </Title>
              <Text c="dimmed" fz="sm" ta="center">
                Users and Clubs unit, PostgreSQL 18
              </Text>
            </Stack>

            {error != null && <ErrorAlert error={error} title="Sign in failed" onClose={() => setError(null)} />}

            <TextInput
              label="Username"
              placeholder="admin"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              required
              data-autofocus
            />
            <PasswordInput
              label="Password"
              placeholder="Your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />
            <Group justify="space-between">
              <Checkbox
                label="Remember me"
                size="sm"
                checked={remember}
                onChange={(e) => setRemember(e.currentTarget.checked)}
              />
            </Group>
            <Button type="submit" fullWidth size="md" loading={loading}>
              Sign in
            </Button>
            <Text c="dimmed" fz="xs" ta="center">
              Default credentials: admin / admin
            </Text>
          </Stack>
        </form>
      </Paper>
    </Box>
  )
}
