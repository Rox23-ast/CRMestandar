import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { processIncomingMessage } from '../services/conversationFlow';
import { getRawCredentials } from '../../crm/services/credentialService';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

const isValidMetaSignature = async (req: RawBodyRequest) => {
  const appSecret = (await getRawCredentials()).WA_APP_SECRET;
  const signature = req.header('x-hub-signature-256');
  if (!appSecret || !signature || !req.rawBody) return false;

  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex')}`;
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
};

const webhookMessageSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  type: z.string().min(1),
  text: z.object({ body: z.string() }).optional(),
  image: z.object({ id: z.string().min(1) }).optional(),
  document: z.object({ id: z.string().min(1), caption: z.string().optional() }).optional()
}).passthrough();

const webhookBodySchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(z.object({
    changes: z.array(z.object({
      value: z.object({ messages: z.array(webhookMessageSchema).optional() }).passthrough()
    }).passthrough())
  }).passthrough())
}).passthrough();

/**
 * GET /api/bot/webhook
 * Used by Meta/WhatsApp to verify the configured webhook.
 */
export const verifyWebhook = async (req: Request, res: Response) => {
  const verifyToken = (await getRawCredentials()).WA_VERIFY_TOKEN;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook verified successfully!');
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
  
  return res.sendStatus(400);
};

/**
 * POST /api/bot/webhook
 * Receives messages sent by users through WhatsApp.
 */
export const receiveMessage = async (req: RawBodyRequest, res: Response) => {
  if (!(await isValidMetaSignature(req))) return res.sendStatus(401);

  // WhatsApp requires a quick 200 response to avoid retries.
  res.sendStatus(200);

  try {
    const parsedBody = webhookBodySchema.safeParse(req.body);
    if (!parsedBody.success) return;
    const body = parsedBody.data;

    // Verificar si es un evento de mensaje de WhatsApp válido
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.value?.messages) {
            for (const message of change.value.messages) {
            const from = message.from;
            const type = message.type === 'text'
              ? 'TEXT'
              : message.type === 'image'
                ? 'IMAGE'
                : message.type === 'document'
                  ? 'DOCUMENT'
                  : 'UNSUPPORTED';
            const text = message.type === 'text'
              ? message.text?.body
              : message.type === 'document'
                ? message.document?.caption
                : undefined;
            const mediaId = message.image?.id ?? message.document?.id;

            console.log(`WhatsApp message received from ${from}: ${text ?? type}`);
            await processIncomingMessage(from, text, message.id, type, mediaId);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error processing WhatsApp message:', error);
  }
};
