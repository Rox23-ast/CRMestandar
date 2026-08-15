import { isWithinTimeSlot } from '../services/conversationService';

describe('Conversation business-hour rules', () => {
  it('includes the start of a configured slot', () => {
    expect(isWithinTimeSlot(8 * 60, { start: '08:00', end: '18:00' })).toBe(true);
  });

  it('excludes the end of a configured slot', () => {
    expect(isWithinTimeSlot(18 * 60, { start: '08:00', end: '18:00' })).toBe(false);
  });

  it('keeps closed days outside business hours', () => {
    expect(isWithinTimeSlot(12 * 60, null)).toBe(false);
  });
});
