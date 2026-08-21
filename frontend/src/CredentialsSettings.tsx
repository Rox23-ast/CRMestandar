import { useState, useEffect } from 'react'
import axios from 'axios'
import { Save, Eye, EyeOff, Shield, AlertCircle } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL ?? ''

interface ApiCredentials {
  WA_API_TOKEN: string
  WA_VERIFY_TOKEN: string
  WA_PHONE_NUMBER_ID: string
  WA_APP_SECRET: string
  OPENAI_API_KEY: string
  ANTHROPIC_API_KEY: string
  GEMINI_API_KEY: string
}

interface CredentialField {
  key: keyof ApiCredentials
  label: string
  placeholder: string
  description: string
}

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    key: 'WA_API_TOKEN',
    label: 'WhatsApp API Token',
    placeholder: 'EAAG...',
    description: 'Token de acceso permanente de la API de WhatsApp Business'
  },
  {
    key: 'WA_VERIFY_TOKEN',
    label: 'WhatsApp Verify Token',
    placeholder: 'tu_verify_token',
    description: 'Token de verificación para el webhook de Meta'
  },
  {
    key: 'WA_PHONE_NUMBER_ID',
    label: 'WhatsApp Phone Number ID',
    placeholder: '123456789012345',
    description: 'ID del número de teléfono de WhatsApp Business'
  },
  {
    key: 'WA_APP_SECRET',
    label: 'WhatsApp App Secret',
    placeholder: 'tu_app_secret',
    description: 'Secret de la aplicación de Meta Developers'
  },
  {
    key: 'OPENAI_API_KEY',
    label: 'OpenAI API Key',
    placeholder: 'sk-...',
    description: 'Clave de API de OpenAI para el asistente de IA'
  },
  {
    key: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API Key',
    placeholder: 'sk-ant-...',
    description: 'Clave de API para modelos de Claude (Anthropic)'
  },
  {
    key: 'GEMINI_API_KEY',
    label: 'Google Gemini API Key',
    placeholder: 'AIza...',
    description: 'Clave de API para modelos Gemini (Google)'
  }
]

export default function CredentialsSettings({ userRole }: { userRole: string }) {
  const [credentials, setCredentials] = useState<ApiCredentials>({
    WA_API_TOKEN: '',
    WA_VERIFY_TOKEN: '',
    WA_PHONE_NUMBER_ID: '',
    WA_APP_SECRET: '',
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    GEMINI_API_KEY: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<keyof ApiCredentials | null>(null)
  const [showValue, setShowValue] = useState<Record<keyof ApiCredentials, boolean>>({
    WA_API_TOKEN: false,
    WA_VERIFY_TOKEN: false,
    WA_PHONE_NUMBER_ID: false,
    WA_APP_SECRET: false,
    OPENAI_API_KEY: false,
    ANTHROPIC_API_KEY: false,
    GEMINI_API_KEY: false
  })
  const [toast, setToast] = useState<{show: boolean, message: string, type: 'success' | 'error'}>({show: false, message: '', type: 'success'})
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    setIsAdmin(userRole === 'ADMIN')
    fetchCredentials()
  }, [userRole])

  const fetchCredentials = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/crm/settings/credentials`)
      setCredentials(response.data)
    } catch (error) {
      console.error('Error fetching credentials:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (field: keyof ApiCredentials) => {
    setSaving(field)
    try {
      await axios.put(`${API_URL}/api/crm/settings/credentials`, { [field]: credentials[field] })
      setToast({ show: true, message: `${CREDENTIAL_FIELDS.find(f => f.key === field)?.label} guardado`, type: 'success' })
      setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
      await fetchCredentials()
    } catch (error) {
      console.error('Error saving credential:', error)
      setToast({ show: true, message: 'Error al guardar', type: 'error' })
      setTimeout(() => setToast({ show: false, message: '', type: 'error' }), 3000)
    } finally {
      setSaving(null)
    }
  }

  const handleChange = (field: keyof ApiCredentials, value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }))
  }

  const toggleShow = (field: keyof ApiCredentials) => {
    setShowValue(prev => ({ ...prev, [field]: !prev[field] }))
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-neutral-light text-primary">Cargando...</div>
  }

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-gray p-8 max-w-2xl mx-auto">
        <div className="flex items-center space-x-3 text-amber-600 mb-6">
          <Shield className="w-8 h-8" />
          <h3 className="text-xl font-cormorant text-primary">Acceso restringido</h3>
        </div>
        <p className="text-neutral-darkgray">
          La configuración de APIs solo está disponible para usuarios con rol <strong>ADMIN</strong>.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center space-x-3 border-b border-neutral-gray pb-4 mb-6">
        <Shield className="w-6 h-6 text-secondary" />
        <h3 className="text-xl font-cormorant text-primary">Configuración de APIs</h3>
      </div>

      <AlertCircle className="w-5 h-5 text-amber-500 mb-4" />
      <p className="text-sm text-neutral-darkgray mb-6 bg-amber-50 border border-amber-200 rounded-md p-4">
        <strong>Importante:</strong> Estas credenciales son sensibles y afectan el funcionamiento del chatbot. 
        Los valores se muestran enmascarados por seguridad. Al guardar, se cifran en la base de datos.
      </p>

      <div className="space-y-6">
        {CREDENTIAL_FIELDS.map((field) => (
          <div key={field.key} className="p-6 border border-neutral-gray rounded-lg bg-neutral-light/10">
            <div className="mb-4">
              <label className="block text-neutral-dark font-semibold mb-1">{field.label}</label>
              <p className="text-sm text-neutral-darkgray">{field.description}</p>
            </div>
            
            <div className="relative">
              <input
                type={showValue[field.key] ? 'text' : 'password'}
                value={credentials[field.key] || ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full p-4 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white text-sm font-mono"
                disabled={saving === field.key}
              />
              <button
                type="button"
                onClick={() => toggleShow(field.key)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-darkgray hover:text-primary transition-colors"
                disabled={!credentials[field.key] || saving === field.key}
              >
                {showValue[field.key] ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <button
              onClick={() => handleSave(field.key)}
              disabled={saving === field.key || !credentials[field.key].trim()}
              className="mt-4 flex items-center space-x-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-md transition-colors font-medium disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving === field.key ? 'Guardando...' : 'Guardar cambios'}</span>
            </button>
          </div>
        ))}
      </div>

      {toast.show && (
        <div className={`fixed top-24 right-8 px-6 py-3 rounded shadow-lg animate-fade-in-down z-50 ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'} text-white`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}