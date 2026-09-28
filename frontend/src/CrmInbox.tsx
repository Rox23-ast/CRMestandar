import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import { MessageCircle, Send, UserCheck, UserPlus, Bot, Paperclip, Mic, Square, ChevronDown, X } from 'lucide-react'

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
  mediaId?: string | null
  deliveryStatus: string
  createdAt: string
}

type ConversationDetail = Conversation & { messages: Message[] }

type PendingAttachment = {
  file: File
  mime: string
  kind: 'image' | 'audio' | 'video' | 'document'
}

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

const InboundMedia = ({ token, mediaId, type, body }: { token: string; mediaId: string; type: string; body?: string | null }) => {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!mediaId) return
    let objectUrl: string | null = null
    let cancelled = false
    axios
      .get(`${API_URL}/api/crm/media/${mediaId}`, { headers: authHeaders(token), responseType: 'blob' })
      .then((response) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(response.data)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [mediaId, token])

  if (!mediaId || failed) return <p>{body || `Archivo ${type.toLowerCase()} recibido.`}</p>
  if (!url) return <p>Cargando {type.toLowerCase()}…</p>
  if (type === 'IMAGE') return <img src={url} alt={body || 'imagen'} className="max-w-full rounded" />
  if (type === 'VIDEO') return <video src={url} controls className="max-w-full rounded" />
  if (type === 'AUDIO') return <audio src={url} controls className="w-full" />
  if (type === 'DOCUMENT') {
    return (
      <div>
        {body && <p className="mb-2">{body}</p>}
        <a href={url} target="_blank" rel="noreferrer" download className="underline text-secondary">Descargar documento</a>
      </div>
    )
  }
  return <p>{body || `Archivo ${type.toLowerCase()} recibido.`}</p>
}

