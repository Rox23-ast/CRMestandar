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
  audio: z.object({ id: z.string().min(1) }).optional(),
  video: z.object({ id: z.string().min(1), caption: z.string().optional() }).optional(),
  document: z.object({ id: z.string().min(1), caption: z.string().optional() }).optional(),
  sticker: z.object({ id: z.string().min(1) }).optional(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    name: z.string().optional(),
    address: z.string().optional()
  }).optional(),
  contacts: z.array(z.object({
    name: z.object({ formatted_name: z.string() }).passthrough()
  }).passthrough()).optional(),
  // Present when the chat was initiated from a Meta ad (Click-to-WhatsApp):
  // context.from is the ad id and context.referral carries the ctwa payload.
  context: z.object({
    from: z.string().optional(),
    id: z.string().optional(),
    referral: z.object({
      source_type: z.string().optional(),
      source_id: z.string().optional(),
      ctwa_clid: z.string().optional()
    }).passthrough().optional()
  }).passthrough().optional()
}).passthrough();

export type InboundWhatsAppMessage = z.infer<typeof webhookMessageSchema>;

/**
 * Mapea un mensaje entrante de WhatsApp a { type, text, mediaId }.
 * Cubre todos los tipos básicos de la Cloud API; los no soportados
 * (interactive, button, reaction, system) quedan como UNSUPPORTED.
 */
export const parseInboundMessage = (
  message: InboundWhatsAppMessage
): { type: string; text?: string; mediaId?: string; adsContext?: { from?: string; referral?: Record<string, unknown> } } => {
  let type = 'UNSUPPORTED';
  let text: string | undefined;
  let mediaId: string | undefined;

  switch (message.type) {
    case 'text':
      type = 'TEXT';
      text = message.text?.body;
      break;
    case 'image':
      type = 'IMAGE';
      mediaId = message.image?.id;
      break;
    case 'audio':
      type = 'AUDIO';
      mediaId = message.audio?.id;
      break;
    case 'video':
      type = 'VIDEO';
      mediaId = message.video?.id;
      text = message.video?.caption;
      break;
    case 'document':
      type = 'DOCUMENT';
      mediaId = message.document?.id;
      text = message.document?.caption;
      break;
    case 'sticker':
      type = 'STICKER';
      mediaId = message.sticker?.id;
      break;
    case 'location': {
      type = 'LOCATION';
      const location = message.location;
      if (location) {
        const place = [location.name, location.address].filter(Boolean).join(', ');
        text = place
          ? `Ubicación: ${place} (${location.latitude}, ${location.longitude})`
          : `Ubicación: ${location.latitude}, ${location.longitude}`;
      } else {
        text = 'Ubicación compartida';
      }
      break;
    }
    case 'contacts': {
      type = 'CONTACTS';
      const names = (message.contacts ?? [])
        .map((contact) => contact.name?.formatted_name)
        .filter(Boolean);
      text = names.length > 0 ? `Contacto: ${names.join(', ')}` : 'Contacto compartido';
      break;
    }
    default:
      break;
  }

  const adsContext = message.context?.from || message.context?.referral
    ? { from: message.context.from, referral: message.context.referral }
    : undefined;

  return { type, text, mediaId, adsContext };
};

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
            const parsed = parseInboundMessage(message);

            console.log(`WhatsApp message received from ${from}: ${parsed.text ?? parsed.type}${parsed.adsContext ? ' [ADS]' : ''}`);
            await processIncomingMessage(from, parsed.text, message.id, parsed.type, parsed.mediaId, parsed.adsContext);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error processing WhatsApp message:', error);
  }
};
