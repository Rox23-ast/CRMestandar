import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { processIncomingMessage } from '../services/conversationFlow';

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
export const receiveMessage = async (req: Request, res: Response) => {
  // WhatsApp requiere que respondamos con 200 OK rápidamente para no reintentar
  res.sendStatus(200);

  try {
    const body = req.body;

    // Verificar si es un evento de mensaje de WhatsApp válido
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.value && change.value.messages && change.value.messages[0]) {
            const message = change.value.messages[0];
            const from = message.from; // Número de teléfono del remitente
            
            // Si es un mensaje de texto
            if (message.type === 'text') {
              const text = message.text.body;
              console.log(`Mensaje recibido de ${from}: ${text}`);

              // Delegar la lógica de conversación y estado al motor de flujos
              await processIncomingMessage(from, text);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error al procesar el mensaje de WhatsApp:', error);
  }
};
