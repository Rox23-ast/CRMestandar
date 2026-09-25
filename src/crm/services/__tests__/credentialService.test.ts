import { prisma } from '../../../core/database/prisma';
import { getCredentials, getRawCredentials, saveCredentials, seedFromEnv } from '../credentialService';
import { encrypt, decrypt } from '../../../core/crypto/encryptionService';

const originalEnv = { ...process.env };

beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.WA_API_TOKEN = 'test_wa_token';
  process.env.WA_VERIFY_TOKEN = 'test_verify_token';
  process.env.WA_PHONE_NUMBER_ID = 'test_phone_id';
  process.env.WA_APP_SECRET = 'test_app_secret';
  process.env.OPENAI_API_KEY = 'sk-test_openai_key';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test_key';
  process.env.GEMINI_API_KEY = 'AIza-test_key';
  process.env.CRM_WEBHOOK_URL = 'https://cotizador.example/api/webhooks/mudanzas-chico';
  process.env.CRM_WEBHOOK_SECRET = 'b'.repeat(64);
});

afterAll(() => {
  process.env = originalEnv;
});

afterAll(async () => {
  await prisma.storedCredential.deleteMany();
});

beforeEach(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = 'a'.repeat(64);
});

beforeEach(async () => {
  await prisma.storedCredential.deleteMany();
});

