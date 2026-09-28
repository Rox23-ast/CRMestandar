import {
  quoteRequestedSchema,
  quoteCapturedSchema,
  quoteStatusUpdatedSchema,
  quoteCreatedSchema,
  quoteEstimatedSchema,
  eventEnvelopeSchema
} from '../events';

describe('integrations - event schemas', () => {
  const envelope = {
    version: 1,
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    timestamp: '2026-09-21T14:30:00.000Z'
  };

  describe('quote.requested', () => {
    it('accepts a valid payload', () => {
      const result = quoteRequestedSchema.safeParse({
        event: 'quote.requested',
        ...envelope,
        data: {
          client: { phone: '573001112233', name: 'María Pérez' },
          conversationId: '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60',
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
          client: { phone: '573001112233', name: '' },
          conversationId: '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60',
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
          client: { phone: '573001112233', name: '' },
          conversationId: '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60',
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
          client: { phone: '573001112233', name: '' },
          conversationId: '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60',
          quote: { origin: 'Bogotá', destination: 'Medellín' }
        }
      });
      expect(result.success).toBe(true);
    });

    it('rejects a null client name (empty string is the contract for unknown names)', () => {
      const result = quoteCapturedSchema.safeParse({
        event: 'quote.captured',
        ...envelope,
        data: {
          client: { phone: '573001112233', name: null },
          conversationId: '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60',
          quote: { origin: 'Bogotá', destination: 'Medellín', volumeM3: 12.5 }
        }
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative volume', () => {
      const result = quoteCapturedSchema.safeParse({
        event: 'quote.captured',
        ...envelope,
        data: {
          client: { phone: '573001112233', name: '' },
          conversationId: '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60',
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
          client: { phone: '573001112233', name: '' },
          conversationId: '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60',
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
          conversationId: '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60',
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
          conversationId: '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60',
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
          conversationId: '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60',
          quoteExternalId: 'qz-123',
          status: 'CANCELLED'
        }
      });
      expect(result.success).toBe(false);
    });

    it('accepts a web-born update without conversationId but with client data', () => {
      const result = quoteStatusUpdatedSchema.safeParse({
        event: 'quote.status.updated',
        ...envelope,
        data: {
          conversationId: null,
          quoteExternalId: 'qz-web-1',
          status: 'ACCEPTED',
          price: 950000,
          client: { phone: '573001112233', name: 'Ana Web' }
        }
      });
      expect(result.success).toBe(true);
    });

    it('rejects a non-UUID conversationId when present', () => {
      const result = quoteStatusUpdatedSchema.safeParse({
        event: 'quote.status.updated',
        ...envelope,
        data: {
          conversationId: 'conv-1',
          quoteExternalId: 'qz-123',
          status: 'PENDING'
        }
      });
      expect(result.success).toBe(false);
    });
  });

  describe('quote.created', () => {
    it('accepts a valid web quote payload', () => {
      const result = quoteCreatedSchema.safeParse({
        event: 'quote.created',
        ...envelope,
        data: {
          quoteExternalId: 'q_abc123',
          client: { phone: '573001112233', name: 'Ana Web' },
          quote: { origin: 'Bogotá', destination: 'Medellín', volumeM3: 12.5, price: 850000 },
          status: 'PENDING',
          createdAt: '2026-09-26T21:00:00.000Z'
        }
      });
      expect(result.success).toBe(true);
    });

    it('accepts the minimal payload (no quote block, no status)', () => {
      const result = quoteCreatedSchema.safeParse({
        event: 'quote.created',
        ...envelope,
        data: {
          quoteExternalId: 'q_abc123',
          client: { phone: '573001112233', name: '' }
        }
      });
      expect(result.success).toBe(true);
    });

    it('rejects an unknown status', () => {
      const result = quoteCreatedSchema.safeParse({
        event: 'quote.created',
        ...envelope,
        data: {
          quoteExternalId: 'q_abc123',
          client: { phone: '573001112233', name: 'Ana' },
          status: 'SOLD'
        }
      });
      expect(result.success).toBe(false);
    });
  });

  describe('quote.estimated', () => {
    it('accepts a valid estimate payload for a bot quote', () => {
      const result = quoteEstimatedSchema.safeParse({
        event: 'quote.estimated',
        ...envelope,
        data: {
          quoteExternalId: 'qz-123',
          conversationId: '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60',
          client: { phone: '573001112233', name: 'María' },
          price: 850000,
          pdfUrl: 'https://cotizador.chicologistica.com/files/qz-123.pdf'
        }
      });
      expect(result.success).toBe(true);
    });

    it('accepts a web estimate without conversationId', () => {
      const result = quoteEstimatedSchema.safeParse({
        event: 'quote.estimated',
        ...envelope,
        data: {
          quoteExternalId: 'qz-web-1',
          price: 850000,
          pdfUrl: 'https://cotizador.chicologistica.com/files/qz-web-1.pdf'
        }
      });
      expect(result.success).toBe(true);
    });

    it('rejects a non-URL pdfUrl', () => {
      const result = quoteEstimatedSchema.safeParse({
        event: 'quote.estimated',
        ...envelope,
        data: {
          quoteExternalId: 'qz-123',
          pdfUrl: 'archivo.pdf'
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
