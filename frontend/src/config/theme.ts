import type { InstallationConfig, InstallationTheme } from './installation'
import { assetUrl } from './installation'

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized

  return `${Number.parseInt(value.slice(0, 2), 16)} ${Number.parseInt(value.slice(2, 4), 16)} ${Number.parseInt(value.slice(4, 6), 16)}`
}

const themeVariables: Record<keyof InstallationTheme, string> = {
  primary: '--color-primary',
  primaryLight: '--color-primary-light',
  secondary: '--color-secondary',
  secondaryLight: '--color-secondary-light',
  ink: '--color-ink',
  canvas: '--color-canvas',
  surface: '--color-surface',
  line: '--color-line',
  muted: '--color-muted',
  success: '--color-success',
  warning: '--color-warning',
  danger: '--color-danger'
}

export const applyInstallation = (config: InstallationConfig) => {
  const root = document.documentElement

  Object.entries(config.theme).forEach(([key, value]) => {
    root.style.setProperty(themeVariables[key as keyof InstallationTheme], hexToRgb(value))
  })

  root.lang = config.locale.split('-')[0]
  document.title = config.title

  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (favicon) favicon.href = assetUrl(config.logo.favicon)

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (themeColor) themeColor.content = config.theme.primary
}
