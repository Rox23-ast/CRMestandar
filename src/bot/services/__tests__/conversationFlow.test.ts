import { processIncomingMessage } from '../conversationFlow';
import { prisma } from '../../../core/database/prisma';
import { recordInboundMessage, recordOutboundMessage } from '../../../crm/services/conversationService';
import { createNotification } from '../../../crm/services/notificationService';
import { sendWhatsAppMessage } from '../whatsappService';
import { processMessageWithAI } from '../aiService';
import { emitQuoteRequested, emitQuoteCaptured } from '../../../integrations/webhookClient';

jest.mock('../../../core/database/prisma', () => ({
  prisma: {
    conversation: { findUnique: jest.fn(), update: jest.fn() },
    botConfig: { findFirst: jest.fn() },
    client: { update: jest.fn() },
    quote: { create: jest.fn() }
  }
}));

jest.mock('../../../crm/services/conversationService', () => ({
  recordInboundMessage: jest.fn(),
  recordOutboundMessage: jest.fn()
}));

jest.mock('../../../crm/services/notificationService', () => ({
  createNotification: jest.fn()
}));

jest.mock('../whatsappService', () => ({
  sendWhatsAppMessage: jest.fn()
}));

jest.mock('../aiService', () => ({
  processMessageWithAI: jest.fn()
}));

jest.mock('../../../integrations/webhookClient', () => ({
  emitQuoteRequested: jest.fn(),
  emitQuoteCaptured: jest.fn()
}));

const mockPrisma = prisma as unknown as {
  conversation: { findUnique: jest.Mock; update: jest.Mock };
  botConfig: { findFirst: jest.Mock };
  client: { update: jest.Mock };
  quote: { create: jest.Mock };
};
const mockRecordInbound = recordInboundMessage as jest.Mock;
const mockRecordOutbound = recordOutboundMessage as jest.Mock;
const mockCreateNotification = createNotification as jest.Mock;
const mockSendWhatsApp = sendWhatsAppMessage as jest.Mock;
const mockProcessAI = processMessageWithAI as jest.Mock;
const mockEmitRequested = emitQuoteRequested as jest.Mock;
const mockEmitCaptured = emitQuoteCaptured as jest.Mock;

const baseClient = {
  id: 'client-1',
  phone: '573001112233',
  name: 'María Pérez',
  botStep: 'START',
  quoteOrigin: null,
  quoteDestination: null,
  quoteVolume: null
};

const baseConversation = {
  id: 'conv-1',
  status: 'BOT_ACTIVE',
  assignedUserId: null,
  client: baseClient
};

const defaultRules = [
  {
    id: 'rule-capture',
    title: 'Captura de datos',
    keywords: 'cotizar, mudanza, traslado',
    response: '¡Claro! Para cotizar necesito origen, destino y volumen.'
  },
  {
    id: 'rule-hours',
    title: 'Horarios',
    keywords: 'horario, abre, cierra',
    response: 'Atendemos de lunes a viernes de 8:00 a 18:00.'
  }
];

