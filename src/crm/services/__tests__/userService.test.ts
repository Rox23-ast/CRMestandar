import { prisma } from '../../../core/database/prisma';
import {
  listUsers,
  updateUser,
  setUserStatus,
  resetPassword,
  changePassword,
  deleteUser
} from '../userService';
import { verifyPassword } from '../../auth/passwordService';

jest.mock('../../../core/database/prisma', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      delete: jest.fn()
    },
    $transaction: jest.fn()
  }
}));

const mockPrisma = prisma as unknown as {
  user: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
    delete: jest.Mock;
  };
  $transaction: jest.Mock;
};

const baseUser = {
  id: 'user-1',
  email: 'target@test.com',
  password: 'scrypt$salt$hash',
  name: 'Target',
  role: 'AGENT',
  isActive: true,
  availabilityStatus: 'AVAILABLE',
  maxActiveConversations: 20,
  lastAssignedAt: null,
  tokenVersion: 0,
  createdAt: new Date(),
  updatedAt: new Date()
};

beforeEach(() => {
  jest.clearAllMocks();
  // The service wraps guarded writes in a transaction; run the callback with the same client.
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockPrisma)
  );
});

describe('userService', () => {
  describe('listUsers', () => {
    it('returns the user list without password hashes', async () => {
      mockPrisma.user.findMany.mockResolvedValue([baseUser]);
      const users = await listUsers();
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: expect.not.objectContaining({ password: expect.anything() }) })
      );
      expect(users).toHaveLength(1);
    });
  });

  describe('updateUser', () => {
    it('rejects changing your own role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, role: 'ADMIN' });
      await expect(updateUser('user-1', { role: 'AGENT' }, 'user-1')).rejects.toThrow('CANNOT_CHANGE_OWN_ROLE');
    });

    it('rejects demoting the last active admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, role: 'ADMIN' });
      mockPrisma.user.count.mockResolvedValue(1);
      await expect(updateUser('user-1', { role: 'AGENT' }, 'admin-other')).rejects.toThrow('CANNOT_DEMOTE_LAST_ADMIN');
    });

    it('updates allowed fields and returns the list shape', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, name: 'Renamed' });
      await updateUser('user-1', { name: 'Renamed' }, 'admin-other');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Renamed' } })
      );
    });

    it('rejects duplicate email', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(baseUser) // target user lookup
        .mockResolvedValueOnce({ ...baseUser, id: 'other-user', email: 'taken@test.com' }); // email conflict
      await expect(updateUser('user-1', { email: 'taken@test.com' }, 'admin-other')).rejects.toThrow('EMAIL_ALREADY_EXISTS');
    });

    it('allows keeping the same email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.update.mockResolvedValue(baseUser);
      await updateUser('user-1', { email: 'target@test.com' }, 'admin-other');
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });
  });

  describe('setUserStatus', () => {
    it('rejects deactivating yourself', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      await expect(setUserStatus('user-1', false, 'user-1')).rejects.toThrow('CANNOT_DEACTIVATE_SELF');
    });

    it('rejects deactivating the last active admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, role: 'ADMIN' });
      mockPrisma.user.count.mockResolvedValue(1);
      await expect(setUserStatus('user-1', false, 'admin-other')).rejects.toThrow('CANNOT_DEACTIVATE_LAST_ADMIN');
    });

    it('bumps tokenVersion only on deactivation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, isActive: false, tokenVersion: 1 });
      const result = await setUserStatus('user-1', false, 'admin-other');
      expect(result.isActive).toBe(false);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false, tokenVersion: { increment: 1 } } })
      );

      mockPrisma.user.update.mockResolvedValue({ ...baseUser, isActive: true, tokenVersion: 0 });
      await setUserStatus('user-1', true, 'admin-other');
      expect(mockPrisma.user.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: { isActive: true } })
      );
    });
  });

  describe('resetPassword', () => {
    it('hashes and stores the provided password, revoking sessions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.update.mockResolvedValue(baseUser);
      const result = await resetPassword('user-1', 'a-new-password-123');
      expect(result.tempPassword).toBeUndefined();
      const updateArgs = mockPrisma.user.update.mock.calls[0][0];
      expect(updateArgs.data.tokenVersion).toEqual({ increment: 1 });
      await expect(verifyPassword('a-new-password-123', updateArgs.data.password)).resolves.toBe(true);
    });

    it('generates a 16-char temp password when none is provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.update.mockResolvedValue(baseUser);
      const result = await resetPassword('user-1');
      expect(result.tempPassword).toBeDefined();
      expect(result.tempPassword).toHaveLength(16);
    });
  });

  describe('changePassword', () => {
    it('rejects a wrong current password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        password: 'scrypt$00000000000000000000000000000000$' + '0'.repeat(128)
      });
      await expect(changePassword('user-1', 'wrong-password', 'a-new-password-123')).rejects.toThrow(
        'INVALID_CURRENT_PASSWORD'
      );
    });

    it('returns the post-increment tokenVersion', async () => {
      const real = await import('../../auth/passwordService');
      const hashed = await real.hashPassword('current-password-123');
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, password: hashed });
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, tokenVersion: 1 });
      const result = await changePassword('user-1', 'current-password-123', 'a-new-password-123');
      expect(result.tokenVersion).toBe(1);
    });
  });

  describe('deleteUser', () => {
    it('deletes the user successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.delete.mockResolvedValue(baseUser);
      await deleteUser('user-1', 'admin-other');
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('rejects deleting yourself', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      await expect(deleteUser('user-1', 'user-1')).rejects.toThrow('CANNOT_DELETE_SELF');
    });

    it('rejects deleting the last active admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, role: 'ADMIN' });
      mockPrisma.user.count.mockResolvedValue(1);
      await expect(deleteUser('user-1', 'admin-other')).rejects.toThrow('CANNOT_DELETE_LAST_ADMIN');
    });

    it('rejects deleting a non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(deleteUser('non-existent', 'admin-other')).rejects.toThrow('USER_NOT_FOUND');
    });
  });
});
