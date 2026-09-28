import { uploadWhatsAppMedia, sendWhatsAppMedia } from '../whatsappService';
import { getRawCredentials } from '../../../crm/services/credentialService';

jest.mock('../../../crm/services/credentialService', () => ({
  getRawCredentials: jest.fn()
}));

const mockGetRawCredentials = getRawCredentials as jest.Mock;

const creds = { WA_API_TOKEN: 'token', WA_PHONE_NUMBER_ID: '12345' };

describe('whatsappService - media', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRawCredentials.mockResolvedValue(creds as never);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('uploadWhatsAppMedia', () => {
    it('uploads a file and returns the media id', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'media-1' })
      } as never) as jest.Mock;

      const result = await uploadWhatsAppMedia(Buffer.from('abc'), 'image/png', 'foto.png');

      const fetchMock = global.fetch as jest.Mock;
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('/12345/media');
      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
      expect(result).toEqual({ id: 'media-1' });
    });

    it('returns an error when Meta rejects the upload', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        text: async () => '{"error":{"message":"Unsupported file type"}}'
      } as never) as jest.Mock;

      const result = await uploadWhatsAppMedia(Buffer.from('abc'), 'audio/webm', 'nota.webm');

      expect(result.id).toBeNull();
      expect(result.error).toContain('Unsupported file type');
    });
  });

  describe('sendWhatsAppMedia', () => {
    it('sends a document with caption and filename', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true } as never) as jest.Mock;

      const sent = await sendWhatsAppMedia('573001112233', 'document', 'media-1', 'Tu cotización', 'cotizacion.pdf');

      expect(sent).toBe(true);
      const fetchMock = global.fetch as jest.Mock;
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.type).toBe('document');
      expect(body.document).toEqual({ id: 'media-1', caption: 'Tu cotización', filename: 'cotizacion.pdf' });
    });

    it('does not attach caption to audio messages', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true } as never) as jest.Mock;

      await sendWhatsAppMedia('573001112233', 'audio', 'media-2');

      const fetchMock = global.fetch as jest.Mock;
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.type).toBe('audio');
      expect(body.audio).toEqual({ id: 'media-2' });
    });

    it('returns false when the message fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'boom' })
      } as never) as jest.Mock;

      const sent = await sendWhatsAppMedia('573001112233', 'image', 'media-3');

      expect(sent).toBe(false);
    });
  });
});
