import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../database/prisma';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    name: string;
  };
}

interface TokenPayload {
  sub?: string;
}

export const requireCrmUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authorization = req.header('authorization');
  const secret = process.env.JWT_SECRET;

  if (!authorization?.startsWith('Bearer ') || !secret) {
    return res.status(401).json({
      type: 'https://httpstatuses.com/401',
      title: 'Authentication required',
      status: 401,
      detail: 'A valid CRM access token is required.'
    });
  }

  try {
    const token = authorization.slice('Bearer '.length);
    const payload = jwt.verify(token, secret) as TokenPayload;

    if (!payload.sub) {
      return res.status(401).json({
        type: 'https://httpstatuses.com/401',
        title: 'Invalid authentication token',
        status: 401
      });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      return res.status(401).json({
        type: 'https://httpstatuses.com/401',
        title: 'User not found',
        status: 401
      });
    }

    req.user = { id: user.id, role: user.role, name: user.name };
    return next();
  } catch {
    return res.status(401).json({
      type: 'https://httpstatuses.com/401',
      title: 'Invalid authentication token',
      status: 401
    });
  }
};

export const requireCrmRole = (...roles: string[]) => (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      type: 'https://httpstatuses.com/403',
      title: 'Insufficient permissions',
      status: 403,
      detail: 'Your CRM role cannot perform this action.'
    });
  }

  return next();
};