export default function CrmInbox({ token, userRole }: { token: string; userRole: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [totalConversations, setTotalConversations] = useState(0)
  const [conversationPage, setConversationPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selected, setSelected] = useState<ConversationDetail | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [unread, setUnread] = useState(0)
  const [statusConfigs, setStatusConfigs] = useState<BusinessStatusConfig[]>([])
  const [assignableUsers, setAssignableUsers] = useState<{ id: string; name: string; role: string }[]>([])
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterSource, setFilterSource] = useState<string>('')
  const [filterIncludeFinal, setFilterIncludeFinal] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [startOpen, setStartOpen] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [assignMenuOpen, setAssignMenuOpen] = useState(false)
  const [botEnabled, setBotEnabled] = useState(true)
  const [togglingBot, setTogglingBot] = useState(false)
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const botConfigRef = useRef<Record<string, unknown> | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<number | null>(null)
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

  const loadConversations = async (pageToLoad = 1, append = false) => {
    const params = new URLSearchParams()
    if (filterStatus) params.set('businessStatus', filterStatus)
    if (filterSource) params.set('source', filterSource)
    if (filterSearch) params.set('search', filterSearch)
    if (filterIncludeFinal) params.set('includeFinal', 'true')
    params.set('page', String(pageToLoad))
    params.set('pageSize', '50')
    const response = await axios.get(`${API_URL}/api/crm/conversations?${params.toString()}`, { headers: authHeaders(token) })
    setTotalConversations(response.data.pagination?.total ?? response.data.data.length)
    setConversationPage(pageToLoad)
    setConversations((current) => (append ? [...current, ...response.data.data] : response.data.data))
  }

  const loadMoreConversations = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      await loadConversations(conversationPage + 1, true)
    } catch {
      setError('No fue posible cargar más conversaciones.')
    } finally {
      setLoadingMore(false)
    }
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
              const match = chunk.match(/"conversationId":"([^"]+)"/)
              if (match?.[1] && match[1] === selectedIdRef.current) {
                void loadConversation(match[1]).catch(() => undefined)
              }
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
  }, [token, filterStatus, filterSource, filterSearch, filterIncludeFinal, canAssign])

  // Debounce del buscador para no disparar una petición por tecla.
  useEffect(() => {
    const handler = setTimeout(() => setFilterSearch(searchInput.trim()), 400)
    return () => clearTimeout(handler)
  }, [searchInput])

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

  const handleStartChat = async (event: FormEvent) => {
    event.preventDefault()
    const phone = newPhone.replace(/[^\d+]/g, '')
    if (!phone || !newMessage.trim()) return
    try {
      const response = await axios.post(
        `${API_URL}/api/crm/conversations/start`,
        { phone, body: newMessage.trim() },
        { headers: authHeaders(token) }
      )
      setNewPhone('')
      setNewMessage('')
      setStartOpen(false)
      await loadConversations()
      await loadConversation(response.data.conversation.id)
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ? `No fue posible iniciar la conversación: ${detail}` : 'No fue posible iniciar la conversación.')
    }
  }

  const handleSend = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    if (attachment) {
      await sendAttachment()
      return
    }
    if (!draft.trim()) return
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

  const kindOfFile = (file: File): PendingAttachment['kind'] => {
    if (file.type.startsWith('image/')) return 'image'
    if (file.type.startsWith('video/')) return 'video'
    if (file.type.startsWith('audio/')) return 'audio'
    return 'document'
  }

  const handleFilePick = (file: File | undefined) => {
    if (!file) return
    setAttachment({ file, mime: file.type || 'application/octet-stream', kind: kindOfFile(file) })
  }

  const startRecording = async () => {
    if (recording || !navigator.mediaDevices?.getUserMedia) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferred = ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus']
      const mime = preferred.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blobType = recorder.mimeType || 'audio/webm'
        const ext = blobType.includes('mp4') ? 'm4a' : blobType.includes('ogg') ? 'ogg' : 'webm'
        const blob = new Blob(chunksRef.current, { type: blobType })
        setAttachment({
          file: new File([blob], `nota-de-voz-${Date.now()}.${ext}`, { type: blobType }),
          mime: blobType,
          kind: 'audio'
        })
        setRecording(false)
        if (recordTimerRef.current !== null) {
          clearInterval(recordTimerRef.current)
          recordTimerRef.current = null
        }
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
      setRecordSeconds(0)
      recordTimerRef.current = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000)
    } catch {
      setError('No fue posible acceder al micrófono.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }

  const sendAttachment = async () => {
    if (!selected || !attachment) return
    try {
      const params = new URLSearchParams()
      params.set('type', attachment.kind)
      params.set('mediaType', attachment.mime)
      params.set('filename', attachment.file.name)
      if (draft.trim()) params.set('caption', draft.trim())
      await axios.post(
        `${API_URL}/api/crm/conversations/${selected.id}/attachments?${params.toString()}`,
        attachment.file,
        { headers: { ...authHeaders(token), 'Content-Type': attachment.mime } }
      )
      setAttachment(null)
      setDraft('')
      await Promise.all([loadConversation(selected.id), loadConversations()])
    } catch {
      setError('No fue posible enviar el archivo por WhatsApp.')
    }
  }

  const getBusinessStatusInfo = (code?: string | null) => {
    if (!code) return { label: 'Sin estado', color: '#94a3b8' }
    const config = statusConfigs.find(s => s.code === code)
    return config ? { label: config.label, color: config.color } : { label: code, color: '#94a3b8' }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative bg-neutral-light">
      {error && <div className="bg-red-50 text-red-700 px-6 py-3 text-sm flex-shrink-0">{error}</div>}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] w-full mx-auto overflow-hidden">
        <section className="bg-white border-r border-neutral-gray flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-neutral-gray flex-shrink-0 flex justify-between items-center">
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-darkgray">Conversaciones</p>
              <p className="text-sm text-primary mt-1">{totalConversations} activas</p>
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
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por número o nombre…"
              className="w-full border border-neutral-gray rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary bg-white"
            />
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
            {startOpen ? (
              <form onSubmit={handleStartChat} className="space-y-2 pt-1">
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Número (ej. 573001112233)"
                  className="w-full border border-neutral-gray rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary bg-white"
                />
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Primer mensaje…"
                  className="w-full border border-neutral-gray rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary bg-white"
                />
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 bg-primary text-white px-3 py-1.5 rounded-md text-sm">
                    Iniciar chat
                  </button>
                  <button type="button" onClick={() => setStartOpen(false)} className="border border-neutral-gray text-neutral-dark px-3 py-1.5 rounded-md text-sm">
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setStartOpen(true)}
                className="w-full border border-dashed border-secondary/50 text-secondary px-3 py-1.5 rounded-md text-sm hover:bg-secondary/10 transition-colors"
              >
                + Nuevo chat con otro número
              </button>
            )}
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
          {conversations.length < totalConversations && (
            <button
              onClick={() => void loadMoreConversations()}
              disabled={loadingMore}
              className="w-full p-3 text-sm text-secondary hover:bg-neutral-light/50 transition-colors"
            >
              {loadingMore ? 'Cargando…' : `Cargar más (${conversations.length} de ${totalConversations})`}
            </button>
          )}
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
              <div className="flex-1 overflow-y-auto p-6 space-y-3">{selected.messages.map((message) => <div key={message.id} className={`max-w-[80%] rounded-lg p-3 text-sm ${message.direction === 'OUTBOUND' ? 'ml-auto bg-primary text-white' : 'bg-white border border-neutral-gray text-neutral-dark'}`}>{message.mediaId && message.type !== 'TEXT' ? <InboundMedia token={token} mediaId={message.mediaId} type={message.type} body={message.body} /> : <p>{message.body || `Archivo ${message.type.toLowerCase()} recibido.`}</p>}<p className="text-[10px] opacity-60 mt-1">{message.senderType} · {new Date(message.createdAt).toLocaleString()}</p></div>)}</div>
              <div className="bg-white border-t border-neutral-gray">
                {attachment && !recording && (
                  <div className="px-4 pt-3 flex items-center gap-2 text-sm">
                    <span className="bg-secondary/10 text-secondary px-2 py-1 rounded flex items-center gap-2 flex-1 min-w-0">
                      <span className="truncate">{attachment.file.name}</span>
                      <span className="text-[10px] text-neutral-darkgray flex-shrink-0">
                        {attachment.kind === 'audio' ? 'Nota de voz' : attachment.kind}
                      </span>
                    </span>
                    <button type="button" onClick={() => setAttachment(null)} className="text-neutral-darkgray hover:text-red-500 p-1" title="Quitar archivo">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {recording && (
                  <div className="px-4 pt-3 text-sm text-red-600 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    Grabando nota de voz… {recordSeconds}s
                  </div>
                )}
                <form onSubmit={handleSend} className="p-4 flex gap-3 items-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(event) => handleFilePick(event.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-neutral-darkgray hover:text-secondary p-2 transition-colors"
                    title="Adjuntar archivo (imagen, documento, video o audio)"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>
                  {recording ? (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="bg-red-500 text-white p-2 rounded-full"
                      title="Detener y enviar grabación"
                    >
                      <Square className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startRecording()}
                      className="text-neutral-darkgray hover:text-secondary p-2 transition-colors"
                      title="Grabar nota de voz"
                    >
                      <Mic className="w-5 h-5" />
                    </button>
                  )}
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={attachment ? 'Comentario para el archivo (opcional)…' : 'Escribe una respuesta para WhatsApp...'}
                    className="flex-1 border border-neutral-gray rounded-md px-3 py-2"
                  />
                  <button disabled={recording} className="bg-accent-gold text-white px-4 rounded-md flex items-center gap-2 disabled:opacity-50"><Send className="w-4 h-4" />Enviar</button>
                </form>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
