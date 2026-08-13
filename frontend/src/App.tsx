import { useState, useEffect } from 'react'
import axios from 'axios'
import { 
  MessageSquare, 
  Settings, 
  ShieldAlert, 
  Save, 
  Bot,
  Zap,
  Plus,
  Trash2
} from 'lucide-react'

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
}

function App() {
  const [activeTab, setActiveTab] = useState<'messages' | 'personality' | 'rules' | 'dynamic'>('messages')
  const [config, setConfig] = useState<BotConfig>({
    greetingMessage: '',
    awayMessage: '',
    aiPersonalityPrompt: '',
    limitations: '',
    customRules: []
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{show: boolean, message: string}>({show: false, message: ''})

  useEffect(() => {
    // Fetch initial config
    const fetchConfig = async () => {
      try {
        const response = await axios.get('http://localhost:3000/api/bot/config')
        const data = response.data
        // Asegurarnos que customRules sea un array
        if (!data.customRules) data.customRules = []
        setConfig(data)
      } catch (error) {
        console.error('Error fetching config:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [])

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
      await axios.put('http://localhost:3000/api/bot/config', config)
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

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setConfig(prev => ({ ...prev, [name]: value }))
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-neutral-light text-primary">Cargando...</div>
  }

  return (
    <div className="flex min-h-screen bg-neutral-light font-raleway">
      
      {/* Sidebar */}
      <aside className="w-64 bg-primary text-white flex flex-col">
        <div className="p-6 flex flex-col items-center border-b border-primary-light">
          <div className="w-40 mb-4 flex justify-center">
            <img src="/logo-1.png" alt="Mudanzas Chico Logo" className="max-w-full h-auto object-contain" />
          </div>
          <h1 className="font-cormorant text-2xl font-medium tracking-wide text-center">Mudanzas Chico</h1>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          <button 
            onClick={() => setActiveTab('messages')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-md transition-colors ${activeTab === 'messages' ? 'bg-primary-light text-white' : 'text-neutral-gray hover:bg-primary-light/50'}`}
          >
            <MessageSquare className="w-5 h-5" />
            <span>Mensajes y Textos</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('personality')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-md transition-colors ${activeTab === 'personality' ? 'bg-primary-light text-white' : 'text-neutral-gray hover:bg-primary-light/50'}`}
          >
            <Bot className="w-5 h-5" />
            <span>Personalidad IA</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('dynamic')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-md transition-colors ${activeTab === 'dynamic' ? 'bg-primary-light text-white' : 'text-neutral-gray hover:bg-primary-light/50'}`}
          >
            <Zap className="w-5 h-5" />
            <span>Respuestas Rápidas</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('rules')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-md transition-colors ${activeTab === 'rules' ? 'bg-primary-light text-white' : 'text-neutral-gray hover:bg-primary-light/50'}`}
          >
            <ShieldAlert className="w-5 h-5" />
            <span>Reglas y Límites</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        
        {/* Header */}
        <header className="bg-white border-b border-neutral-gray px-8 py-6 flex justify-between items-center sticky top-0 z-10">
          <div>
            <h2 className="text-2xl font-cormorant text-primary font-medium">Configuración del Chatbot</h2>
            <p className="text-sm text-neutral-darkgray italic mt-1">"Movemos lo que más Importa."</p>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 bg-accent-gold hover:bg-accent-gold/90 text-white px-6 py-2.5 rounded-md transition-colors font-medium shadow-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
          </button>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-8 max-w-4xl">
          
          {/* Toast Notification */}
          {toast.show && (
            <div className="fixed top-24 right-8 bg-primary text-white px-6 py-3 rounded shadow-lg animate-fade-in-down z-50">
              {toast.message}
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-neutral-gray p-8">
            
            {/* Tab 1: Messages */}
            {activeTab === 'messages' && (
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
              </div>
            )}

            {/* Tab 2: Personality */}
            {activeTab === 'personality' && (
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
            {activeTab === 'rules' && (
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
            {activeTab === 'dynamic' && (
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
                    config.customRules.map((rule, index) => (
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

          </div>
        </div>
      </main>
    </div>
  )
}

export default App
