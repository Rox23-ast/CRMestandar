import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export const hashPassword = async (password: string) => {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
};

export const verifyPassword = async (password: string, storedPassword: string) => {
  const [algorithm, salt, storedHash] = storedPassword.split('$');
  if (algorithm !== 'scrypt' || !salt || !storedHash) return false;

  const derivedKey = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(storedHash, 'hex');
  return expected.length === derivedKey.length && timingSafeEqual(expected, derivedKey);
};
