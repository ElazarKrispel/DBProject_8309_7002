import {
  IconActivity,
  IconBook,
  IconBuildingCommunity,
  IconChartBar,
  IconChess,
  IconCode,
  IconComponents,
  IconCpu,
  IconCreditCard,
  IconDeviceDesktop,
  IconEye,
  IconIdBadge,
  IconLayoutDashboard,
  IconLink,
  IconListDetails,
  IconLogin,
  IconMapPin,
  IconPlug,
  IconReceipt,
  IconReportAnalytics,
  IconRobot,
  IconServer,
  IconShare,
  IconShield,
  IconTable,
  IconTerminal2,
  IconUsers,
  type Icon,
} from '@tabler/icons-react'

export interface NavPage {
  label: string
  path: string
  icon: Icon
}

export const NAV_PAGES: NavPage[] = [
  { label: 'Dashboard', path: '/', icon: IconLayoutDashboard },
  { label: 'Reports', path: '/reports', icon: IconReportAnalytics },
  { label: 'Programs', path: '/programs', icon: IconTerminal2 },
  { label: 'SQL Console', path: '/sql', icon: IconCode },
]

export const GROUP_ORDER = [
  'Players & Clubs',
  'Billing',
  'Security',
  'Reference Data',
  'Engines & Infrastructure',
  'Views',
]

/** Groups rendered collapsed in the sidebar by default. */
export const COLLAPSED_GROUPS = new Set(['Reference Data', 'Engines & Infrastructure'])

/** Icon names sent by the backend (TableMeta.icon) mapped to tabler components. */
export const ICONS: Record<string, Icon> = {
  users: IconUsers,
  'building-community': IconBuildingCommunity,
  'id-badge': IconIdBadge,
  'credit-card': IconCreditCard,
  receipt: IconReceipt,
  login: IconLogin,
  share: IconShare,
  'list-details': IconListDetails,
  'device-desktop': IconDeviceDesktop,
  cpu: IconCpu,
  robot: IconRobot,
  chess: IconChess,
  'chart-bar': IconChartBar,
  server: IconServer,
  components: IconComponents,
  activity: IconActivity,
  link: IconLink,
  plug: IconPlug,
  eye: IconEye,
  table: IconTable,
  book: IconBook,
  'map-pin': IconMapPin,
  shield: IconShield,
}

export function iconFor(name: string | undefined): Icon {
  return (name && ICONS[name]) || IconTable
}
