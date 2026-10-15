import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Users,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Download,
  RefreshCw,
  X,
} from 'lucide-react';

interface LeadRow {
  id: string;
  client: { id: string; name: string | null; phone: string; createdAt: string };
  status: string;
  businessStatus: string | null;
  priority: string;
  source: string | null;
  lastMessageAt: string;
  assignedUser: { id: string; name: string; role: string } | null;
}

interface BusinessStatusConfig {
  code: string;
  label: string;
  color: string;
  isFinal: boolean;
  isActive: boolean;
}

interface LeadsResponse {
  data: LeadRow[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

const API_URL = import.meta.env.VITE_API_URL ?? '';

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Nueva',
  BOT_ACTIVE: 'Bot activo',
  HUMAN_ACTIVE: 'Atención humana',
  WAITING_CUSTOMER: 'Esperando cliente',
  RESOLVED: 'Resuelta',
  CLOSED: 'Cerrada',
};

const PRIORITY_LABELS: Record<string, string> = {
  URGENT: 'Urgente',
  HIGH: 'Alta',
  NORMAL: 'Normal',
  LOW: 'Baja',
};

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-800 border border-red-300',
  HIGH: 'bg-orange-100 text-orange-800 border border-orange-300',
  NORMAL: 'bg-blue-100 text-blue-800 border border-blue-300',
  LOW: 'bg-gray-100 text-gray-600 border border-gray-300',
};

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function Leads({ token, userRole }: { token: string; userRole: string }) {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [businessStatus, setBusinessStatus] = useState('');
  const [conversationStatus, setConversationStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [source, setSource] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [includeFinal, setIncludeFinal] = useState(false);
  const [statusConfigs, setStatusConfigs] = useState<BusinessStatusConfig[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [exporting, setExporting] = useState(false)
  const [exportingMessages, setExportingMessages] = useState(false);

  const canAssign = userRole === 'ADMIN' || userRole === 'MARKETING_DIRECTOR';

  const authHeaders = () => ({ Authorization: `Bearer ${token}` });

  useEffect(() => {
    void axios
      .get(`${API_URL}/api/crm/settings/statuses`, { headers: authHeaders() })
      .then((response) => setStatusConfigs(response.data))
      .catch(() => undefined);
    if (canAssign) {
      void axios
        .get(`${API_URL}/api/crm/assignable-users`, { headers: authHeaders() })
        .then((response) => setAssignableUsers(response.data))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canAssign]);

  const buildParams = useCallback(() => {
    const params: Record<string, string | number | boolean> = { page, pageSize: 100 };
    if (search) params.search = search;
    if (businessStatus) params.businessStatus = businessStatus;
    if (conversationStatus) params.conversationStatus = conversationStatus;
    if (priority) params.priority = priority;
    if (assignedUserId) params.assignedUserId = assignedUserId;
    if (source) params.source = source;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    if (includeFinal) params.includeFinal = true;
    return params;
  }, [page, search, businessStatus, conversationStatus, priority, assignedUserId, source, dateFrom, dateTo, includeFinal]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get<LeadsResponse>(`${API_URL}/api/crm/leads`, {
        headers: authHeaders(),
        // El parámetro _ evita la revalidación 304 del navegador: Sincronizar
        // siempre pide datos frescos al servidor.
        params: { ...buildParams(), _: Date.now() },
      });

      setLeads(response.data.data);
      setTotalPages(response.data.pagination.totalPages);
      setTotal(response.data.pagination.total);
    } catch (err) {
      console.error('Error fetching leads:', err);
      setError('Error al cargar los leads.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildParams]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  // Refresco ligero: mantiene la hoja actualizada (asignaciones y estados)
  // sin depender del F5 ni de volver a entrar a la pestaña.
  useEffect(() => {
    const interval = setInterval(() => {
      void fetchLeads().catch(() => undefined);
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchLeads]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setBusinessStatus('');
    setConversationStatus('');
    setPriority('');
    setAssignedUserId('');
    setSource('');
    setDateFrom('');
    setDateTo('');
    setIncludeFinal(false);
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, string | number | boolean> = { ...buildParams() };
      delete params.page;
      delete params.pageSize;
      const response = await axios.get(`${API_URL}/api/crm/leads/export`, {
        headers: authHeaders(),
        params,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('No fue posible exportar los leads.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportMessages = async () => {
    setExportingMessages(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const response = await axios.get(`${API_URL}/api/crm/messages/export`, {
        headers: authHeaders(),
        params,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mensajes-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('No fue posible exportar los mensajes.');
    } finally {
      setExportingMessages(false);
    }
  };

  const businessStatusMeta = (code: string | null) => {
    if (!code) return { label: 'Sin gestión', color: '#94a3b8' };
    const config = statusConfigs.find((s) => s.code === code);
    return config ? { label: config.label, color: config.color } : { label: code.replace(/_/g, ' '), color: '#94a3b8' };
  };

  const activeFilterCount = [
    search,
    businessStatus,
    conversationStatus,
    priority,
    assignedUserId,
    source,
    dateFrom,
    dateTo,
    includeFinal,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-gray pb-4">
        <div className="flex items-center space-x-3">
          <Users className="w-6 h-6 text-secondary" />
          <div>
            <h3 className="text-xl font-cormorant text-primary">Leads</h3>
            <p className="text-sm text-neutral-gray mt-1">
              {total} conversación{total !== 1 ? 'es' : ''} en el sistema
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void fetchLeads()}
            disabled={loading}
            className="flex items-center space-x-2 border border-secondary text-secondary px-4 py-2 rounded-md text-sm hover:bg-secondary/10 transition-colors disabled:opacity-50"
            title="Recargar los datos con las asignaciones y estados más recientes"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>Sincronizar</span>
          </button>
          {userRole === 'ADMIN' && (
            <button
              onClick={() => void handleExportMessages()}
              disabled={exportingMessages}
              className="flex items-center space-x-2 border border-neutral-gray text-neutral-dark px-4 py-2 rounded-md text-sm hover:bg-neutral-light/50 transition-colors disabled:opacity-50"
              title="Exportar todos los mensajes del historial (solo administradores)"
            >
              {exportingMessages ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{exportingMessages ? 'Exportando…' : 'Exportar mensajes'}</span>
            </button>
          )}
          <button
            onClick={() => void handleExport()}
            disabled={exporting}
            className="flex items-center space-x-2 bg-primary text-white px-4 py-2 rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{exporting ? 'Exportando…' : 'Exportar CSV'}</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-neutral-gray p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm text-neutral-gray">
            <Filter className="w-4 h-4" />
            <span className="font-medium">Filtros</span>
            {activeFilterCount > 0 && (
              <span className="bg-secondary/10 text-secondary text-xs px-2 py-0.5 rounded-full">
                {activeFilterCount} activo{activeFilterCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="flex items-center space-x-1 text-xs text-neutral-darkgray hover:text-red-500 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Limpiar filtros</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-gray" />
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-neutral-gray rounded-md text-sm focus:outline-none focus:border-secondary"
            />
          </div>

          <select
            value={businessStatus}
            onChange={(e) => { setBusinessStatus(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 border border-neutral-gray rounded-md text-sm focus:outline-none focus:border-secondary"
          >
            <option value="">Todos los estados de gestión</option>
            {statusConfigs
              .filter((s) => s.isActive)
              .map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
          </select>

          <select
            value={conversationStatus}
            onChange={(e) => { setConversationStatus(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 border border-neutral-gray rounded-md text-sm focus:outline-none focus:border-secondary"
          >
            <option value="">Todos los estados de conversación</option>
            {Object.entries(STATUS_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>

          <select
            value={priority}
            onChange={(e) => { setPriority(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 border border-neutral-gray rounded-md text-sm focus:outline-none focus:border-secondary"
          >
            <option value="">Todas las prioridades</option>
            {Object.entries(PRIORITY_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>

          {canAssign && (
            <select
              value={assignedUserId}
              onChange={(e) => { setAssignedUserId(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-neutral-gray rounded-md text-sm focus:outline-none focus:border-secondary"
            >
              <option value="">Todos los comerciales</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          )}

          <select
            value={source}
            onChange={(e) => { setSource(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 border border-neutral-gray rounded-md text-sm focus:outline-none focus:border-secondary"
          >
            <option value="">Todos los orígenes</option>
            <option value="ADS">Pauta (Meta Ads)</option>
            <option value="ORGANIC">Orgánico</option>
          </select>

          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="flex-1 px-3 py-2 border border-neutral-gray rounded-md text-sm focus:outline-none focus:border-secondary"
            />
            <span className="text-neutral-gray text-sm">a</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="flex-1 px-3 py-2 border border-neutral-gray rounded-md text-sm focus:outline-none focus:border-secondary"
            />
          </div>

          <label className="flex items-center space-x-2 text-sm text-neutral-darkgray cursor-pointer">
            <input
              type="checkbox"
              checked={includeFinal}
              onChange={(e) => { setIncludeFinal(e.target.checked); setPage(1); }}
              className="w-4 h-4 text-secondary border-neutral-gray rounded focus:ring-secondary/50"
            />
            <span>Incluir finalizadas</span>
          </label>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-md flex items-center space-x-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-lg border border-neutral-gray overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-secondary" />
            <span className="ml-2 text-neutral-gray">Cargando leads…</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12 text-neutral-gray">
            No se encontraron conversaciones con los filtros seleccionados.
          </div>
        ) : (
          <table className="w-full min-w-[900px]">
            <thead className="bg-neutral-gray/10 border-b border-neutral-gray">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-primary whitespace-nowrap">Último mensaje</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-primary">Cliente</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-primary">Estado</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-primary">Gestión</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-primary">Prioridad</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-primary">Origen</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-primary">Comercial</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-gray">
              {leads.map((lead) => {
                const bizInfo = businessStatusMeta(lead.businessStatus);
                return (
                  <tr key={lead.id} className="hover:bg-neutral-gray/5 transition-colors">
                    <td className="px-4 py-3 text-sm text-neutral-gray whitespace-nowrap">
                      {formatDateTime(lead.lastMessageAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-primary">
                        {lead.client.name || 'Sin nombre'}
                      </p>
                      <p className="text-xs text-neutral-gray">{lead.client.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-neutral-dark">{STATUS_LABELS[lead.status] || lead.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block px-2.5 py-1 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: bizInfo.color }}
                      >
                        {bizInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${PRIORITY_COLORS[lead.priority] || PRIORITY_COLORS.LOW}`}>
                        {PRIORITY_LABELS[lead.priority] || lead.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lead.source === 'ADS' ? (
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-300">
                          Pauta
                        </span>
                      ) : (
                        <span className="text-sm text-neutral-gray">Orgánico</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lead.assignedUser ? (
                        <div className="text-sm">
                          <p className="text-primary">{lead.assignedUser.name}</p>
                          <p className="text-xs text-neutral-gray">
                            {lead.assignedUser.role === 'MARKETING_DIRECTOR' ? 'Directora' : 'Comercial'}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-gray italic">Sin asignar</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-gray">
            Página {page} de {totalPages} · {total} resultados
          </p>
          <div className="flex space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-md border border-neutral-gray text-neutral-gray hover:bg-neutral-gray/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-md border border-neutral-gray text-neutral-gray hover:bg-neutral-gray/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
