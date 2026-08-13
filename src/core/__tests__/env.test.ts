import { z } from 'zod';

// Basic environment schema validation to test that testing framework works
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('test'),
});

describe('Core - Environment Validation', () => {
  it('should validate correct environment variables', () => {
    const result = envSchema.safeParse({ NODE_ENV: 'test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('test');
    }
  });

  it('should fail on invalid environment variables', () => {
    const result = envSchema.safeParse({ NODE_ENV: 'invalid' });
    expect(result.success).toBe(false);
  });
});
