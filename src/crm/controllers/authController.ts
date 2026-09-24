import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../../core/database/prisma';
import { AuthenticatedRequest } from '../../core/auth/authMiddleware';
import { hashPassword, verifyPassword } from '../auth/passwordService';
import {
  listUsers as listUsersService,
  updateUser as updateUserService,
  setUserStatus as setUserStatusService,
  resetPassword as resetPasswordService,
  changePassword as changePasswordService,
  deleteUser as deleteUserService,
  UpdateUserInput
} from '../services/userService';

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

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(['AGENT', 'MARKETING_DIRECTOR', 'ADMIN']).optional(),
  availabilityStatus: z.enum(['AVAILABLE', 'BUSY', 'AWAY', 'OFFLINE']).optional(),
  maxActiveConversations: z.number().int().positive().max(100).optional()
});

const setUserStatusSchema = z.object({
  isActive: z.boolean()
});

const resetPasswordSchema = z.object({
  password: z.string().min(12).max(200).optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200)
});

const problem = (res: Response, status: number, title: string, detail?: string) =>
  res.status(status).json({
    type: `https://httpstatuses.com/${status}`,
    title,
    status,
    ...(detail ? { detail } : {})
  });

const serviceErrorToProblem = (res: Response, error: unknown) => {
  if (!(error instanceof Error)) return problem(res, 500, 'Internal server error');
  switch (error.message) {
    case 'USER_NOT_FOUND':
      return problem(res, 404, 'User not found');
    case 'CANNOT_CHANGE_OWN_ROLE':
      return problem(res, 403, 'Cannot change your own role');
    case 'CANNOT_DEACTIVATE_SELF':
      return problem(res, 403, 'Cannot deactivate yourself');
    case 'CANNOT_DELETE_SELF':
      return problem(res, 403, 'Cannot delete yourself');
    case 'CANNOT_DEMOTE_LAST_ADMIN':
    case 'CANNOT_DEACTIVATE_LAST_ADMIN':
    case 'CANNOT_DELETE_LAST_ADMIN':
      return problem(res, 403, 'Cannot demote, deactivate, or delete the last active admin');
    case 'EMAIL_ALREADY_EXISTS':
      return problem(res, 409, 'A user with this email already exists');
    case 'INVALID_CURRENT_PASSWORD':
      return problem(res, 401, 'Current password is incorrect');
    default:
      return problem(res, 500, 'Internal server error');
  }
};

const issueToken = (user: { id: string; role: string; tokenVersion: number }) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET_NOT_CONFIGURED');
  return jwt.sign({ role: user.role, tv: user.tokenVersion }, secret, { subject: user.id, expiresIn: '8h' });
};

const paramId = (req: AuthenticatedRequest): string | undefined => {
  const { id } = req.params;
  return Array.isArray(id) ? id[0] : id;
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
    return res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      token: issueToken({ id: user.id, role: user.role, tokenVersion: user.tokenVersion })
    });
  } catch {
    const userCount = await prisma.user.count();
    return userCount > 0
      ? problem(res, 409, 'CRM bootstrap has already been completed')
      : problem(res, 500, 'Failed to bootstrap CRM');
  }
};

export const login = async (req: Request, res: Response) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Credentials are invalid');

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !(await verifyPassword(parsed.data.password, user.password))) {
    return problem(res, 401, 'Invalid credentials');
  }

  if (!user.isActive) {
    return problem(res, 403, 'Account disabled');
  }

  if (!process.env.JWT_SECRET) return problem(res, 500, 'JWT secret is not configured');

  return res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    token: issueToken({ id: user.id, role: user.role, tokenVersion: user.tokenVersion })
  });
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

export const listUsers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await listUsersService();
    return res.json(users);
  } catch {
    return problem(res, 500, 'Failed to list users');
  }
};

export const updateUser = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'User data is invalid');

  const userId = paramId(req);
  if (!userId) return problem(res, 400, 'User ID is required');

  try {
    const updated = await updateUserService(userId, parsed.data as UpdateUserInput, req.user!.id);
    return res.json(updated);
  } catch (error) {
    return serviceErrorToProblem(res, error);
  }
};

export const setUserStatus = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = setUserStatusSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'User status data is invalid');

  const userId = paramId(req);
  if (!userId) return problem(res, 400, 'User ID is required');

  try {
    const updated = await setUserStatusService(userId, parsed.data.isActive, req.user!.id);
    return res.json(updated);
  } catch (error) {
    return serviceErrorToProblem(res, error);
  }
};

export const resetUserPassword = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Invalid input');

  const userId = paramId(req);
  if (!userId) return problem(res, 400, 'User ID is required');

  try {
    const result = await resetPasswordService(userId, parsed.data.password);

    // Resetting your own password kills every session; issue a fresh token so the current one survives.
    if (userId === req.user!.id) {
      if (!process.env.JWT_SECRET) return problem(res, 500, 'JWT secret is not configured');
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return problem(res, 404, 'User not found');
      return res.json({
        ...result,
        token: issueToken({ id: user.id, role: user.role, tokenVersion: user.tokenVersion })
      });
    }

    return res.json(result);
  } catch (error) {
    return serviceErrorToProblem(res, error);
  }
};

export const changeOwnPassword = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Invalid input');

  try {
    const result = await changePasswordService(req.user!.id, parsed.data.currentPassword, parsed.data.newPassword);
    if (!process.env.JWT_SECRET) return problem(res, 500, 'JWT secret is not configured');
    return res.json({
      token: issueToken({ id: req.user!.id, role: req.user!.role, tokenVersion: result.tokenVersion })
    });
  } catch (error) {
    return serviceErrorToProblem(res, error);
  }
};

export const deleteUser = async (req: AuthenticatedRequest, res: Response) => {
  const userId = paramId(req);
  if (!userId) return problem(res, 400, 'User ID is required');

  try {
    await deleteUserService(userId, req.user!.id);
    return res.status(204).send();
  } catch (error) {
    return serviceErrorToProblem(res, error);
  }
};
