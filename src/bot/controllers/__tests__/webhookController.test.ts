import { parseInboundMessage } from '../webhookController';

jest.mock('../../../crm/services/credentialService', () => ({
  getRawCredentials: jest.fn()
}));

describe('webhookController - parseInboundMessage', () => {
  it('maps text messages', () => {
    const result = parseInboundMessage({ id: 'w1', from: '57', type: 'text', text: { body: 'hola' } });
    expect(result).toEqual({ type: 'TEXT', text: 'hola', mediaId: undefined, adsContext: undefined });
  });

  it('maps audio messages with their media id', () => {
    const result = parseInboundMessage({ id: 'w2', from: '57', type: 'audio', audio: { id: 'media-audio' } });
    expect(result.type).toBe('AUDIO');
    expect(result.mediaId).toBe('media-audio');
  });

  it('maps video messages with caption', () => {
    const result = parseInboundMessage({
      id: 'w3', from: '57', type: 'video', video: { id: 'media-video', caption: 'mira esto' }
    });
    expect(result.type).toBe('VIDEO');
    expect(result.mediaId).toBe('media-video');
    expect(result.text).toBe('mira esto');
  });

  it('maps stickers to STICKER with media id', () => {
    const result = parseInboundMessage({ id: 'w4', from: '57', type: 'sticker', sticker: { id: 'media-sticker' } });
    expect(result.type).toBe('STICKER');
    expect(result.mediaId).toBe('media-sticker');
  });

  it('composes a readable text for locations', () => {
    const result = parseInboundMessage({
      id: 'w5', from: '57', type: 'location',
      location: { latitude: 4.711, longitude: -74.072, name: 'Bogotá', address: 'Cra 7' }
    });
    expect(result.type).toBe('LOCATION');
    expect(result.text).toContain('Ubicación: Bogotá, Cra 7');
    expect(result.text).toContain('4.711');
  });

  it('composes a readable text for contacts', () => {
    const result = parseInboundMessage({
      id: 'w6', from: '57', type: 'contacts',
      contacts: [{ name: { formatted_name: 'María' } }, { name: { formatted_name: 'Juan' } }]
    });
    expect(result.type).toBe('CONTACTS');
    expect(result.text).toBe('Contacto: María, Juan');
  });

  it('keeps unknown types as UNSUPPORTED', () => {
    const result = parseInboundMessage({ id: 'w7', from: '57', type: 'reaction', reaction: { emoji: '👍' } });
    expect(result.type).toBe('UNSUPPORTED');
  });

  it('extracts the ads context when present', () => {
    const result = parseInboundMessage({
      id: 'w8', from: '57', type: 'text', text: { body: 'hola' },
      context: { from: 'ad-123', referral: { ctwa_clid: 'xyz' } }
    });
    expect(result.adsContext).toEqual({ from: 'ad-123', referral: { ctwa_clid: 'xyz' } });
  });
});
