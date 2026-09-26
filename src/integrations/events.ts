import { z } from 'zod';

// Contract schemas for the cotizador integration (docs/integracion-cotizador.md §2.3/§2.4).

const eventEnvelope = {
  version: z.literal(1),
  id: z.string().uuid(),
  timestamp: z.string().min(1).max(40),
};

const clientSchema = z.object({
  phone: z.string().min(1).max(50),
  name: z.string().max(200),
});

export const quoteRequestedSchema = z.object({
  event: z.literal('quote.requested'),
  ...eventEnvelope,
  data: z.object({
    client: clientSchema,
    conversationId: z.string().uuid(),
    message: z.string().min(1).max(4000),
  }),
});

export const quoteCapturedSchema = z.object({
  event: z.literal('quote.captured'),
  ...eventEnvelope,
  data: z.object({
    client: clientSchema,
    conversationId: z.string().uuid(),
    quote: z.object({
      origin: z.string().min(1).max(300),
      destination: z.string().min(1).max(300),
      // Volume in cubic meters, max 2 decimal places (rounded by the emitter).
      volumeM3: z.number().nonnegative().max(100000).optional(),
    }),
  }),
});

export const quoteStatusUpdatedSchema = z.object({
  event: z.literal('quote.status.updated'),
  ...eventEnvelope,
  data: z.object({
    conversationId: z.string().min(1).max(100),
    quoteExternalId: z.string().min(1).max(100),
    status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
    // Price is only guaranteed on ACCEPTED; other statuses may omit it.
    price: z.number().nonnegative().nullable().optional(),
  }),
});

// Minimal envelope used by the inbound endpoint to acknowledge unknown event
// types with 200 before validating their specific payload.
export const eventEnvelopeSchema = z.object({
  event: z.string().min(1).max(100),
  version: z.number(),
  id: z.string().min(1).max(100),
  timestamp: z.string().min(1).max(40),
});

export type QuoteRequestedEvent = z.infer<typeof quoteRequestedSchema>;
export type QuoteCapturedEvent = z.infer<typeof quoteCapturedSchema>;
export type QuoteStatusUpdatedEvent = z.infer<typeof quoteStatusUpdatedSchema>;
export type OutboundEvent = QuoteRequestedEvent | QuoteCapturedEvent;
