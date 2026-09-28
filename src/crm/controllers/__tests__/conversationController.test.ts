import { statusSchema } from '../conversationController';

jest.mock('../../../core/database/prisma', () => ({ prisma: {} }));

describe('conversationController - statusSchema', () => {
  it('accepts a businessStatus-only update (panel dropdown)', () => {
    const result = statusSchema.safeParse({ businessStatus: 'EN_PROCESO' });
    expect(result.success).toBe(true);
  });

  it('accepts a full status update', () => {
    const result = statusSchema.safeParse({
      status: 'HUMAN_ACTIVE',
      priority: 'HIGH',
      businessStatus: 'PENDIENTE_COTIZACION'
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown conversation status', () => {
    const result = statusSchema.safeParse({ status: 'NOPE' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty payload', () => {
    const result = statusSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
