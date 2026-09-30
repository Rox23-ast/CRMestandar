import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import { MessageCircle, Send, UserCheck, UserPlus, Bot, Paperclip, Mic, Square, Zap, ChevronDown, ChevronLeft, ChevronRight, X, ContactRound, Reply, Pencil, Trash2 } from 'lucide-react'

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
  unread?: boolean
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
  replyToMessageId?: string | null
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

// Formatos que acepta la Media API de WhatsApp por tipo (los documentos
// admiten cualquier MIME).
const ALLOWED_ATTACHMENT_MIMES: Record<PendingAttachment['kind'], string[]> = {
  image: ['image/jpeg', 'image/png'],
  audio: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'],
  video: ['video/mp4', 'video/3gp'],
  document: []
}

const MIME_LABELS: Record<PendingAttachment['kind'], string> = {
  image: 'JPG o PNG',
  audio: 'AAC, MP4, MP3, AMR u OGG',
  video: 'MP4 o 3GP',
  document: 'cualquier tipo de archivo'
}

// MIME y tipo inferidos por extensión cuando el navegador no reporta el MIME
// del archivo (común en Windows y en adjuntos de algunos orígenes).
const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  amr: 'audio/amr',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  '3gp': 'video/3gp'
}

const EXTENSION_KIND: Record<string, PendingAttachment['kind']> = {
  pdf: 'document', doc: 'document', docx: 'document', xls: 'document', xlsx: 'document',
  csv: 'document', txt: 'document', ppt: 'document', pptx: 'document', zip: 'document', rar: 'document',
  png: 'image', jpg: 'image', jpeg: 'image',
  mp3: 'audio', m4a: 'audio', aac: 'audio', amr: 'audio', ogg: 'audio',
  mp4: 'video', '3gp': 'video'
}

