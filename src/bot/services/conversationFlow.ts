import { prisma } from '../../core/database/prisma';
import {
  recordInboundMessage,
  recordOutboundMessage
} from '../../crm/services/conversationService';
import { createNotification } from '../../crm/services/notificationService';
import { sendWhatsAppMessage } from './whatsappService';
import { processMessageWithAI } from './aiService';

const sendAndRecordBotMessage = async (conversationId: string, phone: string, message: string) => {
  const sent = await sendWhatsAppMessage(phone, message);
  await recordOutboundMessage({
    conversationId,
    body: message,
    senderType: 'BOT',
    deliveryStatus: sent ? 'SENT' : 'FAILED'
  });
  return sent;
};

export const processIncomingMessage = async (
  fromPhone: string,
  text: string | undefined,
  externalId?: string,
  type = 'TEXT',
  mediaId?: string
) => {
  try {
    const inbound = await recordInboundMessage({
      phone: fromPhone,
      body: text,
      type,
      mediaId,
      externalId
    });

    if (inbound.duplicate || inbound.status === 'HUMAN_ACTIVE') return;

    const conversation = await prisma.conversation.findUnique({
      where: { id: inbound.conversationId },
      include: { client: true }
    });
    if (!conversation || conversation.status !== 'BOT_ACTIVE') return;

    const config = await prisma.botConfig.findFirst();
    const botConfig = config || {
      greetingMessage: '¡Hola! Soy el asistente virtual.',
      awayMessage: 'Estamos fuera de horario.',
      aiPersonalityPrompt: 'Eres un asistente.',
      limitations: '',
      customRules: '[]'
    };

    if (inbound.isNew) {
      const greeting = type === 'TEXT'
        ? botConfig.greetingMessage
        : 'Recibí tu archivo. Un agente de Mudanzas Chico lo revisará y te responderá pronto.';
      await sendAndRecordBotMessage(conversation.id, fromPhone, greeting);
      return;
    }

    if (type !== 'TEXT') {
      await sendAndRecordBotMessage(
        conversation.id,
        fromPhone,
        'Recibí tu archivo. Un agente de Mudanzas Chico lo revisará y te responderá pronto.'
      );
      return;
    }

    const client = conversation.client;
    switch (client.botStep) {
      case 'QUOTE_ORIGIN':
        await sendAndRecordBotMessage(
          conversation.id,
          fromPhone,
          'Excelente. Ahora dime, ¿cuál será la ciudad o dirección de destino?'
        );
        await updateClientStep(fromPhone, 'QUOTE_DESTINATION');
        return;
      case 'QUOTE_DESTINATION':
        await sendAndRecordBotMessage(
          conversation.id,
          fromPhone,
          'Perfecto. Finalmente, descríbeme el volumen de la mudanza.'
        );
        await updateClientStep(fromPhone, 'QUOTE_VOLUME');
        return;
      case 'QUOTE_VOLUME':
        await sendAndRecordBotMessage(
          conversation.id,
          fromPhone,
          '¡Gracias! He registrado tus datos. Un agente se pondrá en contacto contigo para continuar.'
        );
        await updateClientStep(fromPhone, 'AGENT_HANDOFF');
        if (conversation.assignedUserId) {
          await createNotification({
            userId: conversation.assignedUserId,
            conversationId: conversation.id,
            type: 'HUMAN_HANDOFF_REQUIRED',
            title: 'Cliente listo para seguimiento',
            body: 'El bot terminó la captura inicial y requiere atención humana.'
          });
        }
        return;
      case 'AGENT_HANDOFF':
        await sendAndRecordBotMessage(
          conversation.id,
          fromPhone,
          'Tu solicitud está lista para revisión. Un agente humano continuará el seguimiento por este medio.'
        );
        return;
      default:
        break;
    }

    if (!text) return;

    const parsedRules = JSON.parse(botConfig.customRules);
    const ruleResponse = matchQuickResponse(text, parsedRules, conversation.client?.name);
    if (ruleResponse) {
      await sendAndRecordBotMessage(conversation.id, fromPhone, ruleResponse);
      return;
    }

    const aiResponse = await processMessageWithAI(
      text,
      botConfig.aiPersonalityPrompt,
      botConfig.limitations,
      parsedRules
    );

    await updateClientStep(fromPhone, aiResponse.intent === 'QUOTE' ? 'QUOTE_ORIGIN' : 'CHAT');
    await sendAndRecordBotMessage(conversation.id, fromPhone, aiResponse.message);
  } catch (error) {
    console.error('Error en el flujo de conversación:', error);
  }
};

interface QuickResponseRule {
  keywords?: string;
  response?: string;
}

const matchQuickResponse = (text: string, rules: QuickResponseRule[], clientName?: string | null): string | undefined => {
  const normalized = text.toLowerCase();
  const rule = rules.find((r) => {
    if (!r.keywords || !r.response) return false;
    const keywords = r.keywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    return keywords.some((k) => normalized.includes(k));
  });
  if (!rule?.response) return undefined;
  return rule.response.replace(/\[Nombre\]/g, clientName || '').trim();
};

const updateClientStep = async (phone: string, step: string) => {
  await prisma.client.update({ where: { phone }, data: { botStep: step } });
};
