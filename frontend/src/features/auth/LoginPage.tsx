import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { BrandLogo } from '../../components/brand/BrandLogo'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { installation } from '../../config/installation'

type LoginPageProps = {
  onLogin: (email: string, password: string) => Promise<unknown>
  sessionExpired: boolean
}

export function LoginPage({ onLogin, sessionExpired }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      await onLogin(email, password)
    } catch {
      setError('Credenciales inválidas o usuario no configurado.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
      <section className="relative hidden overflow-hidden bg-primary px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-secondary/25 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10">
          <div className="inline-flex rounded-2xl bg-white p-4 shadow-2xl">
            <BrandLogo className="h-20 w-auto" />
          </div>
          <p className="mt-10 text-sm font-semibold uppercase tracking-[0.22em] text-white/60">{installation.providerName}</p>
          <h1 className="mt-3 max-w-xl text-5xl font-extrabold leading-[1.08]">{installation.productName}</h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-white/70">{installation.tagline}</p>
        </div>

        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/70">
            <ShieldCheck className="h-4 w-4 text-white/80" />
            Acceso seguro para el equipo comercial
          </div>
          <p className="text-sm text-white/45">{installation.providerSignature}</p>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandLogo className="h-12 w-auto" />
            <div>
              <p className="text-sm font-bold text-primary">{installation.providerName}</p>
              <p className="text-xs text-muted">{installation.productName}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
            <p className="ui-eyebrow">Acceso al sistema</p>
            <h2 className="mt-2 text-3xl text-primary">Iniciar sesión</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{installation.loginSubtitle}</p>

            {sessionExpired && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-warning">
                Tu sesión expiró. Vuelve a ingresar para continuar.
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <label className="block">
                <span className="ui-label">Correo electrónico</span>
                <span className="relative block">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="nombre@empresa.com"
                    className="pl-10"
                  />
                </span>
              </label>

              <label className="block">
                <span className="ui-label">Contraseña</span>
                <span className="relative block">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="Tu contraseña"
                    className="pl-10"
                  />
                </span>
              </label>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-danger">{error}</p>}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Ingresando…' : 'Ingresar'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-muted">{installation.providerSignature}</p>
        </div>
      </section>
    </div>
  )
}
