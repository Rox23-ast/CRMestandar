import { prisma } from '../../core/database/prisma';
import {
  recordInboundMessage,
  recordOutboundMessage
} from '../../crm/services/conversationService';
import { createNotification } from '../../crm/services/notificationService';
import { sendWhatsAppMessage } from './whatsappService';
import { processMessageWithAI } from './aiService';
import { emitQuoteRequested, emitQuoteCaptured } from '../../integrations/webhookClient';

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

// Extracts a volume in cubic meters from free text ("12,5 m3" -> 12.5).
// Rounded to 2 decimal places per the integration contract.
const parseVolume = (text?: string): number | null => {
  if (!text) return null;
  const match = text.replace(',', '.').match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Math.round(Number(match[0]) * 100) / 100;
  return Number.isFinite(value) && value >= 0 ? value : null;
};

// A quick-response rule counts as quote capture when its title/keywords are
// quote-related (e.g. the "Captura de datos" rule: cotizar, mudanza, traslado).
const QUOTE_RULE_PATTERN = /cotiza|mudanza|traslad|captura/i;

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
        await prisma.client.update({
          where: { phone: fromPhone },
          data: {
            botStep: 'QUOTE_DESTINATION',
            quoteOrigin: text?.trim() || client.quoteOrigin
          }
        });
        return;
      case 'QUOTE_DESTINATION':
        await sendAndRecordBotMessage(
          conversation.id,
          fromPhone,
          'Perfecto. Finalmente, descríbeme el volumen de la mudanza.'
        );
        await prisma.client.update({
          where: { phone: fromPhone },
          data: {
            botStep: 'QUOTE_VOLUME',
            quoteDestination: text?.trim() || client.quoteDestination
          }
        });
        return;
      case 'QUOTE_VOLUME': {
        const volume = parseVolume(text);
        await sendAndRecordBotMessage(
          conversation.id,
          fromPhone,
          '¡Gracias! He registrado tus datos. Un agente se pondrá en contacto contigo para continuar.'
        );
        await prisma.client.update({
          where: { phone: fromPhone },
          data: {
            botStep: 'AGENT_HANDOFF',
            quoteVolume: volume ?? client.quoteVolume
          }
        });

        // Persist the local mirror Quote and notify the cotizador.
        if (client.quoteOrigin && client.quoteDestination) {
          const finalVolume = volume ?? client.quoteVolume;
          const quote = await prisma.quote.create({
            data: {
              clientId: client.id,
              conversationId: conversation.id,
              origin: client.quoteOrigin,
              destination: client.quoteDestination,
              volume: finalVolume ?? undefined,
              status: 'PENDING'
            }
          });
          console.log(`[Cotizador] Local quote ${quote.id} persisted for conversation ${conversation.id}`);
          await emitQuoteCaptured({
            client: { phone: client.phone, name: client.name },
            conversationId: conversation.id,
            quote: {
              origin: quote.origin,
              destination: quote.destination,
              ...(quote.volume !== null ? { volumeM3: quote.volume } : {})
            }
          });
        } else {
          console.warn(
            `[Cotizador] Capture incomplete (origin=${client.quoteOrigin}, destination=${client.quoteDestination}); quote.captured skipped`
          );
        }

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
      }
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
    const matchedRule = findQuickResponseRule(text, parsedRules);
    if (matchedRule) {
      const ruleResponse = buildRuleResponse(matchedRule, client.name);
      await sendAndRecordBotMessage(conversation.id, fromPhone, ruleResponse);
      if (isQuoteCaptureRule(matchedRule)) {
        await emitQuoteRequested({
          client: { phone: client.phone, name: client.name },
          conversationId: conversation.id,
          message: text
        });
      }
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
    if (aiResponse.intent === 'QUOTE') {
      await emitQuoteRequested({
        client: { phone: client.phone, name: client.name },
        conversationId: conversation.id,
        message: text
      });
    }
  } catch (error) {
    console.error('Error en el flujo de conversación:', error);
  }
};

interface QuickResponseRule {
  id?: string;
  title?: string;
  keywords?: string;
  response?: string;
}

const findQuickResponseRule = (text: string, rules: QuickResponseRule[]): QuickResponseRule | undefined => {
  const normalized = text.toLowerCase();
  return rules.find((r) => {
    if (!r.keywords || !r.response) return false;
    const keywords = r.keywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    return keywords.some((k) => normalized.includes(k));
  });
};

const buildRuleResponse = (rule: QuickResponseRule, clientName?: string | null): string =>
  (rule.response ?? '').replace(/\[Nombre\]/g, clientName || '').trim();

const isQuoteCaptureRule = (rule: QuickResponseRule): boolean =>
  QUOTE_RULE_PATTERN.test(rule.title ?? '') || QUOTE_RULE_PATTERN.test(rule.keywords ?? '');

const updateClientStep = async (phone: string, step: string) => {
  await prisma.client.update({ where: { phone }, data: { botStep: step } });
};
