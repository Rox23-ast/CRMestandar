import crypto from 'node:crypto';
import { prisma } from '../core/database/prisma';
import { getRawCredentials } from '../crm/services/credentialService';
import { signPayload } from './signature';
import {
  quoteRequestedSchema,
  quoteCapturedSchema,
  OutboundEvent
} from './events';

// Outbound webhook client: signs events, delivers non-blocking with background
// retries (5s, 25s, 125s, 625s -> max 5 attempts) and audits every delivery
// attempt in the WebhookEvent table.

const RETRY_DELAYS_MS = [5_000, 25_000, 125_000, 625_000];
const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 10_000;

const newEventId = (): string =>
  crypto.randomUUID();

const postEvent = async (url: string, body: string, secret: string): Promise<void> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mudanzas-Signature': signPayload(body, secret)
      },
      body,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } finally {
    clearTimeout(timer);
  }
};

const runDelivery = async (
  eventId: string,
  url: string,
  body: string,
  secret: string,
  attempt: number
): Promise<void> => {
  try {
    await postEvent(url, body, secret);
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: { status: 'DELIVERED', attempts: attempt, lastAttemptAt: new Date(), lastError: null }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isLastAttempt = attempt >= MAX_ATTEMPTS;
    try {
      await prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          status: isLastAttempt ? 'FAILED' : 'PENDING',
          attempts: attempt,
          lastAttemptAt: new Date(),
          lastError: message
        }
      });
    } catch (dbError) {
      console.error('[Webhook] Failed to record delivery attempt:', dbError);
    }

    if (isLastAttempt) {
      console.error(`[Webhook] Event ${eventId} dropped after ${MAX_ATTEMPTS} attempts: ${message}`);
      return;
    }

    const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    setTimeout(() => {
      void runDelivery(eventId, url, body, secret, attempt + 1);
    }, delay);
  }
};

/**
 * Emits an outbound event. Never throws and never blocks the chat flow:
 * the HTTP delivery runs in the background with retries.
 */
export const emitEvent = async (event: OutboundEvent): Promise<void> => {
  try {
    const parsed = event.event === 'quote.requested'
      ? quoteRequestedSchema.safeParse(event)
      : quoteCapturedSchema.safeParse(event);
    if (!parsed.success) {
      console.error('[Webhook] Invalid outbound event payload:', parsed.error.flatten());
      return;
    }

    const creds = await getRawCredentials();
    const url = creds.CRM_WEBHOOK_URL?.trim();
    const secret = creds.CRM_WEBHOOK_SECRET?.trim();
    if (!url || !secret) {
      console.warn(`[Webhook] CRM_WEBHOOK_URL/CRM_WEBHOOK_SECRET not configured; event ${event.event} skipped`);
      return;
    }

    const body = JSON.stringify(event);
    const record = await prisma.webhookEvent.create({
      data: { id: event.id, direction: 'OUTBOUND', event: event.event, payload: body, status: 'PENDING' }
    });
    void runDelivery(record.id, url, body, secret, 1);
  } catch (error) {
    console.error('[Webhook] Error emitting outbound event:', error);
  }
};

export interface QuoteRequestedInput {
  client: { phone: string; name?: string | null };
  conversationId: string;
  message: string;
}

export const emitQuoteRequested = async (input: QuoteRequestedInput): Promise<void> => {
  await emitEvent({
    event: 'quote.requested',
    version: 1,
    id: newEventId(),
    timestamp: new Date().toISOString(),
    data: {
      client: { phone: input.client.phone, name: input.client.name ?? '' },
      conversationId: input.conversationId,
      message: input.message
    }
  });
};

export interface QuoteCapturedInput {
  client: { phone: string; name?: string | null };
  conversationId: string;
  quote: { origin: string; destination: string; volumeM3?: number };
}

export const emitQuoteCaptured = async (input: QuoteCapturedInput): Promise<void> => {
  await emitEvent({
    event: 'quote.captured',
    version: 1,
    id: newEventId(),
    timestamp: new Date().toISOString(),
    data: {
      client: { phone: input.client.phone, name: input.client.name ?? '' },
      conversationId: input.conversationId,
      quote: {
        origin: input.quote.origin,
        destination: input.quote.destination,
        ...(input.quote.volumeM3 !== undefined ? { volumeM3: input.quote.volumeM3 } : {})
      }
    }
  });
};
