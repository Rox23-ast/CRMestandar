import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/database/prisma';
import { AuthenticatedRequest } from '../../core/auth/authMiddleware';

const quickReplySchema = z.object({
  label: z.string().trim().min(1).max(60),
  text: z.string().trim().min(1).max(4096)
});

const idSchema = z.object({ id: z.string().uuid() });

const problem = (res: Response, status: number, title: string, detail?: string) =>
  res.status(status).json({
    type: `https://httpstatuses.com/${status}`,
    title,
    status,
    ...(detail ? { detail } : {})
  });

export const listQuickReplies = async (_req: AuthenticatedRequest, res: Response) => {
  const replies = await prisma.quickReply.findMany({ orderBy: { label: 'asc' } });
  return res.json(replies);
};

export const createQuickReply = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = quickReplySchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Quick reply data is invalid');

  try {
    const reply = await prisma.quickReply.create({ data: parsed.data });
    return res.status(201).json(reply);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code.includes('Unique constraint')) {
      return problem(res, 409, 'Ya existe una respuesta rápida con ese nombre');
    }
    return problem(res, 500, 'Unable to create quick reply');
  }
};

export const updateQuickReply = async (req: AuthenticatedRequest, res: Response) => {
  const parsedId = idSchema.safeParse(req.params);
  if (!parsedId.success) return problem(res, 400, 'Quick reply ID is invalid');
  const parsed = quickReplySchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Quick reply data is invalid');

  try {
    const reply = await prisma.quickReply.update({
      where: { id: parsedId.data.id },
      data: parsed.data
    });
    return res.json(reply);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code.includes('Unique constraint')) {
      return problem(res, 409, 'Ya existe una respuesta rápida con ese nombre');
    }
    return problem(res, 500, 'Unable to update quick reply');
  }
};

export const deleteQuickReply = async (req: AuthenticatedRequest, res: Response) => {
  const parsedId = idSchema.safeParse(req.params);
  if (!parsedId.success) return problem(res, 400, 'Quick reply ID is invalid');

  try {
    await prisma.quickReply.delete({ where: { id: parsedId.data.id } });
    return res.status(204).send();
  } catch {
    return problem(res, 500, 'Unable to delete quick reply');
  }
};
