import {
  quoteRequestedSchema,
  quoteCapturedSchema,
  quoteStatusUpdatedSchema,
  eventEnvelopeSchema
} from '../events';

describe('integrations - event schemas', () => {
  const envelope = {
    version: 1,
    id: 'evt_01H8XK3M9ZQ4W7V2T6Y5B8N1',
    timestamp: '2026-09-21T14:30:00.000Z'
  };

  describe('quote.requested', () => {
    it('accepts a valid payload', () => {
      const result = quoteRequestedSchema.safeParse({
        event: 'quote.requested',
        ...envelope,
        data: {
          client: { phone: '573001112233', name: 'María Pérez' },
          conversationId: 'conv-uuid',
          message: 'Quiero cotizar una mudanza de Bogotá a Medellín'
        }
      });
      expect(result.success).toBe(true);
    });

    it('rejects a payload without message', () => {
      const result = quoteRequestedSchema.safeParse({
        event: 'quote.requested',
        ...envelope,
        data: {
          client: { phone: '573001112233' },
          conversationId: 'conv-uuid',
          message: ''
        }
      });
      expect(result.success).toBe(false);
    });
  });

  describe('quote.captured', () => {
    it('accepts a valid payload with decimal volume', () => {
      const result = quoteCapturedSchema.safeParse({
        event: 'quote.captured',
        ...envelope,
        data: {
          client: { phone: '573001112233', name: null },
          conversationId: 'conv-uuid',
          quote: { origin: 'Bogotá', destination: 'Medellín', volumeM3: 12.5 }
        }
      });
      expect(result.success).toBe(true);
    });

    it('accepts a payload without volume', () => {
      const result = quoteCapturedSchema.safeParse({
        event: 'quote.captured',
        ...envelope,
        data: {
          client: { phone: '573001112233' },
          conversationId: 'conv-uuid',
          quote: { origin: 'Bogotá', destination: 'Medellín' }
        }
      });
      expect(result.success).toBe(true);
    });

    it('rejects negative volume', () => {
      const result = quoteCapturedSchema.safeParse({
        event: 'quote.captured',
        ...envelope,
        data: {
          client: { phone: '573001112233' },
          conversationId: 'conv-uuid',
          quote: { origin: 'Bogotá', destination: 'Medellín', volumeM3: -1 }
        }
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing origin', () => {
      const result = quoteCapturedSchema.safeParse({
        event: 'quote.captured',
        ...envelope,
        data: {
          client: { phone: '573001112233' },
          conversationId: 'conv-uuid',
          quote: { origin: '', destination: 'Medellín', volumeM3: 5 }
        }
      });
      expect(result.success).toBe(false);
    });
  });

  describe('quote.status.updated', () => {
    it('accepts ACCEPTED with price', () => {
      const result = quoteStatusUpdatedSchema.safeParse({
        event: 'quote.status.updated',
        ...envelope,
        data: {
          conversationId: 'conv-uuid',
          quoteExternalId: 'qz-123',
          status: 'ACCEPTED',
          price: 850000
        }
      });
      expect(result.success).toBe(true);
    });

    it('accepts REJECTED without price (price only guaranteed on ACCEPTED)', () => {
      const result = quoteStatusUpdatedSchema.safeParse({
        event: 'quote.status.updated',
        ...envelope,
        data: {
          conversationId: 'conv-uuid',
          quoteExternalId: 'qz-123',
          status: 'REJECTED'
        }
      });
      expect(result.success).toBe(true);
    });

    it('rejects an unknown status', () => {
      const result = quoteStatusUpdatedSchema.safeParse({
        event: 'quote.status.updated',
        ...envelope,
        data: {
          conversationId: 'conv-uuid',
          quoteExternalId: 'qz-123',
          status: 'CANCELLED'
        }
      });
      expect(result.success).toBe(false);
    });
  });

  describe('eventEnvelopeSchema', () => {
    it('accepts a minimal envelope', () => {
      const result = eventEnvelopeSchema.safeParse({
        event: 'unknown.future.event',
        version: 2,
        id: 'evt_x',
        timestamp: '2026-09-24T00:00:00.000Z'
      });
      expect(result.success).toBe(true);
    });

    it('rejects a missing id', () => {
      const result = eventEnvelopeSchema.safeParse({
        event: 'quote.status.updated',
        version: 1,
        timestamp: '2026-09-24T00:00:00.000Z'
      });
      expect(result.success).toBe(false);
    });
  });
});
