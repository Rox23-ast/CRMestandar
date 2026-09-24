import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Users,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  ExternalLink,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';

interface LeadClient {
  id: string;
  name: string | null;
  phone: string;
  createdAt: string;
}

interface LeadConversation {
  id: string;
  status: string;
  businessStatus: string | null;
  priority: string;
  lastMessageAt: string;
  assignedUser: {
    id: string;
    name: string;
    role: string;
  } | null;
}

interface LeadQuote {
  id: string;
  origin: string;
  destination: string;
  volume: number | null;
  price: number | null;
  status: string;
  updatedAt: string;
}

interface Lead {
  client: LeadClient;
  conversation: LeadConversation | null;
  quote: LeadQuote | null;
  hasQuote: boolean;
}

interface LeadsResponse {
  data: Lead[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

const API_URL = import.meta.env.VITE_API_URL ?? '';

const BUSINESS_STATUS_COLORS: Record<string, string> = {
  PENDIENTE_COTIZACION: 'bg-amber-100 text-amber-800 border border-amber-300',
  EN_PROCESO: 'bg-blue-100 text-blue-800 border border-blue-300',
  FINALIZADO: 'bg-green-100 text-green-800 border border-green-300',
  SIN_CONVERSACION: 'bg-gray-100 text-gray-600 border border-gray-300',
};

const QUOTE_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
  ACCEPTED: 'bg-green-100 text-green-800 border border-green-300',
  REJECTED: 'bg-red-100 text-red-800 border border-red-300',
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `${diffMin}min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

export default function Leads({ token }: { token: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [businessStatus, setBusinessStatus] = useState('');
  const [hasQuoteFilter, setHasQuoteFilter] = useState<boolean | undefined>(undefined);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const authHeaders = () => ({ Authorization: `Bearer ${token}` });

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number | boolean> = { page, pageSize: 20 };
      if (search) params.search = search;
      if (businessStatus) params.businessStatus = businessStatus;
      if (hasQuoteFilter !== undefined) params.hasQuote = hasQuoteFilter;

      const response = await axios.get<LeadsResponse>(`${API_URL}/api/crm/leads`, {
        headers: authHeaders(),
        params,
      });

      setLeads(response.data.data);
      setTotalPages(response.data.pagination.totalPages);
      setTotal(response.data.pagination.total);
      setPage(response.data.pagination.page);
    } catch (err) {
      console.error('Error fetching leads:', err);
      setError('Error al cargar leads');
    } finally {
      setLoading(false);
    }
  }, [page, search, businessStatus, hasQuoteFilter, token]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusFilter = (value: string) => {
    setBusinessStatus(value);
    setPage(1);
  };

  const handleHasQuoteFilter = (value: boolean | undefined) => {
    setHasQuoteFilter(value);
    setPage(1);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center space-x-3 border-b border-neutral-gray pb-4">
        <Users className="w-6 h-6 text-secondary" />
        <div>
          <h3 className="text-xl font-cormorant text-primary">Leads</h3>
          <p className="text-sm text-neutral-gray mt-1">
            {total} lead{total !== 1 ? 's' : ''} en el sistema
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-neutral-gray p-4 space-y-4">
        <div className="flex items-center space-x-2 text-sm text-neutral-gray">
          <Filter className="w-4 h-4" />
          <span className="font-medium">Filtros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-gray" />
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-neutral-gray rounded-md text-sm focus:outline-none focus:border-secondary"
            />
          </div>

          <select
            value={businessStatus}
            onChange={(e) => handleStatusFilter(e.target.value)}
            className="w-full px-4 py-2 border border-neutral-gray rounded-md text-sm focus:outline-none focus:border-secondary"
          >
            <option value="">Todos los estados</option>
            <option value="PENDIENTE_COTIZACION">Pendiente cotización</option>
            <option value="EN_PROCESO">En proceso</option>
            <option value="FINALIZADO">Finalizado</option>
          </select>

          <div className="flex space-x-2">
            <button
              onClick={() => handleHasQuoteFilter(undefined)}
              className={`px-3 py-2 rounded-md text-sm border transition-colors ${
                hasQuoteFilter === undefined
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-neutral-gray border-neutral-gray hover:bg-neutral-gray/10'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => handleHasQuoteFilter(true)}
              className={`px-3 py-2 rounded-md text-sm border transition-colors ${
                hasQuoteFilter === true
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-neutral-gray border-neutral-gray hover:bg-neutral-gray/10'
              }`}
            >
              Con cotización
            </button>
            <button
              onClick={() => handleHasQuoteFilter(false)}
              className={`px-3 py-2 rounded-md text-sm border transition-colors ${
                hasQuoteFilter === false
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white text-neutral-gray border-neutral-gray hover:bg-neutral-gray/10'
              }`}
            >
              Sin cotización
            </button>
          </div>
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
      <div className="bg-white rounded-lg border border-neutral-gray overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-secondary" />
            <span className="ml-2 text-neutral-gray">Cargando leads...</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12 text-neutral-gray">
            No se encontraron leads con los filtros seleccionados.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-neutral-gray/10 border-b border-neutral-gray">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-primary">Cliente</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-primary">Estado gestión</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-primary">Cotización</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-primary">Asignado</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-primary">Última actividad</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-primary">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-gray">
              {leads.map((lead) => (
                <tr key={lead.client.id} className="hover:bg-neutral-gray/5 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-primary">
                        {lead.client.name || 'Sin nombre'}
                      </p>
                      <p className="text-xs text-neutral-gray">{lead.client.phone}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                        BUSINESS_STATUS_COLORS[lead.conversation?.businessStatus || 'SIN_CONVERSACION'] ||
                        BUSINESS_STATUS_COLORS.SIN_CONVERSACION
                      }`}
                    >
                      {(lead.conversation?.businessStatus || 'SIN_CONVERSACION').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {lead.hasQuote ? (
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                          lead.quote ? QUOTE_STATUS_COLORS[lead.quote.status] || '' : ''
                        }`}
                      >
                        {lead.quote?.status === 'PENDING' && 'Pendiente'}
                        {lead.quote?.status === 'ACCEPTED' && 'Aceptada'}
                        {lead.quote?.status === 'REJECTED' && 'Rechazada'}
                      </span>
                    ) : (
                      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                        Sin cotización
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {lead.conversation?.assignedUser ? (
                      <div className="text-sm">
                        <p className="text-primary">{lead.conversation.assignedUser.name}</p>
                        <p className="text-xs text-neutral-gray">
                          {lead.conversation.assignedUser.role === 'MARKETING_DIRECTOR'
                            ? 'Directora'
                            : 'Comercial'}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-gray italic">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {lead.conversation?.lastMessageAt ? (
                      <span className="text-sm text-neutral-gray">
                        {formatRelativeTime(lead.conversation.lastMessageAt)}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-gray italic">Sin actividad</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      {lead.conversation && (
                        <button
                          onClick={() => setSelectedLead(lead)}
                          className="p-1.5 rounded-md text-neutral-gray hover:bg-primary/10 hover:text-primary transition-colors"
                          title="Ver detalle"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-gray">
            Página {page} de {totalPages}
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

      {/* Modal de detalle */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-neutral-gray">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-5 h-5 text-secondary" />
                <h4 className="font-cormorant text-lg text-primary">Detalle del Lead</h4>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="p-1 rounded-md hover:bg-neutral-gray/10"
              >
                <X className="w-5 h-5 text-neutral-gray" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Cliente */}
              <div>
                <h5 className="text-sm font-medium text-primary mb-2">Cliente</h5>
                <div className="bg-neutral-gray/5 rounded-lg p-3 space-y-1">
                  <p className="text-sm">
                    <span className="text-neutral-gray">Nombre:</span>{' '}
                    {selectedLead.client.name || 'Sin nombre'}
                  </p>
                  <p className="text-sm">
                    <span className="text-neutral-gray">Teléfono:</span>{' '}
                    {selectedLead.client.phone}
                  </p>
                  <p className="text-sm">
                    <span className="text-neutral-gray">Creado:</span>{' '}
                    {new Date(selectedLead.client.createdAt).toLocaleDateString('es-AR')}
                  </p>
                </div>
              </div>

              {/* Conversación */}
              {selectedLead.conversation && (
                <div>
                  <h5 className="text-sm font-medium text-primary mb-2">Conversación</h5>
                  <div className="bg-neutral-gray/5 rounded-lg p-3 space-y-1">
                    <p className="text-sm">
                      <span className="text-neutral-gray">Estado:</span>{' '}
                      {selectedLead.conversation.status}
                    </p>
                    <p className="text-sm">
                      <span className="text-neutral-gray">Gestión:</span>{' '}
                      {selectedLead.conversation.businessStatus?.replace(/_/g, ' ') || 'N/A'}
                    </p>
                    <p className="text-sm">
                      <span className="text-neutral-gray">Prioridad:</span>{' '}
                      {selectedLead.conversation.priority}
                    </p>
                    <p className="text-sm">
                      <span className="text-neutral-gray">Asignado a:</span>{' '}
                      {selectedLead.conversation.assignedUser?.name || 'Sin asignar'}
                    </p>
                    <p className="text-sm">
                      <span className="text-neutral-gray">Último mensaje:</span>{' '}
                      {formatRelativeTime(selectedLead.conversation.lastMessageAt)}
                    </p>
                  </div>
                </div>
              )}

              {/* Cotización */}
              {selectedLead.quote && (
                <div>
                  <h5 className="text-sm font-medium text-primary mb-2">Cotización</h5>
                  <div className="bg-neutral-gray/5 rounded-lg p-3 space-y-1">
                    <p className="text-sm">
                      <span className="text-neutral-gray">Origen:</span>{' '}
                      {selectedLead.quote.origin}
                    </p>
                    <p className="text-sm">
                      <span className="text-neutral-gray">Destino:</span>{' '}
                      {selectedLead.quote.destination}
                    </p>
                    {selectedLead.quote.volume && (
                      <p className="text-sm">
                        <span className="text-neutral-gray">Volumen:</span>{' '}
                        {selectedLead.quote.volume} m³
                      </p>
                    )}
                    {selectedLead.quote.price && (
                      <p className="text-sm">
                        <span className="text-neutral-gray">Precio:</span>{' '}
                        ${selectedLead.quote.price.toLocaleString('es-AR')}
                      </p>
                    )}
                    <p className="text-sm">
                      <span className="text-neutral-gray">Estado:</span>{' '}
                      {selectedLead.quote.status}
                    </p>
                  </div>
                </div>
              )}

              {!selectedLead.hasQuote && (
                <div>
                  <h5 className="text-sm font-medium text-primary mb-2">Cotización</h5>
                  <p className="text-sm text-neutral-gray italic">No tiene cotización asociada</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}