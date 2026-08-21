import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import { MessageCircle, Send, UserCheck } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type Conversation = {
  id: string
  status: string
  priority: string
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

export default function CrmInbox({ token }: { token: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<ConversationDetail | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [unread, setUnread] = useState(0)
  const eventAbort = useRef<AbortController | null>(null)

  const loadConversations = async () => {
    const response = await axios.get(`${API_URL}/api/crm/conversations`, { headers: authHeaders(token) })
    setConversations(response.data.data)
  }

  const loadConversation = async (id: string) => {
    const response = await axios.get(`${API_URL}/api/crm/conversations/${id}`, { headers: authHeaders(token) })
    setSelected(response.data)
  }

  useEffect(() => {
    if (!token) return
    void loadConversations().catch(() => setError('No fue posible cargar las conversaciones.'))

    const controller = new AbortController()
    eventAbort.current = controller
    const listen = async () => {
      try {
        const response = await fetch(`${API_URL}/api/crm/events`, {
          headers: authHeaders(token),
          signal: controller.signal
        })
        if (!response.body) return
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
    }
    void listen()
    return () => controller.abort()
  }, [token])

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
            {unread > 0 && <span className="bg-secondary text-white text-xs px-2 py-1 rounded-full">{unread} nuevas</span>}
          </div>
          <div className="flex-1 overflow-y-auto">
          {conversations.map((conversation) => (
            <button key={conversation.id} onClick={() => void loadConversation(conversation.id)} className={`w-full text-left p-4 border-b border-neutral-gray hover:bg-neutral-light ${selected?.id === conversation.id ? 'bg-secondary/20 border-l-4 border-l-accent-gold' : ''}`}>
              <div className="flex justify-between gap-2"><strong className="text-primary truncate">{conversation.client.name || conversation.client.phone}</strong><span className="text-[11px] text-neutral-darkgray">{priorityLabels[conversation.priority]}</span></div>
              <div className="flex justify-between mt-2 text-xs text-neutral-darkgray"><span>{statusLabels[conversation.status] || conversation.status}</span><span>{conversation.assignedUser?.name || 'Marketing'}</span></div>
            </button>
          ))}
          </div>
        </section>
        <section className="flex flex-col h-full overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-neutral-darkgray"><div className="text-center"><MessageCircle className="w-12 h-12 mx-auto mb-3 text-secondary" /><p>Selecciona una conversación para ver el historial.</p></div></div>
          ) : (
            <>
              <div className="bg-white border-b border-neutral-gray p-5 flex flex-wrap justify-between gap-4"><div><h2 className="font-cormorant text-2xl text-primary">{selected.client.name || selected.client.phone}</h2><p className="text-sm text-neutral-darkgray">{statusLabels[selected.status] || selected.status} · {priorityLabels[selected.priority]}</p></div><div className="flex gap-2">{selected.status !== 'HUMAN_ACTIVE' && <button onClick={() => void handleTake()} className="bg-primary text-white px-3 py-2 rounded text-sm flex items-center gap-2"><UserCheck className="w-4 h-4" />Tomar conversación</button>}{selected.status === 'HUMAN_ACTIVE' && <button onClick={() => void handleReturnToBot()} className="border border-primary text-primary px-3 py-2 rounded text-sm">Devolver al bot</button>}</div></div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">{selected.messages.map((message) => <div key={message.id} className={`max-w-[80%] rounded-lg p-3 text-sm ${message.direction === 'OUTBOUND' ? 'ml-auto bg-primary text-white' : 'bg-white border border-neutral-gray text-neutral-dark'}`}><p>{message.body || `Archivo ${message.type.toLowerCase()} recibido.`}</p><p className="text-[10px] opacity-60 mt-1">{message.senderType} · {new Date(message.createdAt).toLocaleString()}</p></div>)}</div>
              <form onSubmit={handleSend} className="bg-white border-t border-neutral-gray p-4 flex gap-3"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escribe una respuesta para WhatsApp..." className="flex-1 border border-neutral-gray rounded-md px-3 py-2" /><button className="bg-accent-gold text-white px-4 rounded-md flex items-center gap-2"><Send className="w-4 h-4" />Enviar</button></form>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
