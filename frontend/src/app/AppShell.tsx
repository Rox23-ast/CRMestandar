import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, LogOut, Menu } from 'lucide-react'
import { BrandLogo } from '../components/brand/BrandLogo'
import { Button } from '../components/ui/Button'
import { installation } from '../config/installation'
import { cn } from '../lib/cn'
import type { AppView, NavigationGroup } from './navigation'

type AppShellProps = {
  navigation: NavigationGroup[]
  activeView: AppView
  onNavigate: (view: AppView) => void
  title: string
  subtitle: string
  userName: string
  userRole: string
  onLogout: () => void
  headerActions?: ReactNode
  children: ReactNode
}

const roleLabels: Record<string, string> = {
  ADMIN: 'Administrador',
  MARKETING_DIRECTOR: 'Dirección de marketing',
  AGENT: 'Asesor'
}

function SidebarGroup({
  group,
  activeView,
  onNavigate
}: {
  group: NavigationGroup
  activeView: AppView
  onNavigate: (view: AppView) => void
}) {
  const [open, setOpen] = useState(group.defaultOpen)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 transition-colors hover:text-white"
      >
        <span>{group.label}</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {open && (
        <div className="mt-1 space-y-1">
          {group.items.map((item) => {
            const Icon = item.icon
            const active = activeView === item.id

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
                  active ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/5 hover:text-white'
                )}
              >
                <Icon className={cn('h-5 w-5 flex-shrink-0', active ? 'text-white' : 'text-white/55')} />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function AppShell({
  navigation,
  activeView,
  onNavigate,
  title,
  subtitle,
  userName,
  userRole,
  onLogout,
  headerActions,
  children
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  const navigate = (view: AppView) => {
    onNavigate(view)
    setSidebarOpen(false)
  }

  return (
    <div className="flex h-screen h-dvh overflow-hidden bg-canvas font-sans">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-primary/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-primary text-white shadow-2xl transition-transform duration-200 md:static md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="border-b border-white/10 px-5 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <BrandLogo variant="symbol" tone="white" className="h-8 w-8" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-extrabold leading-none">{installation.providerName}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/55">{installation.productName}</p>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Cliente</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-white">{installation.clientName}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-5">
          {navigation.map((group) => (
            <SidebarGroup key={group.id} group={group} activeView={activeView} onNavigate={navigate} />
          ))}
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-[11px] leading-relaxed text-white/45">{installation.providerSignature}</p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-4 border-b border-line bg-surface/95 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg border border-line p-2 text-primary transition-colors hover:bg-canvas md:hidden"
              title="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-xl text-primary md:text-2xl">{title}</h1>
              <p className="mt-0.5 truncate text-xs text-muted md:text-sm">{subtitle}</p>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2 md:gap-3">
            {headerActions}
            <div className="hidden items-center gap-2 rounded-full border border-line bg-canvas px-2 py-1.5 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {initials || 'GC'}
              </span>
              <span className="max-w-36 leading-tight">
                <span className="block truncate text-xs font-semibold text-ink">{userName}</span>
                <span className="block truncate text-[10px] text-muted">{roleLabels[userRole] ?? userRole}</span>
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={onLogout} className="px-2.5">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </main>
    </div>
  )
}
