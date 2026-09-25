import { signPayload, verifySignature } from '../signature';

describe('integrations - signature', () => {
  const secret = 'a'.repeat(64);
  const otherSecret = 'b'.repeat(64);
  const body = Buffer.from(JSON.stringify({ event: 'quote.status.updated' }));

  it('verifies a valid signature', () => {
    const header = signPayload(body, secret);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifySignature(header, body, secret)).toBe(true);
  });

  it('accepts a timestamp within the 5 minute window', () => {
    const past = Math.floor(Date.now() / 1000) - 299;
    const header = signPayload(body, secret, past);
    expect(verifySignature(header, body, secret)).toBe(true);
  });

  it('rejects an expired timestamp (> 5 minutes)', () => {
    const past = Math.floor(Date.now() / 1000) - 301;
    const header = signPayload(body, secret, past);
    expect(verifySignature(header, body, secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const header = signPayload(body, secret);
    const tampered = Buffer.from(JSON.stringify({ event: 'quote.captured' }));
    expect(verifySignature(header, tampered, secret)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const header = signPayload(body, secret);
    expect(verifySignature(header, body, otherSecret)).toBe(false);
  });

  it('rejects malformed or missing inputs', () => {
    const valid = signPayload(body, secret);
    expect(verifySignature('garbage', body, secret)).toBe(false);
    expect(verifySignature('t=abc,v1=xyz', body, secret)).toBe(false);
    expect(verifySignature('t=123', body, secret)).toBe(false);
    expect(verifySignature(undefined, body, secret)).toBe(false);
    expect(verifySignature(valid, undefined, secret)).toBe(false);
    expect(verifySignature(valid, body, undefined)).toBe(false);
    expect(verifySignature(valid, body, '')).toBe(false);
  });

  it('rejects a truncated v1 value', () => {
    const header = signPayload(body, secret);
    const truncated = header.slice(0, header.length - 10);
    expect(verifySignature(truncated, body, secret)).toBe(false);
  });
});
