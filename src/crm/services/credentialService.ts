import { prisma } from '../../core/database/prisma';
import { encrypt, decrypt } from '../../core/crypto/encryptionService';

export interface ApiCredentials {
  WA_API_TOKEN: string;
  WA_VERIFY_TOKEN: string;
  WA_PHONE_NUMBER_ID: string;
  WA_APP_SECRET: string;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  GEMINI_API_KEY: string;
  CRM_WEBHOOK_URL: string;
  CRM_WEBHOOK_SECRET: string;
}

export interface MaskedCredentials {
  WA_API_TOKEN: string;
  WA_VERIFY_TOKEN: string;
  WA_PHONE_NUMBER_ID: string;
  WA_APP_SECRET: string;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  GEMINI_API_KEY: string;
  CRM_WEBHOOK_URL: string;
  CRM_WEBHOOK_SECRET: string;
}

function maskValue(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '*'.repeat(value.length);
  return value.slice(0, 4) + '*'.repeat(value.length - 8) + value.slice(-4);
}

function getEnvCredentials(): Partial<ApiCredentials> {
  return {
    WA_API_TOKEN: process.env.WA_API_TOKEN ?? '',
    WA_VERIFY_TOKEN: process.env.WA_VERIFY_TOKEN ?? '',
    WA_PHONE_NUMBER_ID: process.env.WA_PHONE_NUMBER_ID ?? '',
    WA_APP_SECRET: process.env.WA_APP_SECRET ?? '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
    CRM_WEBHOOK_URL: process.env.CRM_WEBHOOK_URL ?? '',
    CRM_WEBHOOK_SECRET: process.env.CRM_WEBHOOK_SECRET ?? '',
  };
}

export async function getCredentials(): Promise<MaskedCredentials> {
  const record = await prisma.storedCredential.findUnique({ where: { id: 'default' } });
  if (!record) {
    const envCreds = getEnvCredentials();
    return {
      WA_API_TOKEN: maskValue(envCreds.WA_API_TOKEN ?? ''),
      WA_VERIFY_TOKEN: maskValue(envCreds.WA_VERIFY_TOKEN ?? ''),
      WA_PHONE_NUMBER_ID: maskValue(envCreds.WA_PHONE_NUMBER_ID ?? ''),
      WA_APP_SECRET: maskValue(envCreds.WA_APP_SECRET ?? ''),
      OPENAI_API_KEY: maskValue(envCreds.OPENAI_API_KEY ?? ''),
      ANTHROPIC_API_KEY: maskValue(envCreds.ANTHROPIC_API_KEY ?? ''),
      GEMINI_API_KEY: maskValue(envCreds.GEMINI_API_KEY ?? ''),
      CRM_WEBHOOK_URL: maskValue(envCreds.CRM_WEBHOOK_URL ?? ''),
      CRM_WEBHOOK_SECRET: maskValue(envCreds.CRM_WEBHOOK_SECRET ?? ''),
    };
  }
  const plain = decrypt(record.data, record.iv, record.tag);
  const creds: Partial<ApiCredentials> = JSON.parse(plain);
  return {
    WA_API_TOKEN: maskValue(creds.WA_API_TOKEN ?? ''),
    WA_VERIFY_TOKEN: maskValue(creds.WA_VERIFY_TOKEN ?? ''),
    WA_PHONE_NUMBER_ID: maskValue(creds.WA_PHONE_NUMBER_ID ?? ''),
    WA_APP_SECRET: maskValue(creds.WA_APP_SECRET ?? ''),
    OPENAI_API_KEY: maskValue(creds.OPENAI_API_KEY ?? ''),
    ANTHROPIC_API_KEY: maskValue(creds.ANTHROPIC_API_KEY ?? ''),
    GEMINI_API_KEY: maskValue(creds.GEMINI_API_KEY ?? ''),
    CRM_WEBHOOK_URL: maskValue(creds.CRM_WEBHOOK_URL ?? ''),
    CRM_WEBHOOK_SECRET: maskValue(creds.CRM_WEBHOOK_SECRET ?? ''),
  };
}

export async function getRawCredentials(): Promise<ApiCredentials> {
  const record = await prisma.storedCredential.findUnique({ where: { id: 'default' } });
  if (!record) {
    const envCreds = getEnvCredentials();
    return {
      WA_API_TOKEN: envCreds.WA_API_TOKEN ?? '',
      WA_VERIFY_TOKEN: envCreds.WA_VERIFY_TOKEN ?? '',
      WA_PHONE_NUMBER_ID: envCreds.WA_PHONE_NUMBER_ID ?? '',
      WA_APP_SECRET: envCreds.WA_APP_SECRET ?? '',
      OPENAI_API_KEY: envCreds.OPENAI_API_KEY ?? '',
      ANTHROPIC_API_KEY: envCreds.ANTHROPIC_API_KEY ?? '',
      GEMINI_API_KEY: envCreds.GEMINI_API_KEY ?? '',
      CRM_WEBHOOK_URL: envCreds.CRM_WEBHOOK_URL ?? '',
      CRM_WEBHOOK_SECRET: envCreds.CRM_WEBHOOK_SECRET ?? '',
    };
  }
  const plain = decrypt(record.data, record.iv, record.tag);
  const stored: Partial<ApiCredentials> = JSON.parse(plain);
  // Records created before the webhook fields existed stay backward compatible.
  return {
    WA_API_TOKEN: stored.WA_API_TOKEN ?? '',
    WA_VERIFY_TOKEN: stored.WA_VERIFY_TOKEN ?? '',
    WA_PHONE_NUMBER_ID: stored.WA_PHONE_NUMBER_ID ?? '',
    WA_APP_SECRET: stored.WA_APP_SECRET ?? '',
    OPENAI_API_KEY: stored.OPENAI_API_KEY ?? '',
    ANTHROPIC_API_KEY: stored.ANTHROPIC_API_KEY ?? '',
    GEMINI_API_KEY: stored.GEMINI_API_KEY ?? '',
    CRM_WEBHOOK_URL: stored.CRM_WEBHOOK_URL ?? '',
    CRM_WEBHOOK_SECRET: stored.CRM_WEBHOOK_SECRET ?? '',
  };
}

export async function saveCredentials(creds: Partial<ApiCredentials>): Promise<void> {
  const existing = await getRawCredentials();
  const merged: ApiCredentials = { ...existing, ...creds };
  const plain = JSON.stringify(merged);
  const { data, iv, tag } = encrypt(plain);
  await prisma.storedCredential.upsert({
    where: { id: 'default' },
    create: { id: 'default', data, iv, tag },
    update: { data, iv, tag },
  });
}

export async function seedFromEnv(): Promise<void> {
  const existing = await prisma.storedCredential.findUnique({ where: { id: 'default' } });
  if (existing) return;

  const envCreds = getEnvCredentials();
  const hasAnyValue = Object.values(envCreds).some((v) => v && v.length > 0);
  if (!hasAnyValue) return;

  const plain = JSON.stringify(envCreds);
  const { data, iv, tag } = encrypt(plain);
  await prisma.storedCredential.create({
    data: { id: 'default', data, iv, tag },
  });
}