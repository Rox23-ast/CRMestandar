import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import { MessageCircle, Send, UserCheck, UserPlus, Bot, ChevronDown, X } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type BusinessStatusConfig = {
  code: string
  label: string
  color: string
  isFinal: boolean
  isActive: boolean
  sortOrder: number
}

type Conversation = {
  id: string
  status: string
  priority: string
  businessStatus?: string | null
  source?: string | null
  assignedUserId?: string | null
  assignedRole?: string | null
  client: { phone: string; name?: string | null }
  assignedUser?: { id: string; name: string; role: string } | null
  lastMessageAt: string
}

type Message = {
  id: string
  direction: string
  senderType: string
  type: string
  body?: string | null
  deliveryStatus: string
  createdAt: string
}

type ConversationDetail = Conversation & { messages: Message[] }

const statusLabels: Record<string, string> = {
  NEW: 'Nueva',
  BOT_ACTIVE: 'Bot activo',
  HUMAN_ACTIVE: 'Atención humana',
  WAITING_CUSTOMER: 'Esperando cliente',
  RESOLVED: 'Resuelta',
  CLOSED: 'Cerrada'
}

const priorityLabels: Record<string, string> = {
  URGENT: 'Urgente',
  HIGH: 'Alta',
  NORMAL: 'Normal',
  LOW: 'Baja'
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` })

export default function CrmInbox({ token, userRole }: { token: string; userRole: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<ConversationDetail | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [unread, setUnread] = useState(0)
  const [statusConfigs, setStatusConfigs] = useState<BusinessStatusConfig[]>([])
  const [assignableUsers, setAssignableUsers] = useState<{ id: string; name: string; role: string }[]>([])
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterSource, setFilterSource] = useState<string>('')
  const [filterIncludeFinal, setFilterIncludeFinal] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [assignMenuOpen, setAssignMenuOpen] = useState(false)
  const [botEnabled, setBotEnabled] = useState(true)
  const [togglingBot, setTogglingBot] = useState(false)
  const botConfigRef = useRef<Record<string, unknown> | null>(null)
  const statusMenuRef = useRef<HTMLDivElement | null>(null)
  const assignMenuRef = useRef<HTMLDivElement | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const eventAbort = useRef<AbortController | null>(null)
  const canAssign = userRole === 'ADMIN' || userRole === 'MARKETING_DIRECTOR'

  const loadAssignableUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/crm/assignable-users`, { headers: authHeaders(token) })
      setAssignableUsers(response.data)
    } catch {
      // Assignment dropdown just stays empty if the list cannot be loaded.
    }
  }

  const loadBotEnabled = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/bot/config`, { headers: authHeaders(token) })
      const data = response.data
      if (!Array.isArray(data.customRules)) data.customRules = []
      botConfigRef.current = data
      setBotEnabled(data.botEnabled !== false)
    } catch {
      // Toggle stays in its default state if the config cannot be loaded.
    }
  }

  const handleToggleBot = async () => {
    if (togglingBot || !botConfigRef.current) return
    setTogglingBot(true)
    const previous = botEnabled
    setBotEnabled(!previous)
    try {
      const payload = { ...botConfigRef.current, botEnabled: !previous }
      const response = await axios.put(`${API_URL}/api/bot/config`, payload, { headers: authHeaders(token) })
      botConfigRef.current = response.data
      setBotEnabled(response.data.botEnabled !== false)
    } catch {
      setBotEnabled(previous)
      setError('No fue posible cambiar el estado del bot.')
    } finally {
      setTogglingBot(false)
    }
  }

  const loadStatusConfigs = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/crm/settings/statuses`, { headers: authHeaders(token) })
      setStatusConfigs(response.data)
    } catch {
      // Silently fail, status badges will just not show
    }
  }

  const loadConversations = async () => {
    const params = new URLSearchParams()
    if (filterStatus) params.set('businessStatus', filterStatus)
    if (filterSource) params.set('source', filterSource)
    if (filterIncludeFinal) params.set('includeFinal', 'true')
    const response = await axios.get(`${API_URL}/api/crm/conversations?${params.toString()}`, { headers: authHeaders(token) })
    setConversations(response.data.data)
  }

  const loadConversation = async (id: string) => {
    const response = await axios.get(`${API_URL}/api/crm/conversations/${id}`, { headers: authHeaders(token) })
    setSelected(response.data)
  }

  useEffect(() => {
    if (!token) return
    loadStatusConfigs()
    if (canAssign) {
      void loadAssignableUsers()
      void loadBotEnabled()
    }
    void loadConversations().catch(() => setError('No fue posible cargar las conversaciones.'))

    const controller = new AbortController()
    eventAbort.current = controller
    const listen = async () => {
      let reconnectDelay = 5000
      while (!controller.signal.aborted) {
        try {
          const response = await fetch(`${API_URL}/api/crm/events`, {
            headers: authHeaders(token),
            signal: controller.signal
          })
          if (!response.body) return
          reconnectDelay = 5000
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          while (!controller.signal.aborted) {
            const { value, done } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value)
            if (chunk.includes('notification.created')) {
              setUnread((current) => current + 1)
              void loadConversations()
            }
          }
        } catch {
          // The inbox remains usable if the SSE connection is interrupted.
        }
        if (!controller.signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, reconnectDelay))
          reconnectDelay = Math.min(reconnectDelay * 2, 60000)
        }
      }
    }
    void listen()
    return () => controller.abort()
  }, [token])

  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null
  }, [selected])

  // Auto-refresh: polling ligero para no depender del F5 ni del SSE.
  // También refresca de inmediato al cambiar filtros, sin esperar el próximo tick.
  useEffect(() => {
    if (!token) return
    const refresh = () => {
      void loadConversations().catch(() => undefined)
      if (selectedIdRef.current) {
        void loadConversation(selectedIdRef.current).catch(() => undefined)
      }
      if (canAssign) void loadBotEnabled()
    }
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filterStatus, filterSource, filterIncludeFinal, canAssign])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target as Node)) {
        setStatusMenuOpen(false)
      }
      if (assignMenuRef.current && !assignMenuRef.current.contains(event.target as Node)) {
        setAssignMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleTake = async () => {
    if (!selected) return
    await axios.post(`${API_URL}/api/crm/conversations/${selected.id}/claim`, {}, { headers: authHeaders(token) })
    await Promise.all([loadConversation(selected.id), loadConversations()])
  }

  const handleReturnToBot = async () => {
    if (!selected) return
    await axios.post(`${API_URL}/api/crm/conversations/${selected.id}/bot`, {}, { headers: authHeaders(token) })
    await Promise.all([loadConversation(selected.id), loadConversations()])
  }

  const handleBusinessStatusChange = async (newStatus: string) => {
    if (!selected) return
    try {
      await axios.patch(
        `${API_URL}/api/crm/conversations/${selected.id}/status`,
        { businessStatus: newStatus },
        { headers: authHeaders(token) }
      )
      setStatusMenuOpen(false)
      await Promise.all([loadConversation(selected.id), loadConversations()])
    } catch {
      setError('No fue posible actualizar el estado de gestión.')
    }
  }

  const handleAssign = async (userId: string) => {
    if (!selected) return
    try {
      await axios.post(
        `${API_URL}/api/crm/conversations/${selected.id}/assign`,
        { userId },
        { headers: authHeaders(token) }
      )
      setAssignMenuOpen(false)
      await Promise.all([loadConversation(selected.id), loadConversations()])
    } catch {
      setError('No fue posible asignar la conversación.')
    }
  }

  const handleSend = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected || !draft.trim()) return
    try {
      await axios.post(
        `${API_URL}/api/crm/conversations/${selected.id}/messages`,
        { body: draft },
        { headers: authHeaders(token) }
      )
      setDraft('')
      await Promise.all([loadConversation(selected.id), loadConversations()])
    } catch {
      setError('No fue posible enviar el mensaje por WhatsApp.')
    }
  }

  const getBusinessStatusInfo = (code?: string | null) => {
    if (!code) return { label: 'Sin estado', color: '#94a3b8' }
    const config = statusConfigs.find(s => s.code === code)
    return config ? { label: config.label, color: config.color } : { label: code, color: '#94a3b8' }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-neutral-light">
      {error && <div className="bg-red-50 text-red-700 px-6 py-3 text-sm flex-shrink-0">{error}</div>}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] w-full mx-auto overflow-hidden">
        <section className="bg-white border-r border-neutral-gray flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-neutral-gray flex-shrink-0 flex justify-between items-center">
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-darkgray">Conversaciones</p>
              <p className="text-sm text-primary mt-1">{conversations.length} activas</p>
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && <span className="bg-secondary text-white text-xs px-2 py-1 rounded-full">{unread} nuevas</span>}
              {canAssign && (
                <button
                  type="button"
                  onClick={() => void handleToggleBot()}
                  disabled={togglingBot}
                  title={botEnabled ? 'Desactivar el bot para que los mensajes los gestionen agentes humanos' : 'Activar el bot para que responda automáticamente'}
                  className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 transition-colors ${botEnabled ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'}`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>{togglingBot ? 'Cambiando…' : botEnabled ? 'Bot activo' : 'Bot desactivado'}</span>
                </button>
              )}
            </div>
          </div>
          {/* Filtros */}
          <div className="p-3 border-b border-neutral-gray bg-neutral-light/30 space-y-2">
            <div className="flex items-center space-x-2">
              <label className="flex items-center space-x-2 text-sm text-neutral-darkgray cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterIncludeFinal}
                  onChange={(e) => setFilterIncludeFinal(e.target.checked)}
                  className="w-4 h-4 text-secondary border-neutral-gray rounded focus:ring-secondary/50"
                />
                <span>Ver finalizadas</span>
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-xs text-neutral-darkgray w-20">Estado gestión:</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flex-1 border border-neutral-gray rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary bg-white"
              >
                <option value="">Todos</option>
                {statusConfigs
                  .filter(s => s.isActive)
                  .map((s) => (
                    <option key={s.code} value={s.code}>{s.label}</option>
                  ))}
              </select>
              {filterStatus && (
                <button
                  onClick={() => setFilterStatus('')}
                  className="p-1.5 text-neutral-darkgray hover:text-red-500 transition-colors"
                  title="Limpiar filtro"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-xs text-neutral-darkgray w-20">Origen:</label>
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                className="flex-1 border border-neutral-gray rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary bg-white"
              >
                <option value="">Todos</option>
                <option value="ADS">Pauta (Meta Ads)</option>
                <option value="ORGANIC">Orgánico</option>
              </select>
              {filterSource && (
                <button
                  onClick={() => setFilterSource('')}
                  className="p-1.5 text-neutral-darkgray hover:text-red-500 transition-colors"
                  title="Limpiar filtro"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
          {conversations.map((conversation) => {
            const bizInfo = getBusinessStatusInfo(conversation.businessStatus)
            return (
              <button key={conversation.id} onClick={() => void loadConversation(conversation.id)} className={`w-full text-left p-4 border-b border-neutral-gray hover:bg-neutral-light ${selected?.id === conversation.id ? 'bg-secondary/20 border-l-4 border-l-accent-gold' : ''}`}>
                <div className="flex justify-between gap-2">
                  <strong className="text-primary truncate">{conversation.client.name || conversation.client.phone}</strong>
                  <span className="text-[11px] text-neutral-darkgray flex items-center gap-1 flex-shrink-0">
                    {conversation.source === 'ADS' && (
                      <span className="bg-blue-100 text-blue-800 text-[10px] font-medium px-1.5 py-0.5 rounded-full">Pauta</span>
                    )}
                    {priorityLabels[conversation.priority]}
                  </span>
                </div>
                <div className="flex justify-between mt-2 text-xs text-neutral-darkgray">
                  <span>{statusLabels[conversation.status] || conversation.status}</span>
                  <span>{conversation.assignedUser?.name || 'Marketing'}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 text-[10px] font-medium rounded-full text-white"
                    style={{ backgroundColor: bizInfo.color }}
                  >
                    {bizInfo.label}
                  </span>
                </div>
              </button>
            )
          })}
          </div>
        </section>
        <section className="flex flex-col h-full overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-neutral-darkgray"><div className="text-center"><MessageCircle className="w-12 h-12 mx-auto mb-3 text-secondary" /><p>Selecciona una conversación para ver el historial.</p></div></div>
          ) : (
            <>
              <div className="bg-white border-b border-neutral-gray p-5 flex flex-wrap justify-between gap-4">
                <div>
                  <h2 className="font-cormorant text-2xl text-primary">{selected.client.name || selected.client.phone}</h2>
                  <p className="text-sm text-neutral-darkgray">{statusLabels[selected.status] || selected.status} · {priorityLabels[selected.priority]} · Asignada a: {selected.assignedUser?.name || 'Sin asignar'}</p>
                  {selected.businessStatus && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-neutral-darkgray">Gestión:</span>
                      <span
                        className="px-2 py-0.5 text-xs font-medium rounded-full text-white"
                        style={{ backgroundColor: getBusinessStatusInfo(selected.businessStatus).color }}
                      >
                        {getBusinessStatusInfo(selected.businessStatus).label}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canAssign && (
                    <div className="relative" ref={assignMenuRef}>
                      <button
                        type="button"
                        onClick={() => setAssignMenuOpen((open) => !open)}
                        className="border border-secondary text-secondary px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-secondary/10 transition-colors"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Asignar</span>
                      </button>
                      {assignMenuOpen && (
                        <div className="absolute right-0 mt-1 w-56 bg-white border border-neutral-gray rounded-md shadow-lg z-10 py-1 max-h-64 overflow-y-auto">
                          {assignableUsers.length === 0 && (
                            <p className="px-3 py-2 text-xs text-neutral-darkgray">No hay usuarios activos para asignar.</p>
                          )}
                          {assignableUsers.map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => handleAssign(user.id)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-light/50 flex items-center justify-between gap-2"
                            >
                              <span className="truncate">{user.name}</span>
                              <span className="text-[10px] text-neutral-darkgray flex-shrink-0">
                                {user.role === 'MARKETING_DIRECTOR' ? 'Marketing' : 'Agente'}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {selected.status !== 'HUMAN_ACTIVE' && (
                    <button onClick={() => void handleTake()} className="bg-primary text-white px-3 py-2 rounded text-sm flex items-center gap-2">
                      <UserCheck className="w-4 h-4" />Tomar conversación
                    </button>
                  )}
                  {selected.status === 'HUMAN_ACTIVE' && (
                    <button onClick={() => void handleReturnToBot()} className="border border-primary text-primary px-3 py-2 rounded text-sm">
                      Devolver al bot
                    </button>
                  )}
                  {statusConfigs.filter(s => s.isActive).length > 0 && (
                    <div className="relative" ref={statusMenuRef}>
                      <button
                        type="button"
                        onClick={() => setStatusMenuOpen((open) => !open)}
                        className="border border-neutral-gray text-neutral-dark px-3 py-2 rounded text-sm flex items-center gap-1 hover:bg-neutral-light/50 transition-colors"
                      >
                        <ChevronDown className="w-4 h-4" />
                        <span>Cambiar estado</span>
                      </button>
                      {statusMenuOpen && (
                        <div className="absolute right-0 mt-1 w-48 bg-white border border-neutral-gray rounded-md shadow-lg z-10 py-1">
                          {statusConfigs
                            .filter(s => s.isActive)
                            .map((s) => (
                              <button
                                key={s.code}
                                type="button"
                                onClick={() => handleBusinessStatusChange(s.code)}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-light/50 flex items-center gap-2"
                              >
                                <span
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: s.color }}
                                />
                                <span>{s.label}</span>
                                {s.isFinal && <span className="ml-auto px-1.5 py-0.5 bg-green-100 text-green-800 text-[10px] rounded">Final</span>}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">{selected.messages.map((message) => <div key={message.id} className={`max-w-[80%] rounded-lg p-3 text-sm ${message.direction === 'OUTBOUND' ? 'ml-auto bg-primary text-white' : 'bg-white border border-neutral-gray text-neutral-dark'}`}><p>{message.body || `Archivo ${message.type.toLowerCase()} recibido.`}</p><p className="text-[10px] opacity-60 mt-1">{message.senderType} · {new Date(message.createdAt).toLocaleString()}</p></div>)}</div>
              <form onSubmit={handleSend} className="bg-white border-t border-neutral-gray p-4 flex gap-3"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escribe una respuesta para WhatsApp..." className="flex-1 border border-neutral-gray rounded-md px-3 py-2" /><button className="bg-accent-gold text-white px-4 rounded-md flex items-center gap-2"><Send className="w-4 h-4" />Enviar</button></form>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
