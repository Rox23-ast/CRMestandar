import { processMessageWithAI } from '../aiService';
import { getRawCredentials } from '../../../crm/services/credentialService';

const mockOpenAICreate = jest.fn();

jest.mock('../../../crm/services/credentialService', () => ({
  getRawCredentials: jest.fn()
}));

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockOpenAICreate } }
  }))
}));

const mockGetRawCredentials = getRawCredentials as jest.Mock;

const creds = (overrides: Record<string, string> = {}) => ({
  OPENAI_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  GEMINI_API_KEY: '',
  ...overrides
});

const jsonResponse = (message: string, intent: string) => JSON.stringify({ message, intent });

describe('aiService - multi-provider', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenAICreate.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uses the mock NLP fallback when no AI key is configured', async () => {
    mockGetRawCredentials.mockResolvedValue(creds() as never);

    const result = await processMessageWithAI('quiero cotizar una mudanza', 'personalidad', 'limites');

    expect(result.intent).toBe('QUOTE');
    expect(result.message).toContain('[MOCK]');
  });

  it('calls OpenAI when OPENAI_API_KEY is set', async () => {
    mockGetRawCredentials.mockResolvedValue(creds({ OPENAI_API_KEY: 'sk-test' }) as never);
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: jsonResponse('¡Hola! ¿De dónde a dónde te mudas?', 'QUOTE') } }]
    } as never);

    const result = await processMessageWithAI('hola quiero cotizar', 'personalidad', 'limites');

    expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ message: '¡Hola! ¿De dónde a dónde te mudas?', intent: 'QUOTE' });
  });

  it('calls Gemini when only GEMINI_API_KEY is set', async () => {
    mockGetRawCredentials.mockResolvedValue(creds({ GEMINI_API_KEY: 'AIza-test' }) as never);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: jsonResponse('Listo, cuéntame el destino.', 'QUOTE') }] } }]
      })
    } as never) as jest.Mock;

    const result = await processMessageWithAI('quiero una mudanza', 'personalidad', 'limites');

    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('AIza-test');
    expect(result.intent).toBe('QUOTE');
  });

  it('calls Anthropic and strips markdown fences from the JSON', async () => {
    mockGetRawCredentials.mockResolvedValue(creds({ ANTHROPIC_API_KEY: 'sk-ant-test' }) as never);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: '```json\n' + jsonResponse('Claro, un agente te ayudará.', 'SUPPORT') + '\n```' }]
      })
    } as never) as jest.Mock;

    const result = await processMessageWithAI('tengo un problema con mi servicio', 'personalidad', 'limites');

    const fetchMock = global.fetch as jest.Mock;
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers['x-api-key']).toBe('sk-ant-test');
    expect(result).toEqual({ message: 'Claro, un agente te ayudará.', intent: 'SUPPORT' });
  });

  it('falls back to the next provider when OpenAI fails', async () => {
    mockGetRawCredentials.mockResolvedValue(
      creds({ OPENAI_API_KEY: 'sk-invalida', GEMINI_API_KEY: 'AIza-test' }) as never
    );
    mockOpenAICreate.mockRejectedValue(new Error('invalid api key') as never);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: jsonResponse('Hola desde Gemini.', 'GREETING') }] } }]
      })
    } as never) as jest.Mock;

    const result = await processMessageWithAI('hola', 'personalidad', 'limites');

    expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.intent).toBe('GREETING');
  });

  it('rejects invalid JSON from a provider and tries the next one', async () => {
    mockGetRawCredentials.mockResolvedValue(
      creds({ GEMINI_API_KEY: 'AIza-mala', ANTHROPIC_API_KEY: 'sk-ant-test' }) as never
    );
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'esto no es json' }] } }] })
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ text: jsonResponse('Respuesta de Claude.', 'UNKNOWN') }] })
      } as never) as jest.Mock;

    const result = await processMessageWithAI('dime algo', 'personalidad', 'limites');

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.intent).toBe('UNKNOWN');
  });

  it('returns the connection fallback message when every provider fails', async () => {
    mockGetRawCredentials.mockResolvedValue(creds({ GEMINI_API_KEY: 'AIza-mala' }) as never);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
      text: async () => 'bad request'
    } as never) as jest.Mock;

    const result = await processMessageWithAI('hola', 'personalidad', 'limites');

    expect(result.intent).toBe('UNKNOWN');
    expect(result.message).toContain('demoras');
  });
});
