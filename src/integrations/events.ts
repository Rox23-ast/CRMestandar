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
    // Present only for bot-born quotes; web-born quotes omit it and are
    // resolved via quoteExternalId (+ client when the CRM must create the row).
    conversationId: z.string().uuid().nullable().optional(),
    quoteExternalId: z.string().min(1).max(100),
    status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
    // Price is only guaranteed on ACCEPTED; other statuses may omit it.
    price: z.number().nonnegative().nullable().optional(),
    // Optional during rollout: lets the CRM resolve quotes it has never seen
    // (late arrival) without relying on conversationId.
    client: clientSchema.optional(),
  }),
});

export const quoteCreatedSchema = z.object({
  event: z.literal('quote.created'),
  ...eventEnvelope,
  data: z.object({
    quoteExternalId: z.string().min(1).max(100),
    client: clientSchema,
    quote: z.object({
      origin: z.string().min(1).max(300).optional(),
      destination: z.string().min(1).max(300).optional(),
      // Volume in cubic meters, max 2 decimal places (rounded by the emitter).
      volumeM3: z.number().nonnegative().max(100000).optional(),
      price: z.number().nonnegative().nullable().optional(),
    }).optional(),
    status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']).optional(),
    createdAt: z.string().min(1).max(40).optional(),
  }),
});

export const quoteEstimatedSchema = z.object({
  event: z.literal('quote.estimated'),
  ...eventEnvelope,
  data: z.object({
    quoteExternalId: z.string().min(1).max(100),
    // Present only for bot-born quotes; web-born quotes omit it.
    conversationId: z.string().uuid().nullable().optional(),
    client: clientSchema.optional(),
    price: z.number().nonnegative().nullable().optional(),
    // Public URL Meta can fetch via plain GET; must end in .pdf.
    pdfUrl: z.string().url().max(500),
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
export type QuoteCreatedEvent = z.infer<typeof quoteCreatedSchema>;
export type QuoteEstimatedEvent = z.infer<typeof quoteEstimatedSchema>;
export type OutboundEvent = QuoteRequestedEvent | QuoteCapturedEvent;
