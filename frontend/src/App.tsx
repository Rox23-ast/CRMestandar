import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import CrmInbox from './CrmInbox'
import CredentialsSettings from './CredentialsSettings'
import UserManagement from './UserManagement'
import AccountSettings from './AccountSettings'
import StatusSettings from './StatusSettings'
import Leads from './Leads'
import { MessageSquare, ShieldAlert, Save, Bot, Zap, Plus, Trash2 } from 'lucide-react'
import { AppShell } from './app/AppShell'
import { getNavigation, getViewMeta, isBotContentView, type AppView } from './app/navigation'
import { Button } from './components/ui/Button'
import { Card } from './components/ui/Card'
import { LoginPage } from './features/auth/LoginPage'
import { useSession } from './features/auth/useSession'
import { installation } from './config/installation'

// Define the shape of our config
interface CustomRule {
  id: string;
  title: string;
  keywords: string;
  response: string;
}

interface BotConfig {
  greetingMessage: string
  awayMessage: string
  aiPersonalityPrompt: string
  limitations: string
  customRules: CustomRule[]
  outreachTemplateName: string | null
  outreachTemplateLanguage: string
  outreachTemplateVariables: number
}

interface WhatsAppTemplate {
  name: string
  language: string
  status: string
  category: string
  variableCount: number
}

const API_URL = import.meta.env.VITE_API_URL ?? ''

