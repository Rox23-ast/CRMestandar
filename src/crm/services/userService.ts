import { prisma } from '../../core/database/prisma';
import { hashPassword, verifyPassword } from '../auth/passwordService';
import { randomBytes } from 'node:crypto';

const userListSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  availabilityStatus: true,
  maxActiveConversations: true,
  createdAt: true
} as const;

export interface UserListItem {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  availabilityStatus: string;
  maxActiveConversations: number;
  createdAt: Date;
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
  role?: 'AGENT' | 'MARKETING_DIRECTOR' | 'ADMIN';
  availabilityStatus?: string;
  maxActiveConversations?: number;
}

export interface ResetPasswordResult {
  tempPassword?: string;
}

export async function listUsers(): Promise<UserListItem[]> {
  return prisma.user.findMany({
    select: userListSelect,
    orderBy: { createdAt: 'desc' }
  });
}

export async function updateUser(
  targetUserId: string,
  data: UpdateUserInput,
  currentUserId: string
): Promise<UserListItem> {
  return prisma.$transaction(async (tx) => {
    const targetUser = await tx.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) throw new Error('USER_NOT_FOUND');

    if (targetUserId === currentUserId && data.role && data.role !== targetUser.role) {
      throw new Error('CANNOT_CHANGE_OWN_ROLE');
    }

    if (data.role && data.role !== 'ADMIN' && targetUser.role === 'ADMIN' && targetUser.isActive) {
      const activeAdmins = await tx.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (activeAdmins <= 1) throw new Error('CANNOT_DEMOTE_LAST_ADMIN');
    }

    if (data.email) {
      const normalizedEmail = data.email.toLowerCase().trim();
      const existing = await tx.user.findUnique({ where: { email: normalizedEmail } });
      if (existing && existing.id !== targetUserId) throw new Error('EMAIL_ALREADY_EXISTS');
      data.email = normalizedEmail;
    }

    return tx.user.update({
      where: { id: targetUserId },
      data: {
        email: data.email,
        name: data.name,
        role: data.role,
        availabilityStatus: data.availabilityStatus,
        maxActiveConversations: data.maxActiveConversations
      },
      select: userListSelect
    });
  });
}

export async function setUserStatus(
  targetUserId: string,
  isActive: boolean,
  currentUserId: string
): Promise<UserListItem> {
  return prisma.$transaction(async (tx) => {
    const targetUser = await tx.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) throw new Error('USER_NOT_FOUND');

    if (!isActive && targetUserId === currentUserId) {
      throw new Error('CANNOT_DEACTIVATE_SELF');
    }

    if (!isActive && targetUser.role === 'ADMIN' && targetUser.isActive) {
      const activeAdmins = await tx.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (activeAdmins <= 1) throw new Error('CANNOT_DEACTIVATE_LAST_ADMIN');
    }

    return tx.user.update({
      where: { id: targetUserId },
      data: {
        isActive,
        // Deactivation revokes every outstanding session immediately.
        ...(isActive ? {} : { tokenVersion: { increment: 1 } })
      },
      select: userListSelect
    });
  });
}

export async function resetPassword(
  targetUserId: string,
  newPassword?: string
): Promise<ResetPasswordResult> {
  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) throw new Error('USER_NOT_FOUND');

  let password = newPassword;
  let tempPassword: string | undefined;

  if (!password) {
    password = randomBytes(12).toString('base64url');
    tempPassword = password;
  }

  const hashed = await hashPassword(password);

  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      password: hashed,
      tokenVersion: { increment: 1 }
    }
  });

  return { tempPassword };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ tokenVersion: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('USER_NOT_FOUND');

  if (!(await verifyPassword(currentPassword, user.password))) {
    throw new Error('INVALID_CURRENT_PASSWORD');
  }

  const hashed = await hashPassword(newPassword);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashed,
      tokenVersion: { increment: 1 }
    }
  });

  // Read the post-increment value so the issued token always matches the DB.
  return { tokenVersion: updated.tokenVersion };
}

export async function deleteUser(
  targetUserId: string,
  currentUserId: string
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const targetUser = await tx.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) throw new Error('USER_NOT_FOUND');

    if (targetUserId === currentUserId) {
      throw new Error('CANNOT_DELETE_SELF');
    }

    if (targetUser.role === 'ADMIN' && targetUser.isActive) {
      const activeAdmins = await tx.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (activeAdmins <= 1) throw new Error('CANNOT_DELETE_LAST_ADMIN');
    }

    await tx.user.delete({ where: { id: targetUserId } });
  });
}
