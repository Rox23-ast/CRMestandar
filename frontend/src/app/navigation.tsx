import type { ComponentType } from 'react'
import {
  Bot,
  Contact,
  Inbox,
  Key,
  MessageSquare,
  ShieldAlert,
  UserCheck,
  UserCog,
  Users,
  Zap
} from 'lucide-react'
import type { InstallationConfig } from '../config/installation'

export type AppView =
  | 'inbox'
  | 'leads'
  | 'statuses'
  | 'bot-messages'
  | 'bot-personality'
  | 'bot-dynamic'
  | 'bot-rules'
  | 'credentials'
  | 'users'
  | 'account'

type NavigationIcon = ComponentType<{ className?: string }>

export type NavigationItem = {
  id: AppView
  label: string
  icon: NavigationIcon
}

export type NavigationGroup = {
  id: string
  label: string
  defaultOpen: boolean
  items: NavigationItem[]
}

export const botViews: AppView[] = ['bot-messages', 'bot-personality', 'bot-dynamic', 'bot-rules']
export const botContentViews: AppView[] = ['bot-messages', 'bot-personality', 'bot-dynamic', 'bot-rules']

export const isBotView = (view: AppView) => botViews.includes(view)
export const isBotContentView = (view: AppView) => botContentViews.includes(view)

export function getNavigation(role: string, modules: InstallationConfig['modules']): NavigationGroup[] {
  const isAdmin = role === 'ADMIN'
  const canManageBot = isAdmin || role === 'MARKETING_DIRECTOR'
  const groups: NavigationGroup[] = []

  const crmItems: NavigationItem[] = []
  if (modules.inbox) crmItems.push({ id: 'inbox', label: 'Bandeja CRM', icon: Inbox })
  if (modules.leads) crmItems.push({ id: 'leads', label: 'Leads', icon: Contact })
  if (crmItems.length > 0) groups.push({ id: 'crm', label: 'CRM', defaultOpen: true, items: crmItems })

  if (modules.settings && canManageBot) {
    groups.push({
      id: 'crm-settings',
      label: 'Configuración CRM',
      defaultOpen: true,
      items: [{ id: 'statuses', label: 'Estados de Gestión', icon: UserCheck }]
    })
  }

  if (modules.bot && canManageBot) {
    const botItems: NavigationItem[] = [
      { id: 'bot-messages', label: 'Mensajes y Textos', icon: MessageSquare },
      { id: 'bot-personality', label: 'Personalidad IA', icon: Bot },
      { id: 'bot-dynamic', label: 'Respuestas Rápidas', icon: Zap },
      { id: 'bot-rules', label: 'Reglas y Límites', icon: ShieldAlert }
    ]
    if (isAdmin) botItems.push({ id: 'credentials', label: 'Configuración de APIs', icon: Key })
    groups.push({ id: 'bot', label: 'Configuración del Chatbot', defaultOpen: true, items: botItems })
  }

  if (modules.users && isAdmin) {
    groups.push({
      id: 'admin',
      label: 'Administración',
      defaultOpen: false,
      items: [{ id: 'users', label: 'Usuarios', icon: Users }]
    })
  }

  groups.push({
    id: 'account',
    label: 'Cuenta',
    defaultOpen: true,
    items: [{ id: 'account', label: 'Mi Cuenta', icon: UserCog }]
  })

  return groups
}

export function getViewMeta(view: AppView) {
  switch (view) {
    case 'leads':
      return { title: 'Leads', subtitle: 'Vista consolidada de clientes potenciales' }
    case 'statuses':
      return { title: 'Estados de Gestión', subtitle: 'Configura los estados de seguimiento de conversaciones' }
    case 'bot-messages':
      return { title: 'Mensajes y Textos', subtitle: 'Configura los mensajes que el bot envía a los clientes' }
    case 'bot-personality':
      return { title: 'Personalidad IA', subtitle: 'Define la personalidad y comportamiento de la IA' }
    case 'bot-dynamic':
      return { title: 'Respuestas Rápidas', subtitle: 'Configura respuestas automáticas por palabras clave' }
    case 'bot-rules':
      return { title: 'Reglas y Límites', subtitle: 'Define límites y restricciones para el bot' }
    case 'credentials':
      return { title: 'Configuración de APIs', subtitle: 'Gestiona credenciales de WhatsApp y OpenAI' }
    case 'users':
      return { title: 'Gestión de Usuarios', subtitle: 'Crea, edita y gestiona usuarios del CRM' }
    case 'account':
      return { title: 'Mi Cuenta', subtitle: 'Cambia tu contraseña y gestiona tu sesión' }
    default:
      return { title: 'Bandeja CRM', subtitle: 'Seguimiento de conversaciones y clientes' }
  }
}
