import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Users,
  Plus,
  Edit,
  Key,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Trash2
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  availabilityStatus: string;
  maxActiveConversations: number;
  createdAt: string;
}

interface Toast {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

const API_URL = import.meta.env.VITE_API_URL ?? '';

export default function UserManagement({ token }: { token: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>({ show: false, message: '', type: 'success' });
  
  // Create user modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'AGENT' as 'AGENT' | 'MARKETING_DIRECTOR' | 'ADMIN'
  });
  const [creating, setCreating] = useState(false);

  // Edit user modal
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    email: '',
    name: '',
    role: 'AGENT' as 'AGENT' | 'MARKETING_DIRECTOR' | 'ADMIN',
    availabilityStatus: 'AVAILABLE' as 'AVAILABLE' | 'BUSY' | 'AWAY' | 'OFFLINE',
    maxActiveConversations: 20
  });
  const [saving, setSaving] = useState(false);

  // Reset password modal
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetMode, setResetMode] = useState<'set' | 'generate'>('set');
  const [resetPassword, setResetPassword] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [showGenerated, setShowGenerated] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Delete user modal
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const authHeaders = () => ({ Authorization: `Bearer ${token}` });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/crm/auth/users`, { headers: authHeaders() });
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
      showToast('Error al cargar usuarios', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await axios.post(`${API_URL}/api/crm/auth/users`, createForm, { headers: authHeaders() });
      showToast('Usuario creado correctamente');
      setShowCreateModal(false);
      setCreateForm({ email: '', password: '', name: '', role: 'AGENT' });
      fetchUsers();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { title?: string } } };
      showToast(axiosError.response?.data?.title || 'Error al crear usuario', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleEditClick = (user: User) => {
    setEditingUser(user);
    setEditForm({
      email: user.email,
      name: user.name,
      role: user.role as 'AGENT' | 'MARKETING_DIRECTOR' | 'ADMIN',
      availabilityStatus: user.availabilityStatus as 'AVAILABLE' | 'BUSY' | 'AWAY' | 'OFFLINE',
      maxActiveConversations: user.maxActiveConversations
    });
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      await axios.patch(`${API_URL}/api/crm/auth/users/${editingUser.id}`, editForm, { headers: authHeaders() });
      showToast('Usuario actualizado correctamente');
      setEditingUser(null);
      fetchUsers();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { title?: string } } };
      showToast(axiosError.response?.data?.title || 'Error al actualizar usuario', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    if (!confirm(`¿${user.isActive ? 'Desactivar' : 'Activar'} a ${user.name}?`)) return;
    try {
      await axios.patch(`${API_URL}/api/crm/auth/users/${user.id}/status`, { isActive: !user.isActive }, { headers: authHeaders() });
      showToast(`Usuario ${!user.isActive ? 'activado' : 'desactivado'} correctamente`);
      fetchUsers();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { title?: string } } };
      showToast(axiosError.response?.data?.title || 'Error al cambiar estado', 'error');
    }
  };

  const handleResetClick = (user: User) => {
    setResetUser(user);
    setResetMode('set');
    setResetPassword('');
    setGeneratedPassword('');
    setShowGenerated(false);
  };

  const handleReset = async () => {
    if (!resetUser) return;
    if (resetMode === 'set' && !resetPassword) {
      showToast('Introduce la nueva contraseña', 'error');
      return;
    }
    setResetting(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/crm/auth/users/${resetUser.id}/reset-password`,
        resetMode === 'generate' ? {} : { password: resetPassword },
        { headers: authHeaders() }
      );
      if (resetMode === 'generate' && response.data.tempPassword) {
        setGeneratedPassword(response.data.tempPassword);
        setShowGenerated(true);
        showToast('Contraseña temporal generada (se muestra una sola vez)');
      } else {
        showToast('Contraseña restablecida correctamente');
        setResetUser(null);
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { title?: string } } };
      showToast(axiosError.response?.data?.title || 'Error al restablecer contraseña', 'error');
    } finally {
      setResetting(false);
    }
  };

  const copyGenerated = () => {
    navigator.clipboard.writeText(generatedPassword);
    showToast('Contraseña copiada al portapapeles');
    setShowGenerated(false);
    setResetUser(null);
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    setDeleting(true);
    try {
      await axios.delete(`${API_URL}/api/crm/auth/users/${deletingUser.id}`, { headers: authHeaders() });
      showToast('Usuario eliminado correctamente');
      setDeletingUser(null);
      fetchUsers();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { title?: string } } };
      showToast(axiosError.response?.data?.title || 'Error al eliminar usuario', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const roleLabels: Record<string, string> = {
    ADMIN: 'Administrador',
    MARKETING_DIRECTOR: 'Directora Marketing',
    AGENT: 'Comercial'
  };

  const statusLabels: Record<string, string> = {
    AVAILABLE: 'Disponible',
    BUSY: 'Ocupado',
    AWAY: 'Ausente',
    OFFLINE: 'Desconectado'
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Users className="w-6 h-6 text-secondary" />
          <h3 className="text-xl font-cormorant text-primary">Gestión de Usuarios</h3>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-md transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>Crear Usuario</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-gray overflow-x-auto">
        <table className="w-full">
          <thead className="bg-neutral-light/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-darkgray uppercase tracking-wider">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-darkgray uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-darkgray uppercase tracking-wider">Rol</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-darkgray uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-darkgray uppercase tracking-wider">Disponibilidad</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-neutral-darkgray uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-gray">
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-neutral-darkgray">
                  No hay usuarios registrados.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className={!user.isActive ? 'bg-red-50' : ''}>
                  <td className="px-6 py-4 font-medium text-primary">{user.name}</td>
                  <td className="px-6 py-4 text-neutral-darkgray">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      user.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' :
                      user.role === 'MARKETING_DIRECTOR' ? 'bg-blue-100 text-blue-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {roleLabels[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`flex items-center space-x-1 text-sm ${
                      user.isActive ? 'text-green-600' : 'text-red-600'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span>{user.isActive ? 'Activo' : 'Inactivo'}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-darkgray">
                    {statusLabels[user.availabilityStatus] || user.availabilityStatus}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => handleEditClick(user)}
                      className="text-secondary hover:text-primary transition-colors p-1"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleStatus(user)}
                      className={`text-sm font-medium px-3 py-1 rounded transition-colors ${
                        user.isActive
                          ? 'bg-red-100 text-red-600 hover:bg-red-200'
                          : 'bg-green-100 text-green-600 hover:bg-green-200'
                      }`}
                    >
                      {user.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      onClick={() => handleResetClick(user)}
                      className="text-amber-600 hover:text-amber-800 transition-colors p-1"
                      title="Restablecer contraseña"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeletingUser(user)}
                      className="text-red-500 hover:text-red-700 transition-colors p-1"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-24 right-8 px-6 py-3 rounded shadow-lg animate-fade-in-down z-50 flex items-center space-x-2 ${
          toast.type === 'success' ? 'bg-primary text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold text-primary mb-4">Crear Nuevo Usuario</h4>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1">Nombre</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  required
                  className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1">Email</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  required
                  className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1">Contraseña (mín. 12 caracteres)</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  required
                  minLength={12}
                  className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1">Rol</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as 'AGENT' | 'MARKETING_DIRECTOR' | 'ADMIN' })}
                  className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                >
                  <option value="AGENT">Comercial</option>
                  <option value="MARKETING_DIRECTOR">Directora Marketing</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-neutral-darkgray hover:text-primary transition-colors">Cancelar</button>
                <button type="submit" disabled={creating} className="flex items-center space-x-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-md transition-colors disabled:opacity-50">
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{creating ? 'Creando...' : 'Crear Usuario'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingUser(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold text-primary mb-4">Editar Usuario: {editingUser.name}</h4>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  required
                  className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1">Nombre</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                  className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1">Rol</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as 'AGENT' | 'MARKETING_DIRECTOR' | 'ADMIN' })}
                  className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                >
                  <option value="AGENT">Comercial</option>
                  <option value="MARKETING_DIRECTOR">Directora Marketing</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1">Disponibilidad</label>
                <select
                  value={editForm.availabilityStatus}
                  onChange={(e) => setEditForm({ ...editForm, availabilityStatus: e.target.value as 'AVAILABLE' | 'BUSY' | 'AWAY' | 'OFFLINE' })}
                  className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                >
                  <option value="AVAILABLE">Disponible</option>
                  <option value="BUSY">Ocupado</option>
                  <option value="AWAY">Ausente</option>
                  <option value="OFFLINE">Desconectado</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1">Máx. conversaciones activas</label>
                <input
                  type="number"
                  value={editForm.maxActiveConversations}
                  onChange={(e) => setEditForm({ ...editForm, maxActiveConversations: parseInt(e.target.value) || 20 })}
                  min={1}
                  max={100}
                  className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 text-neutral-darkgray hover:text-primary transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="flex items-center space-x-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-md transition-colors disabled:opacity-50">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setResetUser(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold text-primary mb-4">Restablecer contraseña: {resetUser.name}</h4>
            
            {showGenerated ? (
              <div className="space-y-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">Contraseña temporal generada (se muestra una sola vez):</p>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={generatedPassword}
                    readOnly
                    className="flex-1 p-2.5 border border-amber-300 rounded-md bg-white font-mono text-sm"
                  />
                  <button
                    onClick={copyGenerated}
                    className="flex items-center space-x-1 bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded-md transition-colors text-sm"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Copiar</span>
                  </button>
                </div>
                <p className="text-xs text-amber-700">Guarda esta contraseña. No se volverá a mostrar.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex space-x-2 mb-2">
                  <button
                    onClick={() => setResetMode('set')}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                      resetMode === 'set' ? 'bg-primary text-white' : 'bg-neutral-light text-neutral-dark hover:bg-neutral-gray'
                    }`}
                  >
                    Escribir nueva
                  </button>
                  <button
                    onClick={() => setResetMode('generate')}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                      resetMode === 'generate' ? 'bg-primary text-white' : 'bg-neutral-light text-neutral-dark hover:bg-neutral-gray'
                    }`}
                  >
                    Generar temporal
                  </button>
                </div>

                {resetMode === 'set' && (
                  <div>
                    <label className="block text-sm font-medium text-neutral-dark mb-1">Nueva contraseña (mín. 12 caracteres)</label>
                    <input
                      type="password"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      minLength={12}
                      className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={() => { setResetUser(null); setShowGenerated(false); }}
                className="px-4 py-2 text-neutral-darkgray hover:text-primary transition-colors"
              >
                Cancelar
              </button>
              {showGenerated ? (
                <button
                  onClick={() => { setResetUser(null); setShowGenerated(false); setGeneratedPassword(''); }}
                  className="flex items-center space-x-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-md transition-colors"
                >
                  <span>Entendido</span>
                </button>
              ) : (
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="flex items-center space-x-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-md transition-colors disabled:opacity-50"
                >
                  {resetting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{resetting ? 'Procesando...' : (resetMode === 'generate' ? 'Generar' : 'Restablecer')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {deletingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDeletingUser(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-primary">Eliminar Usuario</h4>
                <p className="text-sm text-neutral-darkgray">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800">
                Se eliminará permanentemente a <strong>{deletingUser.name}</strong> ({deletingUser.email}).
              </p>
              <p className="text-sm text-red-800 mt-2">
                Sus conversaciones asignadas quedarán sin asignar.
              </p>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 text-neutral-darkgray hover:text-primary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition-colors disabled:opacity-50"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{deleting ? 'Eliminando...' : 'Eliminar definitivamente'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}