import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../core/auth/authMiddleware';
import { listLeads as listLeadsService, exportLeadsCsv } from '../services/leadService';

const problem = (res: Response, status: number, title: string) =>
  res.status(status).json({
    type: `https://httpstatuses.com/${status}`,
    title,
    status,
  });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  businessStatus: z.string().optional(),
  conversationStatus: z.string().optional(),
  priority: z.enum(['URGENT', 'HIGH', 'NORMAL', 'LOW']).optional(),
  assignedUserId: z.string().uuid().optional(),
  source: z.enum(['ADS', 'ORGANIC']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeFinal: z.coerce.boolean().optional(),
});

export const listLeads = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success || !req.user) {
    return problem(res, 400, 'Parámetros de filtro inválidos');
  }

  const result = await listLeadsService(parsed.data, req.user);

  return res.json({
    data: result.data,
    pagination: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    },
  });
};

/**
 * GET /api/crm/leads/export
 * Devuelve las mismas filas filtradas como CSV (separador ';', BOM UTF-8
 * para Excel) para descargar desde el panel de Leads.
 */
export const exportLeads = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success || !req.user) {
    return problem(res, 400, 'Parámetros de filtro inválidos');
  }

  const csv = await exportLeadsCsv(parsed.data, req.user);

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(`\uFEFF${csv}`);
};
