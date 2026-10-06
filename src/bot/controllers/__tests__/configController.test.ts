import { Request, Response } from 'express';
import { updateBotConfig } from '../configController';
import { prisma } from '../../../core/database/prisma';

jest.mock('../../../core/database/prisma', () => ({
  prisma: {
    botConfig: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    conversation: { updateMany: jest.fn() }
  }
}));

const mockPrisma = prisma as unknown as {
  botConfig: { findFirst: jest.Mock; update: jest.Mock; create: jest.Mock };
  conversation: { updateMany: jest.Mock };
};

const VALID_BODY = {
  greetingMessage: 'Hola',
  awayMessage: 'Fuera',
  aiPersonalityPrompt: 'Asistente',
  limitations: '',
  customRules: [],
  botEnabled: true
};

const makeRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
};

describe('configController - updateBotConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.botConfig.findFirst.mockResolvedValue({
      id: 'cfg-1',
      botEnabled: false,
      customRules: '[]'
    } as never);
    mockPrisma.botConfig.update.mockResolvedValue({
      id: 'cfg-1',
      botEnabled: true,
      customRules: '[]'
    } as never);
    mockPrisma.botConfig.create.mockResolvedValue({ id: 'cfg-new', botEnabled: true, customRules: '[]' } as never);
    mockPrisma.conversation.updateMany.mockResolvedValue({ count: 3 } as never);
  });

  it('returns all human conversations to the bot when the bot is enabled (false -> true)', async () => {
    const res = makeRes();
    await updateBotConfig({ body: VALID_BODY } as Request, res);

    expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { status: { in: ['HUMAN_ACTIVE', 'NEW'] } },
      data: { status: 'BOT_ACTIVE' }
    });
  });

  it('does not bulk-return conversations when the bot was already enabled', async () => {
    mockPrisma.botConfig.findFirst.mockResolvedValue({ id: 'cfg-1', botEnabled: true, customRules: '[]' } as never);
    const res = makeRes();
    await updateBotConfig({ body: VALID_BODY } as Request, res);

    expect(mockPrisma.conversation.updateMany).not.toHaveBeenCalled();
  });

  it('does not bulk-return conversations when disabling the bot', async () => {
    const res = makeRes();
    await updateBotConfig({ body: { ...VALID_BODY, botEnabled: false } } as Request, res);

    expect(mockPrisma.conversation.updateMany).not.toHaveBeenCalled();
  });
});
