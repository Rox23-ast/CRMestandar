import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../../core/database/prisma';
import { AuthenticatedRequest } from '../../core/auth/authMiddleware';
import { hashPassword, verifyPassword } from '../auth/passwordService';

const credentialsSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(12).max(200)
});

const createUserSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(120),
  role: z.enum(['AGENT', 'MARKETING_DIRECTOR', 'ADMIN'])
});

const bootstrapSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(120),
  bootstrapToken: z.string().min(16).max(200)
});

const problem = (res: Response, status: number, title: string) =>
  res.status(status).json({ type: `https://httpstatuses.com/${status}`, title, status });

const issueToken = (user: { id: string; role: string }) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET_NOT_CONFIGURED');
  return jwt.sign({ role: user.role }, secret, { subject: user.id, expiresIn: '8h' });
};

export const bootstrapAdmin = async (req: Request, res: Response) => {
  const parsed = bootstrapSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Bootstrap data is invalid');
  if (parsed.data.bootstrapToken !== process.env.CRM_BOOTSTRAP_TOKEN) {
    return problem(res, 401, 'Invalid bootstrap token');
  }
  if (!process.env.JWT_SECRET) return problem(res, 500, 'JWT secret is not configured');

  try {
    const user = await prisma.$transaction(async (tx) => {
      // Creating this singleton inside the transaction makes bootstrap one-time under concurrent requests.
      await tx.bootstrapState.create({ data: { id: 'default' } });
      if (await tx.user.count() > 0) throw new Error('USERS_ALREADY_EXIST');
      return tx.user.create({
        data: {
          email: parsed.data.email.toLowerCase(),
          password: await hashPassword(parsed.data.password),
          name: parsed.data.name,
          role: 'ADMIN'
        }
      });
    });

    await prisma.bootstrapState.update({ where: { id: 'default' }, data: { completedAt: new Date() } });
    return res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role, token: issueToken(user) });
  } catch {
    return problem(res, 409, 'CRM bootstrap has already been completed');
  }
};

export const login = async (req: Request, res: Response) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Credentials are invalid');

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !(await verifyPassword(parsed.data.password, user.password))) {
    return problem(res, 401, 'Invalid credentials');
  }

  return res.json({ id: user.id, email: user.email, name: user.name, role: user.role, token: issueToken(user) });
};

export const createUser = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'User data is invalid');

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (existing) return problem(res, 409, 'Email is already registered');

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email.toLowerCase(),
      password: await hashPassword(parsed.data.password),
      name: parsed.data.name,
      role: parsed.data.role
    }
  });
  return res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
};
