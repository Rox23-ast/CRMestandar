import { useState } from 'react';
import axios from 'axios';
import { Save, Loader2, AlertCircle, Check, Eye, EyeOff } from 'lucide-react';

interface Toast {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

const API_URL = import.meta.env.VITE_API_URL ?? '';

export default function AccountSettings({ token, onTokenChange }: { token: string; onTokenChange: (newToken: string) => void }) {
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast>({ show: false, message: '', type: 'success' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const authHeaders = () => ({ Authorization: `Bearer ${token}` });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.currentPassword) newErrors.currentPassword = 'Contraseña actual requerida';
    if (!form.newPassword) newErrors.newPassword = 'Nueva contraseña requerida';
    else if (form.newPassword.length < 12) newErrors.newPassword = 'Mínimo 12 caracteres';
    if (form.newPassword !== form.confirmPassword) newErrors.confirmPassword = 'Las contraseñas no coinciden';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/crm/auth/change-password`,
        {
          currentPassword: form.currentPassword,
          newPassword: form.newPassword
        },
        { headers: authHeaders() }
      );
      if (response.data.token) {
        onTokenChange(response.data.token);
      }
      showToast('Contraseña cambiada correctamente. Tu sesión se ha renovado.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number; data?: { title?: string } } };
      if (axiosError.response?.status === 401) {
        setErrors({ currentPassword: 'Contraseña actual incorrecta' });
      }
      showToast(axiosError.response?.data?.title || 'Error al cambiar contraseña', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-xl">
      <div className="flex items-center space-x-3 border-b border-neutral-gray pb-4 mb-6">
        <Save className="w-6 h-6 text-secondary" />
        <h3 className="text-xl font-cormorant text-primary">Cambiar Contraseña</h3>
      </div>

      <p className="text-sm text-neutral-darkgray mb-6">
        Cambia tu contraseña. Se te requerirá la contraseña actual y la nueva debe tener al menos 12 caracteres.
        Al cambiarla, se cerrarán todas tus otras sesiones activas.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-neutral-dark mb-1">Contraseña Actual</label>
          <div className="relative">
            <input
              type={showPasswords ? 'text' : 'password'}
              value={form.currentPassword}
              onChange={(e) => handleChange('currentPassword', e.target.value)}
              className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary pr-10"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPasswords(!showPasswords)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-darkgray hover:text-primary"
            >
              {showPasswords ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.currentPassword && <p className="mt-1 text-sm text-red-600">{errors.currentPassword}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-dark mb-1">Nueva Contraseña</label>
          <div className="relative">
            <input
              type={showPasswords ? 'text' : 'password'}
              value={form.newPassword}
              onChange={(e) => handleChange('newPassword', e.target.value)}
              className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary pr-10"
              autoComplete="new-password"
              minLength={12}
            />
            <button
              type="button"
              onClick={() => setShowPasswords(!showPasswords)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-darkgray hover:text-primary"
            >
              {showPasswords ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.newPassword && <p className="mt-1 text-sm text-red-600">{errors.newPassword}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-dark mb-1">Confirmar Nueva Contraseña</label>
          <div className="relative">
            <input
              type={showPasswords ? 'text' : 'password'}
              value={form.confirmPassword}
              onChange={(e) => handleChange('confirmPassword', e.target.value)}
              className="w-full p-2.5 border border-neutral-gray rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPasswords(!showPasswords)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-darkgray hover:text-primary"
            >
              {showPasswords ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.confirmPassword && <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center space-x-2 bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-md transition-colors font-medium disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{saving ? 'Cambiando...' : 'Cambiar Contraseña'}</span>
        </button>
      </form>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-24 right-8 px-6 py-3 rounded shadow-lg animate-fade-in-down z-50 flex items-center space-x-2 ${
          toast.type === 'success' ? 'bg-primary text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}