const setup = ({
  inbound = { conversationId: 'conv-1', status: 'BOT_ACTIVE', duplicate: false, isNew: false },
  conversation = baseConversation,
  rules = defaultRules,
  aiResponse = { message: 'resp', intent: 'UNKNOWN' },
  botConfig = {}
}: {
  inbound?: Record<string, unknown>;
  conversation?: Record<string, unknown>;
  rules?: unknown;
  aiResponse?: { message: string; intent: string };
  botConfig?: Record<string, unknown>;
} = {}) => {
  mockRecordInbound.mockResolvedValue(inbound as never);
  mockPrisma.conversation.findUnique.mockResolvedValue(conversation as never);
  mockPrisma.conversation.update.mockResolvedValue({} as never);
  mockPrisma.botConfig.findFirst.mockResolvedValue({
    greetingMessage: 'Hola',
    awayMessage: 'Fuera',
    aiPersonalityPrompt: 'Bot',
    limitations: '',
    customRules: JSON.stringify(rules),
    botEnabled: true,
    ...botConfig
  } as never);
  mockPrisma.client.update.mockResolvedValue({} as never);
  mockPrisma.quote.create.mockResolvedValue({
    id: 'quote-1',
    origin: 'Bogotá',
    destination: 'Medellín',
    volume: 12.5,
    status: 'PENDING'
  } as never);
  mockProcessAI.mockResolvedValue(aiResponse as never);
  mockSendWhatsApp.mockResolvedValue(true as never);
  mockRecordOutbound.mockResolvedValue({} as never);
  mockCreateNotification.mockResolvedValue({} as never);
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('conversationFlow - cotizador integration', () => {
  describe('quote.requested', () => {
    it('emits quote.requested when the AI detects intent QUOTE', async () => {
      setup({ aiResponse: { message: '¡Claro!', intent: 'QUOTE' } });

      // Message intentionally avoids the quick-rule keywords (cotizar, mudanza...)
      // so the AI path is the one exercised.
      await processIncomingMessage(
        '573001112233',
        '¿Cuánto me costaría llevar mis cosas hasta otra casa?',
        'wamid.1'
      );

      expect(mockEmitRequested).toHaveBeenCalledWith({
        client: { phone: '573001112233', name: 'María Pérez' },
        conversationId: 'conv-1',
        message: '¿Cuánto me costaría llevar mis cosas hasta otra casa?'
      });
      expect(mockPrisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { botStep: 'QUOTE_ORIGIN' } })
      );
    });

    it('emits quote.requested when the quote-capture quick rule matches', async () => {
      setup();

      await processIncomingMessage('573001112233', 'Quiero cotizar mi mudanza', 'wamid.2');

      expect(mockProcessAI).not.toHaveBeenCalled();
      expect(mockEmitRequested).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-1', message: 'Quiero cotizar mi mudanza' })
      );
      expect(mockSendWhatsApp).toHaveBeenCalledWith(
        '573001112233',
        expect.stringContaining('origen, destino y volumen')
      );
    });

    it('does not emit quote.requested for unrelated quick rules', async () => {
      setup();

      await processIncomingMessage('573001112233', '¿Cuál es el horario?', 'wamid.3');

      expect(mockEmitRequested).not.toHaveBeenCalled();
      expect(mockSendWhatsApp).toHaveBeenCalledWith(
        '573001112233',
        expect.stringContaining('lunes a viernes')
      );
    });

    it('does not emit quote.requested for non-QUOTE AI intents', async () => {
      setup({ aiResponse: { message: 'Hola', intent: 'GREETING' } });

      await processIncomingMessage('573001112233', 'Buenos días', 'wamid.4');

      expect(mockEmitRequested).not.toHaveBeenCalled();
      expect(mockPrisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { botStep: 'CHAT' } })
      );
    });
  });

  describe('quote capture persistence', () => {
    it('stores the origin when leaving QUOTE_ORIGIN', async () => {
      setup({
        conversation: { ...baseConversation, client: { ...baseClient, botStep: 'QUOTE_ORIGIN' } }
      });

      await processIncomingMessage('573001112233', 'Bogotá', 'wamid.5');

      expect(mockPrisma.client.update).toHaveBeenCalledWith({
        where: { phone: '573001112233' },
        data: { botStep: 'QUOTE_DESTINATION', quoteOrigin: 'Bogotá' }
      });
      expect(mockEmitCaptured).not.toHaveBeenCalled();
    });

    it('stores the destination when leaving QUOTE_DESTINATION', async () => {
      setup({
        conversation: {
          ...baseConversation,
          client: { ...baseClient, botStep: 'QUOTE_DESTINATION', quoteOrigin: 'Bogotá' }
        }
      });

      await processIncomingMessage('573001112233', 'Medellín', 'wamid.6');

      expect(mockPrisma.client.update).toHaveBeenCalledWith({
        where: { phone: '573001112233' },
        data: { botStep: 'QUOTE_VOLUME', quoteDestination: 'Medellín' }
      });
    });

    it('persists the local Quote and emits quote.captured when capture completes', async () => {
      setup({
        conversation: {
          ...baseConversation,
          client: {
            ...baseClient,
            botStep: 'QUOTE_VOLUME',
            quoteOrigin: 'Bogotá',
            quoteDestination: 'Medellín'
          }
        }
      });

      await processIncomingMessage('573001112233', '12,5 m3 aproximados', 'wamid.7');

      expect(mockPrisma.client.update).toHaveBeenCalledWith({
        where: { phone: '573001112233' },
        data: { botStep: 'AGENT_HANDOFF', quoteVolume: 12.5 }
      });
      expect(mockPrisma.quote.create).toHaveBeenCalledWith({
        data: {
          clientId: 'client-1',
          conversationId: 'conv-1',
          origin: 'Bogotá',
          destination: 'Medellín',
          volume: 12.5,
          status: 'PENDING'
        }
      });
      expect(mockEmitCaptured).toHaveBeenCalledWith({
        client: { phone: '573001112233', name: 'María Pérez' },
        conversationId: 'conv-1',
        quote: { origin: 'Bogotá', destination: 'Medellín', volumeM3: 12.5 }
      });
      expect(mockEmitRequested).not.toHaveBeenCalled();
    });

    it('skips quote.captured when the capture is incomplete', async () => {
      setup({
        conversation: {
          ...baseConversation,
          client: { ...baseClient, botStep: 'QUOTE_VOLUME', quoteOrigin: null, quoteDestination: null }
        }
      });

      await processIncomingMessage('573001112233', 'unas cosas', 'wamid.8');

      expect(mockPrisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ botStep: 'AGENT_HANDOFF' }) })
      );
      expect(mockPrisma.quote.create).not.toHaveBeenCalled();
      expect(mockEmitCaptured).not.toHaveBeenCalled();
    });
  });

  describe('bot disabled', () => {
    it('does not greet a new conversation and routes it to humans', async () => {
      setup({
        inbound: { conversationId: 'conv-1', status: 'BOT_ACTIVE', duplicate: false, isNew: true },
        botConfig: { botEnabled: false }
      });

      await processIncomingMessage('573001112233', 'hola, necesito ayuda', 'wamid.9');

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { status: 'NEW' }
      });
      expect(mockSendWhatsApp).not.toHaveBeenCalled();
      expect(mockRecordOutbound).not.toHaveBeenCalled();
      expect(mockCreateNotification).toHaveBeenCalledTimes(2);
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'ADMIN', type: 'BOT_DISABLED_MESSAGE' })
      );
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'MARKETING_DIRECTOR', type: 'BOT_DISABLED_MESSAGE' })
      );
    });

    it('skips AI, rules and flow steps for existing conversations', async () => {
      setup({
        conversation: {
          ...baseConversation,
          client: { ...baseClient, botStep: 'QUOTE_ORIGIN' }
        },
        botConfig: { botEnabled: false }
      });

      await processIncomingMessage('573001112233', 'de Bogotá', 'wamid.10');

      expect(mockProcessAI).not.toHaveBeenCalled();
      expect(mockRecordOutbound).not.toHaveBeenCalled();
      expect(mockPrisma.client.update).not.toHaveBeenCalled();
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { status: 'NEW' }
      });
    });

    it('still processes normally when the bot is enabled', async () => {
      setup({
        inbound: { conversationId: 'conv-1', status: 'BOT_ACTIVE', duplicate: false, isNew: true }
      });

      await processIncomingMessage('573001112233', 'hola', 'wamid.11');

      expect(mockSendWhatsApp).toHaveBeenCalledWith('573001112233', 'Hola');
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    });
  });

  describe('meta ads source', () => {
    it('marks a new conversation as ADS and stores the context metadata', async () => {
      setup({
        inbound: { conversationId: 'conv-1', status: 'BOT_ACTIVE', duplicate: false, isNew: true }
      });

      await processIncomingMessage(
        '573001112233',
        'hola desde el anuncio',
        'wamid.12',
        'TEXT',
        undefined,
        { from: '1072732x5451', referral: { ctwa_clid: 'xyz' } }
      );

      expect(mockRecordInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { ads: { from: '1072732x5451', referral: { ctwa_clid: 'xyz' } } }
        })
      );
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { source: 'ADS' }
      });
    });

    it('does not mark organic messages as ADS', async () => {
      setup({
        inbound: { conversationId: 'conv-1', status: 'BOT_ACTIVE', duplicate: false, isNew: true }
      });

      await processIncomingMessage('573001112233', 'hola', 'wamid.13');

      expect(mockRecordInbound).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: undefined })
      );
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    });
  });

  describe('meta profile name', () => {
    it('passes the WhatsApp profile name through to recordInboundMessage', async () => {
      setup({
        inbound: { conversationId: 'conv-1', status: 'BOT_ACTIVE', duplicate: false, isNew: true }
      });

      await processIncomingMessage(
        '573001112233',
        'hola',
        'wamid.14',
        'TEXT',
        undefined,
        undefined,
        undefined,
        'Carlos Gómez'
      );

      expect(mockRecordInbound).toHaveBeenCalledWith(
        expect.objectContaining({ contactName: 'Carlos Gómez' })
      );
    });

    it('omits contactName when Meta did not provide it', async () => {
      setup({
        inbound: { conversationId: 'conv-1', status: 'BOT_ACTIVE', duplicate: false, isNew: true }
      });

      await processIncomingMessage('573001112233', 'hola', 'wamid.15');

      expect(mockRecordInbound).toHaveBeenCalledWith(
        expect.not.objectContaining({ contactName: expect.anything() })
      );
    });
  });
});
