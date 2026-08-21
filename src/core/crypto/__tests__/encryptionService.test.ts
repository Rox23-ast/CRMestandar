import { encrypt, decrypt } from '../encryptionService';

const originalEnv = process.env.CREDENTIALS_ENCRYPTION_KEY;

beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = 'a'.repeat(64);
});

afterAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = originalEnv;
});

describe('encryptionService', () => {
  it('should encrypt and decrypt a string correctly', () => {
    const plainText = 'test-secret-value-123';
    const { data, iv, tag } = encrypt(plainText);
    const decrypted = decrypt(data, iv, tag);
    expect(decrypted).toBe(plainText);
  });

  it('should produce different ciphertext for same plaintext', () => {
    const plainText = 'test-secret-value-123';
    const result1 = encrypt(plainText);
    const result2 = encrypt(plainText);
    expect(result1.data).not.toBe(result2.data);
    expect(result1.iv).not.toBe(result2.iv);
    expect(result1.tag).not.toBe(result2.tag);
  });

  it('should throw if key is not configured', () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    expect(() => encrypt('test')).toThrow('CREDENTIALS_ENCRYPTION_KEY is not configured');
    process.env.CREDENTIALS_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('should throw if key is wrong length', () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = 'short';
    expect(() => encrypt('test')).toThrow('CREDENTIALS_ENCRYPTION_KEY must be 64 hex characters');
    process.env.CREDENTIALS_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('should handle empty string', () => {
    const { data, iv, tag } = encrypt('');
    const decrypted = decrypt(data, iv, tag);
    expect(decrypted).toBe('');
  });

  it('should handle special characters', () => {
    const plainText = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const { data, iv, tag } = encrypt(plainText);
    const decrypted = decrypt(data, iv, tag);
    expect(decrypted).toBe(plainText);
  });

  it('should handle unicode characters', () => {
    const plainText = '测试密钥🔑clé-secreta-ключ';
    const { data, iv, tag } = encrypt(plainText);
    const decrypted = decrypt(data, iv, tag);
    expect(decrypted).toBe(plainText);
  });

  it('should fail to decrypt with wrong tag', () => {
    const { data, iv, tag } = encrypt('test');
    const wrongTag = Buffer.from(tag, 'base64');
    wrongTag[0] ^= 1;
    expect(() => decrypt(data, iv, wrongTag.toString('base64'))).toThrow();
  });

  it('should fail to decrypt with wrong iv', () => {
    const { data, iv, tag } = encrypt('test');
    const wrongIv = Buffer.from(iv, 'base64');
    wrongIv[0] ^= 1;
    expect(() => decrypt(data, wrongIv.toString('base64'), tag)).toThrow();
  });

  it('should fail to decrypt with wrong key', () => {
    const { data, iv, tag } = encrypt('test');
    const originalKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
    process.env.CREDENTIALS_ENCRYPTION_KEY = 'b'.repeat(64);
    expect(() => decrypt(data, iv, tag)).toThrow();
    process.env.CREDENTIALS_ENCRYPTION_KEY = originalKey;
  });
});