describe('credentialService', () => {
  describe('getCredentials', () => {
    it('should return masked values when no credentials stored', async () => {
      const creds = await getCredentials();
      // maskValue shows first 4 + stars + last 4
      expect(creds.WA_API_TOKEN).toBe('test*****oken');           // test_wa_token (13 chars)
      expect(creds.WA_VERIFY_TOKEN).toBe('test*********oken');    // test_verify_token (17 chars)
      expect(creds.WA_PHONE_NUMBER_ID).toBe('test*****e_id');    // test_phone_id (13 chars)
      expect(creds.WA_APP_SECRET).toBe('test*******cret');        // test_app_secret (15 chars)
      expect(creds.OPENAI_API_KEY).toBe('sk-t**********_key');    // sk-test_openai_key (18 chars)
      expect(creds.ANTHROPIC_API_KEY).toBe('sk-a*******_key');    // sk-ant-test_key (15 chars)
      expect(creds.GEMINI_API_KEY).toBe('AIza*****_key');         // AIza-test_key (13 chars)
      expect(creds.CRM_WEBHOOK_URL).toBe('http' + '*'.repeat(45) + 'hico');
      expect(creds.CRM_WEBHOOK_SECRET).toBe('bbbb' + '*'.repeat(56) + 'bbbb'); // 64 chars
    });

    it('should return masked values from database when stored', async () => {
      const testCreds = {
        WA_API_TOKEN: 'stored_wa_token',
        WA_VERIFY_TOKEN: 'stored_verify_token',
        WA_PHONE_NUMBER_ID: '987654321',
        WA_APP_SECRET: 'stored_app_secret',
        OPENAI_API_KEY: 'sk-stored_openai_key',
        ANTHROPIC_API_KEY: 'sk-ant-stored_key',
        GEMINI_API_KEY: 'AIza-stored_key',
      };
      const plain = JSON.stringify(testCreds);
      const { data, iv, tag } = encrypt(plain);
      await prisma.storedCredential.create({ data: { id: 'default', data, iv, tag } });

      const creds = await getCredentials();
      expect(creds.WA_API_TOKEN).toBe('stor*******oken');         // stored_wa_token (15 chars)
      expect(creds.WA_VERIFY_TOKEN).toBe('stor***********oken');    // stored_verify_token (19 chars)
      expect(creds.WA_PHONE_NUMBER_ID).toBe('9876*4321');         // 987654321 (9 chars)
      expect(creds.WA_APP_SECRET).toBe('stor*********cret');        // stored_app_secret (17 chars)
      expect(creds.OPENAI_API_KEY).toBe('sk-s************_key');    // sk-stored_openai_key (20 chars)
      expect(creds.ANTHROPIC_API_KEY).toBe('sk-a*********_key');  // sk-ant-stored_key (17 chars)
      expect(creds.GEMINI_API_KEY).toBe('AIza*******_key');       // AIza-stored_key (15 chars)
    });
  });

  describe('getRawCredentials', () => {
    it('should return unmasked values from environment when no DB record', async () => {
      const creds = await getRawCredentials();
      expect(creds.WA_API_TOKEN).toBe('test_wa_token');
      expect(creds.WA_VERIFY_TOKEN).toBe('test_verify_token');
      expect(creds.WA_PHONE_NUMBER_ID).toBe('test_phone_id');
      expect(creds.WA_APP_SECRET).toBe('test_app_secret');
      expect(creds.OPENAI_API_KEY).toBe('sk-test_openai_key');
      expect(creds.ANTHROPIC_API_KEY).toBe('sk-ant-test_key');
      expect(creds.GEMINI_API_KEY).toBe('AIza-test_key');
      expect(creds.CRM_WEBHOOK_URL).toBe('https://cotizador.example/api/webhooks/mudanzas-chico');
      expect(creds.CRM_WEBHOOK_SECRET).toBe('b'.repeat(64));
    });

    it('should return unmasked values from database when stored', async () => {
      const testCreds = {
        WA_API_TOKEN: 'stored_wa_token',
        WA_VERIFY_TOKEN: 'stored_verify_token',
        WA_PHONE_NUMBER_ID: '987654321',
        WA_APP_SECRET: 'stored_app_secret',
        OPENAI_API_KEY: 'sk-stored_openai_key',
        ANTHROPIC_API_KEY: 'sk-ant-stored_key',
        GEMINI_API_KEY: 'AIza-stored_key',
        CRM_WEBHOOK_URL: 'https://cotizador.example/api/webhooks/mudanzas-chico',
        CRM_WEBHOOK_SECRET: 'c'.repeat(64),
      };
      const plain = JSON.stringify(testCreds);
      const { data, iv, tag } = encrypt(plain);
      await prisma.storedCredential.create({ data: { id: 'default', data, iv, tag } });

      const creds = await getRawCredentials();
      expect(creds).toEqual(testCreds);
    });

    it('should backfill missing webhook fields on legacy records', async () => {
      const legacyCreds = {
        WA_API_TOKEN: 'legacy_token',
        WA_VERIFY_TOKEN: 'legacy_verify',
        WA_PHONE_NUMBER_ID: '111',
        WA_APP_SECRET: 'legacy_secret',
        OPENAI_API_KEY: 'sk-legacy',
        ANTHROPIC_API_KEY: 'sk-ant-legacy',
        GEMINI_API_KEY: 'AIza-legacy',
      };
      const { data, iv, tag } = encrypt(JSON.stringify(legacyCreds));
      await prisma.storedCredential.create({ data: { id: 'default', data, iv, tag } });

      const creds = await getRawCredentials();
      expect(creds.WA_API_TOKEN).toBe('legacy_token');
      expect(creds.CRM_WEBHOOK_URL).toBe('');
      expect(creds.CRM_WEBHOOK_SECRET).toBe('');
    });
  });

  describe('saveCredentials', () => {
    it('should create new record if none exists', async () => {
      await saveCredentials({ WA_API_TOKEN: 'new_token' });
      
      const record = await prisma.storedCredential.findUnique({ where: { id: 'default' } });
      expect(record).not.toBeNull();
      
      const creds = await getRawCredentials();
      expect(creds.WA_API_TOKEN).toBe('new_token');
    });

    it('should update existing record', async () => {
      await saveCredentials({ WA_API_TOKEN: 'initial_token' });
      await saveCredentials({ WA_API_TOKEN: 'updated_token' });
      
      const creds = await getRawCredentials();
      expect(creds.WA_API_TOKEN).toBe('updated_token');
    });

    it('should merge partial updates with existing values', async () => {
      await saveCredentials({ 
        WA_API_TOKEN: 'token1',
        WA_VERIFY_TOKEN: 'verify1',
        WA_PHONE_NUMBER_ID: '111',
        WA_APP_SECRET: 'secret1',
        OPENAI_API_KEY: 'sk-key1',
        ANTHROPIC_API_KEY: 'sk-ant-key1',
        GEMINI_API_KEY: 'AIza-key1',
        CRM_WEBHOOK_URL: 'https://old.example/hook',
        CRM_WEBHOOK_SECRET: 'd'.repeat(64),
      });
      
      await saveCredentials({ WA_API_TOKEN: 'token2' });
      
      const creds = await getRawCredentials();
      expect(creds.WA_API_TOKEN).toBe('token2');
      expect(creds.WA_VERIFY_TOKEN).toBe('verify1');
      expect(creds.WA_PHONE_NUMBER_ID).toBe('111');
      expect(creds.WA_APP_SECRET).toBe('secret1');
      expect(creds.OPENAI_API_KEY).toBe('sk-key1');
      expect(creds.ANTHROPIC_API_KEY).toBe('sk-ant-key1');
      expect(creds.GEMINI_API_KEY).toBe('AIza-key1');
      expect(creds.CRM_WEBHOOK_URL).toBe('https://old.example/hook');
      expect(creds.CRM_WEBHOOK_SECRET).toBe('d'.repeat(64));
    });

    it('should save the cotizador webhook connection', async () => {
      await saveCredentials({
        CRM_WEBHOOK_URL: 'https://cotizador.example/api/webhooks/mudanzas-chico',
        CRM_WEBHOOK_SECRET: 'e'.repeat(64),
      });

      const creds = await getRawCredentials();
      expect(creds.CRM_WEBHOOK_URL).toBe('https://cotizador.example/api/webhooks/mudanzas-chico');
      expect(creds.CRM_WEBHOOK_SECRET).toBe('e'.repeat(64));

      const masked = await getCredentials();
      expect(masked.CRM_WEBHOOK_SECRET).toBe('eeee' + '*'.repeat(56) + 'eeee');
    });
  });

  describe('seedFromEnv', () => {
    it('should create record from env if table is empty', async () => {
      await seedFromEnv();
      
      const record = await prisma.storedCredential.findUnique({ where: { id: 'default' } });
      expect(record).not.toBeNull();
      
      const creds = await getRawCredentials();
      expect(creds.WA_API_TOKEN).toBe('test_wa_token');
      expect(creds.OPENAI_API_KEY).toBe('sk-test_openai_key');
    });

    it('should not overwrite existing record', async () => {
      await saveCredentials({ WA_API_TOKEN: 'existing_token' });
      await seedFromEnv();
      
      const creds = await getRawCredentials();
      expect(creds.WA_API_TOKEN).toBe('existing_token');
    });

    it('should not create record if env vars are empty', async () => {
      const emptyEnv = { ...process.env };
      delete emptyEnv.WA_API_TOKEN;
      delete emptyEnv.WA_VERIFY_TOKEN;
      delete emptyEnv.WA_PHONE_NUMBER_ID;
      delete emptyEnv.WA_APP_SECRET;
      delete emptyEnv.OPENAI_API_KEY;
      delete emptyEnv.ANTHROPIC_API_KEY;
      delete emptyEnv.GEMINI_API_KEY;
      delete emptyEnv.CRM_WEBHOOK_URL;
      delete emptyEnv.CRM_WEBHOOK_SECRET;
      
      // Reset DB
      await prisma.storedCredential.deleteMany();
      
      // Temporarily clear env
      process.env.WA_API_TOKEN = '';
      process.env.WA_VERIFY_TOKEN = '';
      process.env.WA_PHONE_NUMBER_ID = '';
      process.env.WA_APP_SECRET = '';
      process.env.OPENAI_API_KEY = '';
      process.env.ANTHROPIC_API_KEY = '';
      process.env.GEMINI_API_KEY = '';
      process.env.CRM_WEBHOOK_URL = '';
      process.env.CRM_WEBHOOK_SECRET = '';
      
      await seedFromEnv();
      
      const record = await prisma.storedCredential.findUnique({ where: { id: 'default' } });
      expect(record).toBeNull();
      
      // Restore env
      process.env = { ...originalEnv };
    });
  });

  describe('maskValue', () => {
    it('should mask short strings completely', async () => {
      // Test via getCredentials with short values
      await saveCredentials({ WA_API_TOKEN: 'abc' });
      const creds = await getCredentials();
      expect(creds.WA_API_TOKEN).toBe('***');
    });

    it('should show first 4 and last 4 chars for longer strings', async () => {
      await saveCredentials({ WA_API_TOKEN: '123456789012' });
      const creds = await getCredentials();
      expect(creds.WA_API_TOKEN).toBe('1234****9012');
    });
  });
});