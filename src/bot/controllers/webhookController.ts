import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { processIncomingMessage } from '../services/conversationFlow';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

const isValidMetaSignature = (req: RawBodyRequest) => {
  const appSecret = process.env.WA_APP_SECRET;
  const signature = req.header('x-hub-signature-256');
  if (!appSecret || !signature || !req.rawBody) return false;

  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex')}`;
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
};

/**
 * GET /api/bot/webhook
 * Utilizado por Meta/WhatsApp para verificar el webhook configurado
 */
export const verifyWebhook = (req: Request, res: Response) => {
  const verifyToken = process.env.WA_VERIFY_TOKEN;

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
 * Recibe los mensajes enviados por los usuarios a través de WhatsApp
 */
export const receiveMessage = async (req: RawBodyRequest, res: Response) => {
  if (!isValidMetaSignature(req)) return res.sendStatus(401);

  // WhatsApp requiere que respondamos con 200 OK rápidamente para no reintentar
  res.sendStatus(200);

  try {
    const body = req.body;

    // Verificar si es un evento de mensaje de WhatsApp válido
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.value?.messages) {
            for (const message of change.value.messages) {
            const from = message.from; // Número de teléfono del remitente
            const type = message.type === 'text'
              ? 'TEXT'
              : message.type === 'image'
                ? 'IMAGE'
                : message.type === 'document'
                  ? 'DOCUMENT'
                  : 'UNSUPPORTED';
            const text = message.type === 'text'
              ? message.text.body
              : message.type === 'document'
                ? message.document?.caption
                : undefined;
            const mediaId = message.image?.id ?? message.document?.id;

            console.log(`Mensaje recibido de ${from}: ${text ?? type}`);
            await processIncomingMessage(from, text, message.id, type, mediaId);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error al procesar el mensaje de WhatsApp:', error);
  }
};