function App() {
  const { token, name: crmUserName, role: crmUserRole, sessionExpired, login, logout, updateToken } = useSession()
  const [activeView, setActiveView] = useState<AppView>('inbox')
  const [config, setConfig] = useState<BotConfig>({
    greetingMessage: '',
    awayMessage: '',
    aiPersonalityPrompt: '',
    limitations: '',
    customRules: [],
    outreachTemplateName: null,
    outreachTemplateLanguage: 'es',
    outreachTemplateVariables: 1
  })
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{show: boolean, message: string}>({show: false, message: ''})

  const canAccessBotConfig = crmUserRole === 'ADMIN' || crmUserRole === 'MARKETING_DIRECTOR'
  const navigation = useMemo(() => getNavigation(crmUserRole, installation.modules), [crmUserRole])
  const availableViews = useMemo(() => navigation.flatMap((group) => group.items.map((item) => item.id)), [navigation])
  const viewMeta = getViewMeta(activeView)

  const handleTokenChange = (newToken: string) => {
    updateToken(newToken)
  }

  useEffect(() => {
    if (!availableViews.includes(activeView)) {
      setActiveView(availableViews[0] ?? 'inbox')
    }
  }, [activeView, availableViews])

  useEffect(() => {
    const fetchConfig = async () => {
      if (!token || !canAccessBotConfig) {
        setLoading(false)
        return
      }
      try {
        const response = await axios.get(`${API_URL}/api/bot/config`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = response.data
        if (!data.customRules) data.customRules = []
        if (data.outreachTemplateName === undefined) data.outreachTemplateName = null
        if (!data.outreachTemplateLanguage) data.outreachTemplateLanguage = 'es'
        if (!data.outreachTemplateVariables) data.outreachTemplateVariables = 1
        setConfig(data)
      } catch (error) {
        console.error('Error fetching config:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [token, canAccessBotConfig])

  const handleLogout = () => {
    logout()
    setActiveView('inbox')
  }

  const handleAddRule = () => {
    const newRule: CustomRule = {
      id: Math.random().toString(36).substr(2, 9),
      title: '',
      keywords: '',
      response: ''
    }
    setConfig(prev => ({ ...prev, customRules: [...prev.customRules, newRule] }))
  }

  const handleRuleChange = (id: string, field: keyof CustomRule, value: string) => {
    setConfig(prev => ({
      ...prev,
      customRules: prev.customRules.map(rule => rule.id === id ? { ...rule, [field]: value } : rule)
    }))
  }

  const handleRemoveRule = (id: string) => {
    setConfig(prev => ({
      ...prev,
      customRules: prev.customRules.filter(rule => rule.id !== id)
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await axios.put(`${API_URL}/api/bot/config`, config, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setToast({ show: true, message: 'Configuración guardada exitosamente' })
      setTimeout(() => setToast({ show: false, message: '' }), 3000)
    } catch (error) {
      console.error('Error saving config:', error)
      setToast({ show: true, message: 'Error al guardar configuración' })
      setTimeout(() => setToast({ show: false, message: '' }), 3000)
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const { name, value } = e.target
    setConfig(prev => ({
      ...prev,
      [name]: name === 'outreachTemplateVariables'
        ? (Number.isNaN(Number(value)) ? 0 : Number(value))
        : value
    }))
  }

  const handleLoadTemplates = async () => {
    setTemplatesLoading(true)
    setTemplatesError('')
    try {
      const response = await axios.get(`${API_URL}/api/bot/templates`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setTemplates(response.data)
    } catch (error: any) {
      console.error('Error loading templates:', error)
      setTemplatesError(error?.response?.data?.error ?? 'No fue posible cargar las plantillas. Revisa el WABA ID en Configuración de APIs.')
    } finally {
      setTemplatesLoading(false)
    }
  }

  const pickTemplate = (template: WhatsAppTemplate) => {
    setConfig(prev => ({
      ...prev,
      outreachTemplateName: template.name,
      outreachTemplateLanguage: template.language,
      outreachTemplateVariables: template.variableCount || 0
    }))
  }

  if (!token) {
    return <LoginPage onLogin={login} sessionExpired={sessionExpired} />
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-sm font-semibold text-primary">
        Cargando…
      </div>
    )
  }

  const saveAction = isBotContentView(activeView) ? (
    <Button onClick={() => void handleSave()} disabled={saving} size="sm" className="px-3">
      <Save className="h-4 w-4" />
      <span className="hidden sm:inline">{saving ? 'Guardando…' : 'Guardar cambios'}</span>
    </Button>
  ) : undefined

  return (
    <AppShell
      navigation={navigation}
      activeView={activeView}
      onNavigate={setActiveView}
      title={viewMeta.title}
      subtitle={viewMeta.subtitle}
      userName={crmUserName}
      userRole={crmUserRole}
      onLogout={handleLogout}
      headerActions={saveAction}
    >
      {activeView === 'inbox' && <CrmInbox token={token} userRole={crmUserRole} />}

      {activeView === 'leads' && (
        <div className="w-full overflow-y-auto p-4 md:p-8">
          <div className="mx-auto w-full max-w-7xl">
            <Leads token={token} userRole={crmUserRole} />
          </div>
        </div>
      )}

      {isBotContentView(activeView) && (
        <div className="h-full overflow-y-auto p-4 md:p-8">
          <div className="mx-auto w-full max-w-4xl">
            {toast.show && (
              <div className="mb-4 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white shadow-lg animate-fade-in-down">
                {toast.message}
              </div>
            )}
            <Card className="p-6 md:p-8">
            
            {/* Tab 1: Messages */}
            {activeView === 'bot-messages' && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center space-x-3 border-b border-neutral-gray pb-4 mb-6">
                  <MessageSquare className="w-6 h-6 text-secondary" />
                  <h3 className="text-xl font-cormorant text-primary">Mensajes y Textos</h3>
                </div>
                
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-neutral-dark font-semibold mb-2 block">Mensaje de Saludo Inicial</span>
                    <span className="text-sm text-neutral-darkgray mb-2 block">Este es el primer mensaje que el bot enviará cuando un cliente inicie una conversación.</span>
                    <textarea 
                      name="greetingMessage"
                      value={config.greetingMessage}
                      onChange={handleChange}
                      rows={4}
                      className="w-full p-4 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary bg-neutral-light/30 resize-none font-medium"
                      placeholder="Ej. ¡Hola! Bienvenido a Mudanzas Chico..."
                    />
                  </label>
                </div>

                <div className="space-y-4 pt-4">
                  <label className="block">
                    <span className="text-neutral-dark font-semibold mb-2 block">Mensaje de Ausencia (Fuera de horario)</span>
                    <span className="text-sm text-neutral-darkgray mb-2 block">Mensaje automático si el cliente escribe fuera de las horas de atención establecidas.</span>
                    <textarea 
                      name="awayMessage"
                      value={config.awayMessage}
                      onChange={handleChange}
                      rows={4}
                      className="w-full p-4 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary bg-neutral-light/30 resize-none font-medium"
                    />
                  </label>
                </div>

                <div className="space-y-4 pt-4 border-t border-neutral-gray">
                  <div>
                    <span className="text-neutral-dark font-semibold mb-2 block">Plantilla de primer contacto (WhatsApp)</span>
                    <span className="text-sm text-neutral-darkgray mb-2 block">Cuando un comercial inicia un chat con un número que nunca ha escrito, WhatsApp exige una plantilla aprobada. El mensaje que escriba el comercial se asigna a la variable 1 de la plantilla; el resto quedan vacías.</span>
                  </div>
                  <div className="flex flex-col md:flex-row gap-4">
                    <label className="flex-1 block">
                      <span className="text-sm font-medium text-neutral-dark mb-1 block">Nombre de la plantilla</span>
                      <input
                        type="text"
                        name="outreachTemplateName"
                        value={config.outreachTemplateName ?? ''}
                        onChange={handleChange}
                        placeholder="Ej. primer_contacto"
                        className="w-full p-3 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary bg-white text-sm"
                      />
                    </label>
                    <label className="block w-32">
                      <span className="text-sm font-medium text-neutral-dark mb-1 block">Idioma</span>
                      <input
                        type="text"
                        name="outreachTemplateLanguage"
                        value={config.outreachTemplateLanguage}
                        onChange={handleChange}
                        placeholder="es"
                        className="w-full p-3 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary bg-white text-sm"
                      />
                    </label>
                    <label className="block w-32">
                      <span className="text-sm font-medium text-neutral-dark mb-1 block">Nº variables</span>
                      <input
                        type="number"
                        name="outreachTemplateVariables"
                        value={config.outreachTemplateVariables}
                        onChange={handleChange}
                        min="0"
                        max="20"
                        className="w-full p-3 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary bg-white text-sm"
                      />
                    </label>
                  </div>
                  {config.outreachTemplateVariables === 0 && config.outreachTemplateName && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
                      Esta plantilla no tiene variables: al iniciar un chat se enviará <strong>solo el texto fijo de la plantilla</strong>, sin el mensaje que escriba el comercial.
                    </p>
                  )}
                  <div className="bg-white border border-neutral-gray rounded-md p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-neutral-dark">Plantillas de tu cuenta de Meta</span>
                      <button
                        type="button"
                        onClick={() => void handleLoadTemplates()}
                        disabled={templatesLoading}
                        className="text-sm border border-secondary text-secondary px-3 py-1.5 rounded-md hover:bg-secondary/10 transition-colors disabled:opacity-50"
                      >
                        {templatesLoading ? 'Cargando…' : 'Cargar plantillas'}
                      </button>
                    </div>
                    {templatesError && <p className="text-xs text-red-600 mb-2">{templatesError}</p>}
                    {templates.length === 0 && !templatesLoading && !templatesError && (
                      <p className="text-xs text-neutral-darkgray">Pulsa "Cargar plantillas" para ver las plantillas aprobadas de tu cuenta (requiere el WABA ID en Configuración de APIs).</p>
                    )}
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {templates.map((template) => (
                        <button
                          key={`${template.name}-${template.language}`}
                          type="button"
                          onClick={() => pickTemplate(template)}
                          className={`w-full text-left px-3 py-2 rounded border text-sm transition-colors ${config.outreachTemplateName === template.name && config.outreachTemplateLanguage === template.language ? 'border-accent-gold bg-accent-gold/10' : 'border-neutral-gray hover:bg-neutral-light/50'}`}
                        >
                          <span className="font-medium text-primary">{template.name}</span>
                          <span className="text-neutral-darkgray"> · {template.language} · {template.category} · {template.status}{template.variableCount > 0 ? ` · ${template.variableCount} variable${template.variableCount !== 1 ? 's' : ''}` : ''}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Personality */}
            {activeView === 'bot-personality' && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center space-x-3 border-b border-neutral-gray pb-4 mb-6">
                  <Bot className="w-6 h-6 text-secondary" />
                  <h3 className="text-xl font-cormorant text-primary">Personalidad de la IA</h3>
                </div>
                
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-neutral-dark font-semibold mb-2 block">Instrucciones Base (System Prompt)</span>
                    <span className="text-sm text-neutral-darkgray mb-4 block">Define el tono, la actitud y cómo debe comportarse la Inteligencia Artificial al interactuar con los clientes.</span>
                    <textarea 
                      name="aiPersonalityPrompt"
                      value={config.aiPersonalityPrompt}
                      onChange={handleChange}
                      rows={12}
                      className="w-full p-4 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary bg-neutral-light/30 resize-none font-medium text-primary-light"
                      placeholder="Eres un asistente..."
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Tab 3: Rules */}
            {activeView === 'bot-rules' && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center space-x-3 border-b border-neutral-gray pb-4 mb-6">
                  <ShieldAlert className="w-6 h-6 text-secondary" />
                  <h3 className="text-xl font-cormorant text-primary">Reglas y Limitaciones</h3>
                </div>
                
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-neutral-dark font-semibold mb-2 block">Restricciones de Cotización y Derivación</span>
                    <span className="text-sm text-neutral-darkgray mb-4 block">Escribe las reglas estrictas que la IA no debe romper (Ej. Límite de volumen, zonas no cubiertas, cuándo pasar a un agente humano).</span>
                    <textarea 
                      name="limitations"
                      value={config.limitations}
                      onChange={handleChange}
                      rows={8}
                      className="w-full p-4 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-accent-gold/50 focus:border-accent-gold bg-neutral-light/30 resize-none font-medium border-l-4 border-l-accent-gold"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Tab 4: Dynamic Responses (Custom Rules) */}
            {activeView === 'bot-dynamic' && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between border-b border-neutral-gray pb-4 mb-6">
                  <div className="flex items-center space-x-3">
                    <Zap className="w-6 h-6 text-secondary" />
                    <h3 className="text-xl font-cormorant text-primary">Respuestas Rápidas (Palabras Clave)</h3>
                  </div>
                  <button 
                    onClick={handleAddRule}
                    className="flex items-center space-x-2 bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2 rounded-md transition-colors text-sm font-semibold"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Añadir Regla</span>
                  </button>
                </div>
                
                <p className="text-sm text-neutral-darkgray mb-6">
                  Configura respuestas automáticas. Si el cliente escribe alguna de las palabras clave, el bot responderá exactamente con el mensaje configurado.
                </p>

                <div className="space-y-6">
                  {config.customRules.length === 0 ? (
                    <div className="text-center p-8 border-2 border-dashed border-neutral-gray rounded-md text-neutral-darkgray">
                      No hay respuestas configuradas. Haz clic en "Añadir Regla" para empezar.
                    </div>
                  ) : (
                    config.customRules.map((rule) => (
                      <div key={rule.id} className="p-6 border border-neutral-gray rounded-lg bg-neutral-light/10 relative group">
                        <button 
                          onClick={() => handleRemoveRule(rule.id)}
                          className="absolute top-4 right-4 text-neutral-darkgray hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          title="Eliminar regla"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        
                        <div className="space-y-4 pr-8">
                          <label className="block">
                            <span className="text-neutral-dark text-sm font-semibold mb-1 block">Título de la Regla (Interno)</span>
                            <input 
                              type="text"
                              value={rule.title}
                              onChange={(e) => handleRuleChange(rule.id, 'title', e.target.value)}
                              placeholder="Ej. Horarios de atención"
                              className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary bg-white text-sm"
                            />
                          </label>
                          
                          <label className="block">
                            <span className="text-neutral-dark text-sm font-semibold mb-1 block">Palabras Clave (Separadas por comas)</span>
                            <input 
                              type="text"
                              value={rule.keywords}
                              onChange={(e) => handleRuleChange(rule.id, 'keywords', e.target.value)}
                              placeholder="Ej. hora, abierto, cierre, cuando abren"
                              className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white text-sm text-primary"
                            />
                          </label>

                          <label className="block">
                            <span className="text-neutral-dark text-sm font-semibold mb-1 block">Respuesta Exacta del Bot</span>
                            <textarea 
                              value={rule.response}
                              onChange={(e) => handleRuleChange(rule.id, 'response', e.target.value)}
                              rows={3}
                              placeholder="Ej. Nuestro horario de atención es de Lunes a Viernes de 8:00 AM a 6:00 PM."
                              className="w-full p-3 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-accent-gold/50 focus:border-accent-gold bg-white resize-none text-sm"
                            />
                          </label>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            </Card>
          </div>
        </div>
      )}

      {activeView === 'statuses' && (
        <div className="h-full overflow-y-auto p-4 md:p-8">
          <div className="mx-auto w-full max-w-5xl">
            <StatusSettings token={token} />
          </div>
        </div>
      )}

      {activeView === 'credentials' && (
        <div className="h-full overflow-y-auto p-4 md:p-8">
          <div className="mx-auto w-full max-w-5xl">
            <CredentialsSettings userRole={crmUserRole} token={token} />
          </div>
        </div>
      )}

      {activeView === 'users' && (
        <div className="h-full overflow-y-auto p-4 md:p-8">
          <div className="mx-auto w-full max-w-6xl">
            <UserManagement token={token} />
          </div>
        </div>
      )}

      {activeView === 'account' && (
        <div className="h-full overflow-y-auto p-4 md:p-8">
          <div className="mx-auto w-full max-w-4xl">
            <AccountSettings token={token} onTokenChange={handleTokenChange} />
          </div>
        </div>
      )}
    </AppShell>
  )
}

export default App
