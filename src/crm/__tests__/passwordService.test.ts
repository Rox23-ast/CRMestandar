import { hashPassword, verifyPassword } from '../auth/passwordService';

describe('CRM password storage', () => {
  it('verifies a password without storing it in plain text', async () => {
    const password = 'MudanzasChico!2026';
    const stored = await hashPassword(password);

    expect(stored).toMatch(/^scrypt\$/);
    await expect(verifyPassword(password, stored)).resolves.toBe(true);
    await expect(verifyPassword('incorrect-password', stored)).resolves.toBe(false);
  });
});
