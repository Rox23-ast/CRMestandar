export type ModuleKey = 'inbox' | 'leads' | 'quotes' | 'dashboard' | 'users' | 'bot' | 'settings'

export type InstallationTheme = {
  primary: string
  primaryLight: string
  secondary: string
  secondaryLight: string
  ink: string
  canvas: string
  surface: string
  line: string
  muted: string
  success: string
  warning: string
  danger: string
}

export type InstallationConfig = {
  appName: string
  clientName: string
  providerName: string
  productName: string
  title: string
  tagline: string
  loginSubtitle: string
  providerSignature: string
  logo: {
    fullColor: string
    symbolWhite: string
    favicon: string
  }
  theme: InstallationTheme
  locale: string
  timezone: string
  currency: string
  modules: Record<ModuleKey, boolean>
  botMode: 'general' | 'moving'
  quoteUrl: string
}

export const installation: InstallationConfig = {
  appName: 'G Consultores CRM',
  clientName: 'Mudanzas Chico',
  providerName: 'G Consultores',
  productName: 'CRM',
  title: 'G Consultores | CRM',
  tagline: 'Conversaciones, clientes y seguimiento comercial en un solo lugar.',
  loginSubtitle: 'Accede al CRM de Mudanzas Chico.',
  providerSignature: 'Tecnología de G Consultores',
  logo: {
    fullColor: 'brand/g-consultores-logo-color.png',
    symbolWhite: 'brand/g-consultores-symbol-white.png',
    favicon: 'brand/favicon-g-consultores.png'
  },
  theme: {
    primary: '#001B66',
    primaryLight: '#0B2F8A',
    secondary: '#0000C8',
    secondaryLight: '#E8EDFF',
    ink: '#2D2D2D',
    canvas: '#F5F7FB',
    surface: '#FFFFFF',
    line: '#DDE3EE',
    muted: '#667085',
    success: '#15803D',
    warning: '#B45309',
    danger: '#B42318'
  },
  locale: 'es-CO',
  timezone: 'America/Bogota',
  currency: 'COP',
  modules: {
    inbox: true,
    leads: true,
    quotes: false,
    dashboard: false,
    users: true,
    bot: true,
    settings: true
  },
  botMode: 'moving',
  quoteUrl: ''
}

export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`
