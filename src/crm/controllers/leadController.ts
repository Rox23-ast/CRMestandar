import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../core/auth/authMiddleware';
import { listLeads as listLeadsService } from '../services/leadService';

const problem = (res: Response, status: number, title: string) =>
  res.status(status).json({
    type: `https://httpstatuses.com/${status}`,
    title,
    status,
  });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  businessStatus: z.string().optional(),
  hasQuote: z.coerce.boolean().optional(),
  search: z.string().optional(),
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