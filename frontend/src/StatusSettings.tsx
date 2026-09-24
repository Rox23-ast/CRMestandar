import { useEffect, useState } from 'react'
import axios from 'axios'
import { Trash2, Save, X, UserCheck } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type StatusConfig = {
  id: string
  code: string
  label: string
  color: string
  isFinal: boolean
  isActive: boolean
  sortOrder: number
}

type FormData = {
  label: string
  color: string
  isFinal: boolean
  sortOrder: number
}

export default function StatusSettings({ token }: { token: string }) {
  const [statuses, setStatuses] = useState<StatusConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{show: boolean, message: string, type: 'success' | 'error'}>({show: false, message: '', type: 'success'})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>({ label: '', color: '#64748b', isFinal: false, sortOrder: 0 })

  const authHeaders = () => ({ Authorization: `Bearer ${token}` })

  const loadStatuses = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/crm/settings/statuses`, { headers: authHeaders() })
      setStatuses(response.data)
    } catch {
      setError('No fue posible cargar los estados.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) loadStatuses()
  }, [token])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value }))
  }

  const resetForm = () => {
    setFormData({ label: '', color: '#64748b', isFinal: false, sortOrder: 0 })
    setEditingId(null)
  }

  const handleEdit = (status: StatusConfig) => {
    setFormData({
      label: status.label,
      color: status.color,
      isFinal: status.isFinal,
      sortOrder: status.sortOrder
    })
    setEditingId(status.id)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.label.trim()) return

    setSaving(true)
    setError('')

    try {
      if (editingId) {
        await axios.patch(`${API_URL}/api/crm/settings/statuses/${editingId}`, formData, { headers: authHeaders() })
        setToast({ show: true, message: 'Estado actualizado correctamente', type: 'success' })
      } else {
        await axios.post(`${API_URL}/api/crm/settings/statuses`, formData, { headers: authHeaders() })
        setToast({ show: true, message: 'Estado creado correctamente', type: 'success' })
      }
      resetForm()
      await loadStatuses()
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Error al guardar el estado'
      setError(msg)
      setToast({ show: true, message: msg, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Desactivar este estado? Las conversaciones que lo usan mantendrán su código pero no se mostrará en la lista.')) return

    try {
      await axios.delete(`${API_URL}/api/crm/settings/statuses/${id}`, { headers: authHeaders() })
      setToast({ show: true, message: 'Estado desactivado', type: 'success' })
      await loadStatuses()
    } catch {
      setToast({ show: true, message: 'Error al desactivar el estado', type: 'error' })
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-neutral-darkgray">Cargando...</div>
  }

  return (
    <div className="p-8 max-w-4xl overflow-y-auto w-full mx-auto">
      {toast.show && (
        <div className={`fixed top-24 right-8 px-6 py-3 rounded shadow-lg animate-fade-in-down z-50 ${
          toast.type === 'success' ? 'bg-primary text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-neutral-gray p-8">
        <div className="flex items-center space-x-3 border-b border-neutral-gray pb-4 mb-6">
          <UserCheck className="w-6 h-6 text-secondary" />
          <h3 className="text-xl font-cormorant text-primary">Estados de Gestión</h3>
        </div>

        {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-md text-sm">{error}</div>}

        {/* Formulario crear/editar */}
        <form onSubmit={handleSubmit} className="mb-8 p-6 border border-neutral-gray rounded-lg bg-neutral-light/30">
          <h4 className="text-lg font-semibold text-primary mb-4">
            {editingId ? 'Editar Estado' : 'Crear Nuevo Estado'}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-neutral-dark mb-1">Nombre del estado <span className="text-red-500">*</span></label>
              <input
                type="text"
                name="label"
                value={formData.label}
                onChange={handleChange}
                placeholder="Ej. Pendiente de cotización"
                className="w-full p-3 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary bg-white text-sm"
                maxLength={60}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-dark mb-1">Color</label>
              <div className="flex items-center space-x-3">
                <input
                  type="color"
                  name="color"
                  value={formData.color}
                  onChange={handleChange}
                  className="w-12 h-10 rounded-md border border-neutral-gray cursor-pointer"
                />
                <span className="text-sm text-neutral-darkgray">{formData.color}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                name="isFinal"
                id="isFinal"
                checked={formData.isFinal}
                onChange={handleChange}
                className="w-4 h-4 text-secondary border-neutral-gray rounded focus:ring-secondary/50"
              />
              <label htmlFor="isFinal" className="text-sm text-neutral-dark">Estado final (sale de bandeja activa)</label>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-dark mb-1">Orden</label>
              <input
                type="number"
                name="sortOrder"
                value={formData.sortOrder}
                onChange={handleChange}
                min="0"
                className="w-full p-3 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary bg-white text-sm"
              />
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center space-x-2 bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-md transition-colors font-medium shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Guardando...' : (editingId ? 'Actualizar' : 'Crear')}</span>
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="flex items-center space-x-2 border border-neutral-gray text-neutral-dark hover:bg-neutral-light/50 px-6 py-2.5 rounded-md transition-colors font-medium"
              >
                <X className="w-4 h-4" />
                <span>Cancelar</span>
              </button>
            )}
          </div>
        </form>

        {/* Lista de estados */}
        <div className="border-t border-neutral-gray pt-6">
          <h4 className="text-lg font-semibold text-primary mb-4">Estados Configurados</h4>

          {statuses.length === 0 ? (
            <div className="text-center p-8 border-2 border-dashed border-neutral-gray rounded-md text-neutral-darkgray">
              No hay estados configurados. Crea el primero arriba.
            </div>
          ) : (
            <div className="space-y-3">
              {statuses.map((status) => (
                <div key={status.id} className="p-4 border border-neutral-gray rounded-lg bg-white flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center space-x-4 flex-1 min-w-0">
                    <div 
                      className="w-4 h-4 rounded-full border border-neutral-gray flex-shrink-0"
                      style={{ backgroundColor: status.color }}
                      title={status.color}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-primary truncate">{status.label}</p>
                      <p className="text-xs text-neutral-darkgray flex items-center space-x-2">
                        <span>Código: <code className="px-1.5 py-0.5 bg-neutral-light/50 rounded text-neutral-dark">{status.code}</code></span>
                        {status.isFinal && <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">Final</span>}
                        {!status.isActive && <span className="px-2 py-0.5 bg-neutral-gray text-neutral-darkgray text-xs rounded-full">Inactivo</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-neutral-darkgray">Orden: {status.sortOrder}</span>
                    <button
                      onClick={() => handleEdit(status)}
                      className="p-2 text-neutral-darkgray hover:text-primary hover:bg-neutral-light/50 rounded transition-colors"
                      title="Editar"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    {status.isActive && (
                      <button
                        onClick={() => handleDelete(status.id)}
                        className="p-2 text-neutral-darkgray hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Desactivar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
