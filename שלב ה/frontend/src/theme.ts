import {
  Badge,
  Button,
  Card,
  createTheme,
  Modal,
  NumberInput,
  Paper,
  PasswordInput,
  Select,
  Table,
  Textarea,
  TextInput,
  Title,
  type MantineColorsTuple,
} from "@mantine/core";

const emerald: MantineColorsTuple = [
  "#ecfdf5",
  "#d1fae5",
  "#a7f3d0",
  "#6ee7b7",
  "#34d399",
  "#10b981",
  "#059669",
  "#047857",
  "#065f46",
  "#064e3b",
];

const slate: MantineColorsTuple = [
  "#f8fafc",
  "#f1f5f9",
  "#e2e8f0",
  "#cbd5e1",
  "#94a3b8",
  "#64748b",
  "#475569",
  "#334155",
  "#1e293b",
  "#0f172a",
];

export const theme = createTheme({
  primaryColor: "emerald",
  autoContrast: true,
  primaryShade: { light: 7, dark: 4 },
  colors: { emerald, slate },
  fontFamily: "Manrope Variable, system-ui, sans-serif",
  fontFamilyMonospace: "JetBrains Mono, ui-monospace, monospace",
  headings: {
    fontFamily: "Manrope Variable, system-ui, sans-serif",
    fontWeight: "700",
    sizes: {
      h1: { fontSize: "1.75rem", lineHeight: "1.2" },
      h2: { fontSize: "1.375rem", lineHeight: "1.25" },
      h3: { fontSize: "1.125rem", lineHeight: "1.3" },
    },
  },
  defaultRadius: "md",
  cursorType: "pointer",
  components: {
    Title: Title.extend({
      styles: { root: { letterSpacing: "-0.02em" } },
    }),
    Button: Button.extend({
      defaultProps: { fw: 600 },
    }),
    Card: Card.extend({
      defaultProps: { withBorder: true, shadow: "xs", padding: "lg" },
    }),
    Paper: Paper.extend({
      defaultProps: { withBorder: true },
    }),
    Table: Table.extend({
      defaultProps: {
        striped: true,
        highlightOnHover: true,
        verticalSpacing: "sm",
        horizontalSpacing: "md",
      },
    }),
    TextInput: TextInput.extend({ defaultProps: { size: "sm" } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { size: "sm" } }),
    NumberInput: NumberInput.extend({ defaultProps: { size: "sm" } }),
    Select: Select.extend({
      defaultProps: { size: "sm", checkIconPosition: "right" },
    }),
    Textarea: Textarea.extend({
      defaultProps: { size: "sm", autosize: true, minRows: 3 },
    }),
    Badge: Badge.extend({ defaultProps: { variant: "light", radius: "sm" } }),
    Modal: Modal.extend({
      defaultProps: {
        centered: true,
        overlayProps: { backgroundOpacity: 0.45, blur: 2 },
      },
    }),
  },
});