const ACCEPTED_ATTACHMENT_EXTENSIONS = Object.keys(EXTENSION_KIND).map((ext) => `.${ext}`).join(',')

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` })

const isExternalUrl = (value: string) => /^https?:\/\//i.test(value)

const InboundMedia = ({ token, mediaId, type, body }: { token: string; mediaId: string; type: string; body?: string | null }) => {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  // Algunos adjuntos no vienen de la Media API de Meta sino de una URL
  // pública (p. ej. el PDF del estimado que envía el cotizador): esos se
  // enlazan directo, sin pasar por el proxy de media.
  const external = isExternalUrl(mediaId)

  useEffect(() => {
    if (!mediaId || external) return
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
  }, [mediaId, token, external])

  if (!mediaId || failed) return <p>{body || `Archivo ${type.toLowerCase()} recibido.`}</p>
  if (external) {
    return (
      <div>
        {body && <p className="mb-2">{body}</p>}
        <a
          href={mediaId}
          target="_blank"
          rel="noreferrer"
          download
          className="underline text-secondary"
        >
          {type === 'DOCUMENT' ? 'Ver documento' : 'Ver archivo'}
        </a>
      </div>
    )
  }
  if (!url) return <p>Cargando {type.toLowerCase()}…</p>
  if (type === 'IMAGE' || type === 'STICKER') return <img src={url} alt={body || 'imagen'} className="max-w-full rounded" />
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
  const [quickReplies, setQuickReplies] = useState<{ id: string; label: string; text: string }[]>([])
  const [repliesPanelOpen, setRepliesPanelOpen] = useState(false)
  const [replyLabel, setReplyLabel] = useState('')
  const [replyText, setReplyText] = useState('')
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [assignMenuOpen, setAssignMenuOpen] = useState(false)
  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [clientName, setClientName] = useState('')
  const [savingClient, setSavingClient] = useState(false)
  const [botEnabled, setBotEnabled] = useState(true)
  const [togglingBot, setTogglingBot] = useState(false)
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const botConfigRef = useRef<Record<string, unknown> | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<number | null>(null)
  const composerFormRef = useRef<HTMLFormElement | null>(null)
  const statusMenuRef = useRef<HTMLDivElement | null>(null)
  const assignMenuRef = useRef<HTMLDivElement | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const conversationPageRef = useRef(1)
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

  const loadQuickReplies = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/crm/quick-replies`, { headers: authHeaders(token) })
      setQuickReplies(response.data)
    } catch {
      // Slash menu just stays empty if the list cannot be loaded.
    }
  }

  const saveQuickReply = async () => {
    const label = replyLabel.trim()
    const text = replyText.trim()
    if (!label || !text) return
    try {
      if (editingReplyId) {
        await axios.patch(
          `${API_URL}/api/crm/quick-replies/${editingReplyId}`,
          { label, text },
          { headers: authHeaders(token) }
        )
      } else {
        await axios.post(
          `${API_URL}/api/crm/quick-replies`,
          { label, text },
          { headers: authHeaders(token) }
        )
      }
      setReplyLabel('')
      setReplyText('')
      setEditingReplyId(null)
      await loadQuickReplies()
    } catch {
      setError('No fue posible guardar la respuesta rápida.')
    }
  }

  const removeQuickReply = async (id: string) => {
    try {
      await axios.delete(`${API_URL}/api/crm/quick-replies/${id}`, { headers: authHeaders(token) })
      if (editingReplyId === id) {
        setEditingReplyId(null)
        setReplyLabel('')
        setReplyText('')
      }
      await loadQuickReplies()
    } catch {
      setError('No fue posible eliminar la respuesta rápida.')
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

  const loadConversations = async (pageToLoad = 1) => {
    const params = new URLSearchParams()
    if (filterStatus) params.set('businessStatus', filterStatus)
    if (filterSource) params.set('source', filterSource)
    if (filterSearch) params.set('search', filterSearch)
    if (filterIncludeFinal) params.set('includeFinal', 'true')
    params.set('page', String(pageToLoad))
    params.set('pageSize', '500')
    const response = await axios.get(`${API_URL}/api/crm/conversations?${params.toString()}`, { headers: authHeaders(token) })
    setTotalConversations(response.data.pagination?.total ?? response.data.data.length)
    setUnread(response.data.unreadCount ?? 0)
    const loadedPage = response.data.pagination?.page ?? pageToLoad
    setConversationPage(loadedPage)
    conversationPageRef.current = loadedPage
    setConversations(response.data.data)
  }

  const loadConversation = async (id: string) => {
    const response = await axios.get(`${API_URL}/api/crm/conversations/${id}`, { headers: authHeaders(token) })
    setSelected(response.data)
    setReplyTo(null)
    setConversations((current) => current.map((conversation) => conversation.id === id ? { ...conversation, unread: false } : conversation))
  }

  useEffect(() => {
    if (!token) return
    loadStatusConfigs()
    void loadQuickReplies()
    if (canAssign) {
      void loadAssignableUsers()
      void loadBotEnabled()
    }
    void loadConversations(conversationPageRef.current).catch(() => setError('No fue posible cargar las conversaciones.'))

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
              void loadConversations(conversationPageRef.current)
              const match = chunk.match(/"conversationId":"([^"]+)"/)
              if (match?.[1] === selectedIdRef.current) {
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

  // Polling ligero para no depender del F5 ni del SSE: refresca la página
  // actual de la bandeja y el detalle de la conversación seleccionada.
  useEffect(() => {
    if (!token) return
    const refresh = () => {
      void loadConversations(conversationPageRef.current).catch(() => undefined)
      if (selectedIdRef.current) {
        void loadConversation(selectedIdRef.current).catch(() => undefined)
      }
      if (canAssign) void loadBotEnabled()
    }
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canAssign])

  // Al cambiar cualquier filtro, se vuelve a la página 1.
  useEffect(() => {
    if (!token) return
    void loadConversations(1).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filterStatus, filterSource, filterSearch, filterIncludeFinal])

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
    await Promise.all([loadConversation(selected.id), loadConversations(conversationPageRef.current)])
  }

  const handleReturnToBot = async () => {
    if (!selected) return
    await axios.post(`${API_URL}/api/crm/conversations/${selected.id}/bot`, {}, { headers: authHeaders(token) })
    await Promise.all([loadConversation(selected.id), loadConversations(conversationPageRef.current)])
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
      await Promise.all([loadConversation(selected.id), loadConversations(conversationPageRef.current)])
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
      await Promise.all([loadConversation(selected.id), loadConversations(conversationPageRef.current)])
    } catch {
      setError('No fue posible asignar la conversación.')
    }
  }

  const openClientModal = () => {
    if (!selected) return
    setClientName(selected.client.name ?? '')
    setClientModalOpen(true)
  }

  const saveClient = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setSavingClient(true)
    try {
      await axios.patch(
        `${API_URL}/api/crm/conversations/${selected.id}/client`,
        { name: clientName.trim() || null },
        { headers: authHeaders(token) }
      )
      setClientModalOpen(false)
      await Promise.all([loadConversation(selected.id), loadConversations(conversationPageRef.current)])
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ? `No fue posible guardar el cliente: ${detail}` : 'No fue posible guardar el cliente.')
    } finally {
      setSavingClient(false)
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
      await loadConversations(conversationPageRef.current)
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
    const replyToMessageId = replyTo?.id ?? null
    try {
      await axios.post(
        `${API_URL}/api/crm/conversations/${selected.id}/messages`,
        { body: draft, ...(replyToMessageId ? { replyToMessageId } : {}) },
        { headers: authHeaders(token) }
      )
      setDraft('')
      setReplyTo(null)
      await Promise.all([loadConversation(selected.id), loadConversations(conversationPageRef.current)])
    } catch {
      setError('No fue posible enviar el mensaje por WhatsApp.')
    }
  }

  const fileExtension = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

  const kindOfFile = (file: File): PendingAttachment['kind'] => {
    if (file.type.startsWith('image/')) return 'image'
    if (file.type.startsWith('video/')) return 'video'
    if (file.type.startsWith('audio/')) return 'audio'
    if (file.type && file.type !== 'application/octet-stream') return 'document'
    return EXTENSION_KIND[fileExtension(file.name)] ?? 'document'
  }

  const mimeOfFile = (file: File): string => {
    if (file.type && file.type !== 'application/octet-stream') return file.type
    return EXTENSION_MIME[fileExtension(file.name)] ?? 'application/octet-stream'
  }

  const handleFilePick = (file: File | undefined) => {
    if (!file) return
    const kind = kindOfFile(file)
    const mime = mimeOfFile(file)
    const mb = file.size / (1024 * 1024)
    const allowed = ALLOWED_ATTACHMENT_MIMES[kind]
    if (allowed.length > 0 && !allowed.includes(mime.toLowerCase())) {
      setError(`WhatsApp no acepta ${mime} como ${kind === 'image' ? 'imagen' : kind}. Formatos válidos: ${MIME_LABELS[kind]}.`)
      return
    }
    if (kind === 'image' && mb > 5) {
      setError('Las imágenes deben pesar máximo 5 MB.')
      return
    }
    if ((kind === 'video' || kind === 'audio') && mb > 16) {
      setError('Los videos y audios deben pesar máximo 16 MB.')
      return
    }
    if (kind === 'document' && mb > 60) {
      setError('Los documentos deben pesar máximo 60 MB.')
      return
    }
    setAttachment({ file, mime, kind })
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
      await Promise.all([loadConversation(selected.id), loadConversations(conversationPageRef.current)])
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ? `No fue posible enviar el archivo: ${detail}` : 'No fue posible enviar el archivo por WhatsApp.')
    }
  }

  const getBusinessStatusInfo = (code?: string | null) => {
    if (!code) return { label: 'Sin estado', color: '#94a3b8' }
    const config = statusConfigs.find(s => s.code === code)
    return config ? { label: config.label, color: config.color } : { label: code, color: '#94a3b8' }
  }

  const startEditingMessage = (message: Message) => {
    setEditingMessageId(message.id)
    setEditDraft(message.body ?? '')
  }

  const cancelEditingMessage = () => {
    setEditingMessageId(null)
    setEditDraft('')
  }

  const saveEditedMessage = async (messageId: string) => {
    if (!selected || !editDraft.trim()) return
    try {
      await axios.patch(
        `${API_URL}/api/crm/messages/${messageId}`,
        { body: editDraft.trim() },
        { headers: authHeaders(token) }
      )
      cancelEditingMessage()
      await loadConversation(selected.id)
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ? `No fue posible editar el mensaje: ${detail}` : 'No fue posible editar el mensaje.')
    }
  }

  const removeMessage = async (messageId: string) => {
    if (!selected) return
    if (!window.confirm('¿Eliminar este mensaje del historial? El cliente seguirá viendo el mensaje original en WhatsApp.')) return
    try {
      await axios.delete(`${API_URL}/api/crm/messages/${messageId}`, { headers: authHeaders(token) })
      await loadConversation(selected.id)
    } catch {
      setError('No fue posible eliminar el mensaje.')
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalConversations / 500))
  const slashIndex = draft.lastIndexOf('/')
  const slashToken = slashIndex !== -1 ? draft.slice(slashIndex) : ''
  const quickMenuVisible = slashToken.startsWith('/') && !slashToken.includes(' ') && !slashToken.includes('\n') && quickReplies.length > 0
  const quickFilter = slashToken.slice(1).toLowerCase()
  const quickMatches = quickFilter
    ? quickReplies.filter((reply) => reply.label.toLowerCase().includes(quickFilter))
    : quickReplies
  const insertQuickReply = (reply: { label: string; text: string }) => {
    const clientName = selected?.client.name
    const filled = clientName ? reply.text.replace(/\[Nombre\]/g, clientName) : reply.text
    setDraft(draft.slice(0, slashIndex) + filled)
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
            {repliesPanelOpen ? (
              <div className="space-y-2 pt-1 border-t border-neutral-gray">
                <p className="text-xs font-medium text-neutral-darkgray">Respuestas rápidas (escribe / en el chat)</p>
                {canAssign && (
                  <>
                    <input
                      value={replyLabel}
                      onChange={(e) => setReplyLabel(e.target.value)}
                      placeholder="Nombre corto (ej. saludo)"
                      className="w-full border border-neutral-gray rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary bg-white"
                    />
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={2}
                      placeholder="Texto del mensaje…"
                      className="w-full border border-neutral-gray rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary bg-white resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void saveQuickReply()}
                        disabled={!replyLabel.trim() || !replyText.trim()}
                        className="flex-1 bg-primary text-white px-3 py-1.5 rounded-md text-sm disabled:opacity-50"
                      >
                        {editingReplyId ? 'Actualizar' : 'Agregar'}
                      </button>
                      {editingReplyId && (
                        <button
                          type="button"
                          onClick={() => { setEditingReplyId(null); setReplyLabel(''); setReplyText('') }}
                          className="border border-neutral-gray text-neutral-dark px-3 py-1.5 rounded-md text-sm"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </>
                )}
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {quickReplies.map((reply) => (
                    <div key={reply.id} className="flex items-center justify-between gap-2 text-xs border border-neutral-gray rounded px-2 py-1">
                      <span className="truncate font-medium text-primary">/{reply.label}</span>
                      {canAssign && (
                        <span className="flex gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => { setEditingReplyId(reply.id); setReplyLabel(reply.label); setReplyText(reply.text) }}
                            className="text-secondary hover:underline"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeQuickReply(reply.id)}
                            className="text-red-500 hover:underline"
                          >
                            Eliminar
                          </button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setRepliesPanelOpen(false)}
                  className="w-full border border-neutral-gray text-neutral-dark px-3 py-1.5 rounded-md text-sm"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRepliesPanelOpen(true)}
                className="w-full border border-dashed border-accent-gold/60 text-accent-gold px-3 py-1.5 rounded-md text-sm hover:bg-accent-gold/10 transition-colors flex items-center justify-center gap-1"
              >
                <Zap className="w-4 h-4" /> Respuestas rápidas
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
          {conversations.map((conversation) => {
            const bizInfo = getBusinessStatusInfo(conversation.businessStatus)
            return (
              <button key={conversation.id} onClick={() => void loadConversation(conversation.id)} className={`w-full text-left p-4 border-b border-neutral-gray hover:bg-neutral-light ${selected?.id === conversation.id ? 'bg-secondary/20 border-l-4 border-l-accent-gold' : ''}`}>
                <div className="flex justify-between gap-2">
                  <span className={`truncate flex items-center gap-2 min-w-0 ${conversation.unread ? 'font-bold text-primary' : ''}`}>
                    {conversation.unread && (
                      <span className="w-2.5 h-2.5 bg-red-500 rounded-full flex-shrink-0" title="Mensajes sin leer" />
                    )}
                    <span className="truncate min-w-0">
                      <strong className="block truncate">{conversation.client.name || conversation.client.phone}</strong>
                      {conversation.client.name && (
                        <span className="block text-xs text-neutral-darkgray truncate font-normal">{conversation.client.phone}</span>
                      )}
                    </span>
                  </span>
                  <span className="text-[11px] text-neutral-darkgray flex items-center gap-1 flex-shrink-0">
                    {conversation.unread && (
                      <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full">No leído</span>
                    )}
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
          <div className="border-t border-neutral-gray p-2 flex items-center justify-between gap-2 flex-shrink-0 bg-white">
            <button
              type="button"
              onClick={() => void loadConversations(conversationPage - 1)}
              disabled={conversationPage <= 1}
              className="p-1.5 rounded border border-neutral-gray text-neutral-darkgray hover:bg-neutral-light disabled:opacity-40 disabled:cursor-not-allowed"
              title="Página anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-neutral-darkgray">Página {conversationPage} de {totalPages}</span>
            <button
              type="button"
              onClick={() => void loadConversations(conversationPage + 1)}
              disabled={conversationPage >= totalPages}
              className="p-1.5 rounded border border-neutral-gray text-neutral-darkgray hover:bg-neutral-light disabled:opacity-40 disabled:cursor-not-allowed"
              title="Página siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </section>
        <section className="flex flex-col h-full overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-neutral-darkgray"><div className="text-center"><MessageCircle className="w-12 h-12 mx-auto mb-3 text-secondary" /><p>Selecciona una conversación para ver el historial.</p></div></div>
          ) : (
            <>
              <div className="bg-white border-b border-neutral-gray p-5 flex flex-wrap justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="font-cormorant text-2xl text-primary">{selected.client.name || selected.client.phone}</h2>
                  {selected.client.name && (
                    <p className="text-sm text-neutral-darkgray">{selected.client.phone}</p>
                  )}
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
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openClientModal}
                    className="h-9 border border-accent-gold text-accent-gold px-3 rounded text-sm flex items-center gap-2 whitespace-nowrap hover:bg-accent-gold/10 transition-colors"
                    title="Registrar el nombre del cliente"
                  >
                    <ContactRound className="w-4 h-4" />
                    <span>Agregar cliente</span>
                  </button>
                  {canAssign && (
                    <div className="relative" ref={assignMenuRef}>
                      <button
                        type="button"
                        onClick={() => setAssignMenuOpen((open) => !open)}
                        className="h-9 border border-secondary text-secondary px-3 rounded text-sm flex items-center gap-2 whitespace-nowrap hover:bg-secondary/10 transition-colors"
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
                    <button onClick={() => void handleTake()} className="h-9 bg-primary text-white px-3 rounded text-sm flex items-center gap-2 whitespace-nowrap">
                      <UserCheck className="w-4 h-4" />Tomar conversación
                    </button>
                  )}
                  {selected.status === 'HUMAN_ACTIVE' && (
                    <button onClick={() => void handleReturnToBot()} className="h-9 border border-primary text-primary px-3 rounded text-sm flex items-center gap-2 whitespace-nowrap hover:bg-primary/10 transition-colors">
                      <Bot className="w-4 h-4" />Devolver al bot
                    </button>
                  )}
                  {statusConfigs.filter(s => s.isActive).length > 0 && (
                    <div className="relative" ref={statusMenuRef}>
                      <button
                        type="button"
                        onClick={() => setStatusMenuOpen((open) => !open)}
                        className="h-9 border border-neutral-gray text-neutral-dark px-3 rounded text-sm flex items-center gap-1 whitespace-nowrap hover:bg-neutral-light/50 transition-colors"
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
              <div className="flex-1 overflow-y-auto p-6 space-y-3">{selected.messages.map((message) => {
                const replied = message.replyToMessageId ? selected.messages.find((m) => m.id === message.replyToMessageId) : null
                const senderLabel = (senderType: string) => senderType === 'CUSTOMER' ? 'Cliente' : senderType === 'BOT' ? 'Bot' : 'Agente'
                return (
                  <div key={message.id} className={`group relative max-w-[80%] rounded-lg p-3 text-sm ${message.direction === 'OUTBOUND' ? 'ml-auto bg-primary text-white' : 'bg-white border border-neutral-gray text-neutral-dark'}`}>
                    {replied && (
                      <div className={`mb-2 px-2 py-1 rounded border-l-2 text-[11px] ${message.direction === 'OUTBOUND' ? 'bg-white/10 border-white/60 text-white/85' : 'bg-neutral-light border-secondary text-neutral-darkgray'}`}>
                        <span className="font-semibold">{senderLabel(replied.senderType)}</span>
                        <span className="block truncate">{(replied.body || (replied.mediaId ? 'Adjunto' : 'Mensaje')).slice(0, 140)}</span>
                      </div>
                    )}
                    {editingMessageId === message.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editDraft}
                          onChange={(event) => setEditDraft(event.target.value)}
                          rows={3}
                          autoFocus
                          className="w-full p-2 rounded bg-white/10 border border-white/40 text-white text-sm resize-none focus:outline-none focus:border-white/80 placeholder-white/50"
                        />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={cancelEditingMessage} className="text-xs px-2.5 py-1 rounded bg-white/20 hover:bg-white/30 transition-colors">
                            Cancelar
                          </button>
                          <button type="button" onClick={() => void saveEditedMessage(message.id)} className="text-xs px-2.5 py-1 rounded bg-accent-gold text-white hover:bg-accent-gold/90 transition-colors">
                            Guardar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {message.mediaId && message.type !== 'TEXT' ? <InboundMedia token={token} mediaId={message.mediaId} type={message.type} body={message.body} /> : <p>{message.body || `Archivo ${message.type.toLowerCase()} recibido.`}</p>}
                        <p className="text-[10px] opacity-60 mt-1">{message.senderType} · {new Date(message.createdAt).toLocaleString()}</p>
                      </>
                    )}
                    {editingMessageId !== message.id && (
                      <div className={`absolute -top-2 right-2 flex gap-1 transition-opacity opacity-0 group-hover:opacity-100 ${replyTo?.id === message.id ? 'opacity-100' : ''}`}>
                        {message.direction === 'OUTBOUND' && message.type === 'TEXT' && (
                          <button
                            type="button"
                            onClick={() => startEditingMessage(message)}
                            title="Editar mensaje (solo el historial del CRM; WhatsApp ya envió el original)"
                            className="p-1 rounded-full shadow bg-white text-neutral-darkgray hover:text-secondary transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {message.direction === 'OUTBOUND' && (
                          <button
                            type="button"
                            onClick={() => void removeMessage(message.id)}
                            title="Eliminar mensaje del historial del CRM"
                            className="p-1 rounded-full shadow bg-white text-neutral-darkgray hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setReplyTo(replyTo?.id === message.id ? null : message)}
                          title="Responder a este mensaje"
                          className={`p-1 rounded-full shadow ${replyTo?.id === message.id ? 'bg-accent-gold text-white' : 'bg-white text-neutral-darkgray hover:text-secondary'} transition-colors`}
                        >
                          <Reply className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}</div>
              <div className="bg-white border-t border-neutral-gray">
                {replyTo && (
                  <div className="px-4 pt-3 flex items-center gap-2 text-sm">
                    <span className="bg-secondary/10 text-secondary px-2 py-1 rounded flex items-center gap-2 flex-1 min-w-0 border-l-2 border-accent-gold">
                      <Reply className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">
                        Respondiendo a <b>{replyTo.senderType === 'CUSTOMER' ? 'Cliente' : replyTo.senderType === 'BOT' ? 'Bot' : 'Agente'}</b>: {(replyTo.body || (replyTo.mediaId ? 'Adjunto' : 'Mensaje')).slice(0, 100)}
                      </span>
                    </span>
                    <button type="button" onClick={() => setReplyTo(null)} className="text-neutral-darkgray hover:text-red-500 p-1" title="Cancelar respuesta">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
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
                <form ref={composerFormRef} onSubmit={handleSend} className="p-4 flex gap-3 items-end">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_ATTACHMENT_EXTENSIONS}
                    className="hidden"
                    onChange={(event) => handleFilePick(event.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-neutral-darkgray hover:text-secondary p-2 transition-colors"
                    title="Adjuntar archivo: PDF, JPG, PNG, Word, Excel, ZIP, MP3, MP4, etc."
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
                  <div className="flex-1 relative">
                    <textarea
                      value={draft}
                      onChange={(event) => {
                        setDraft(event.target.value)
                        event.target.style.height = 'auto'
                        event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                          event.preventDefault()
                          composerFormRef.current?.requestSubmit()
                        }
                      }}
                      rows={1}
                      placeholder={attachment ? 'Comentario para el archivo (opcional)…' : 'Escribe una respuesta… (Enter salto de línea, Ctrl+Enter enviar)'}
                      className="w-full border border-neutral-gray rounded-md px-3 py-2 resize-none overflow-y-auto text-sm leading-relaxed"
                    />
                    {quickMenuVisible && (
                      <div className="absolute bottom-full left-0 mb-1 w-full max-h-48 overflow-y-auto bg-white border border-neutral-gray rounded-md shadow-lg z-20">
                        {quickMatches.length === 0 && (
                          <p className="px-3 py-2 text-xs text-neutral-darkgray">Sin coincidencias</p>
                        )}
                        {quickMatches.map((reply) => (
                          <button
                            key={reply.id}
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault()
                              insertQuickReply(reply)
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-light/50 flex flex-col gap-0.5"
                          >
                            <span className="font-medium text-primary">/{reply.label}</span>
                            <span className="text-xs text-neutral-darkgray truncate">{reply.text}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button disabled={recording} className="bg-accent-gold text-white px-4 rounded-md flex items-center gap-2 disabled:opacity-50"><Send className="w-4 h-4" />Enviar</button>
                </form>
              </div>
            </>
          )}
        </section>
      </div>
      {clientModalOpen && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setClientModalOpen(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(event) => event.stopPropagation()}>
            <h4 className="text-lg font-semibold text-primary mb-4">Agregar cliente</h4>
            <form onSubmit={saveClient} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1">Nombre</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                  placeholder="Nombre del cliente"
                  autoFocus
                  className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1">Teléfono (WhatsApp)</label>
                <p className="text-sm text-neutral-darkgray p-2.5 bg-neutral-light/50 rounded-md border border-neutral-gray">{selected.client.phone}</p>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => setClientModalOpen(false)} className="px-4 py-2 text-neutral-darkgray hover:text-primary transition-colors">Cancelar</button>
                <button type="submit" disabled={savingClient} className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-md transition-colors disabled:opacity-50">
                  {savingClient ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
