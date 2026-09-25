import crypto from 'node:crypto';

// HMAC-SHA256 signing for cotizador webhooks.
// Header format: X-Mudanzas-Signature: t=<unix>,v1=<hex>
// v1 = HMAC_SHA256(secret, "v1:" + t + ":" + rawBody)

const SIGNATURE_TOLERANCE_SECONDS = 300; // 5 minutes anti-replay window

export const signPayload = (
  rawBody: string | Buffer,
  secret: string,
  timestampSeconds: number = Math.floor(Date.now() / 1000)
): string => {
  const v1 = crypto
    .createHmac('sha256', secret)
    .update(`v1:${timestampSeconds}:${rawBody}`)
    .digest('hex');
  return `t=${timestampSeconds},v1=${v1}`;
};

export const verifySignature = (
  header: string | undefined,
  rawBody: Buffer | undefined,
  secret: string | undefined
): boolean => {
  if (!header || !rawBody || !secret) return false;

  const parts: Record<string, string> = {};
  for (const chunk of header.split(',')) {
    const [key, value] = chunk.trim().split('=');
    if (key && value) parts[key] = value;
  }
  const { t, v1 } = parts;
  if (!t || !v1) return false;

  const timestamp = Number(t);
  if (!Number.isFinite(timestamp) || String(Math.trunc(timestamp)) !== t) return false;

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`v1:${t}:${rawBody}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(v1, 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};
