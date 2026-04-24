import { filterFutureSlots, taipeiNowParts, taipeiToday } from './pickup-schema';

describe('[pickup-schema] taipeiNowParts', () => {
  it('returns Taipei wall-clock parts for a UTC instant (same day in Taipei)', () => {
    // 2026-04-30 07:30 UTC = 2026-04-30 15:30 Taipei
    expect(taipeiNowParts(new Date('2026-04-30T07:30:00Z'))).toEqual({
      y: 2026,
      m: 4,
      day: 30,
      hour: 15,
      minute: 30,
    });
  });

  it('crosses the date boundary correctly when UTC is evening but Taipei is next morning', () => {
    // 2026-04-30 17:00 UTC = 2026-05-01 01:00 Taipei
    expect(taipeiNowParts(new Date('2026-04-30T17:00:00Z'))).toMatchObject({
      y: 2026,
      m: 5,
      day: 1,
      hour: 1,
    });
  });
});

describe('[pickup-schema] taipeiToday', () => {
  it('returns midnight local of the Taipei date', () => {
    const d = taipeiToday(new Date('2026-04-30T07:30:00Z')); // Taipei 2026-04-30 15:30
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // April is index 3
    expect(d.getDate()).toBe(30);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
});

describe('[pickup-schema] filterFutureSlots', () => {
  const slots = ['15:00', '20:00'];

  it('returns all slots when no date is selected', () => {
    expect(filterFutureSlots(slots, undefined)).toEqual(slots);
  });

  it('returns all slots when the selected date is not today in Taipei', () => {
    // now = 2026-04-30 02:00 UTC → Taipei 10:00; selected = 2026-05-01 local
    const now = new Date('2026-04-30T02:00:00Z');
    const tomorrow = new Date(2026, 4, 1);
    expect(filterFutureSlots(slots, tomorrow, now)).toEqual(slots);
  });

  it('drops elapsed slots for today in Taipei', () => {
    // now = 2026-04-30 11:00 UTC → Taipei 19:00; 15:00 has passed, 20:00 remains
    const now = new Date('2026-04-30T11:00:00Z');
    const today = new Date(2026, 3, 30);
    expect(filterFutureSlots(slots, today, now)).toEqual(['20:00']);
  });

  it('returns empty when every slot is already past today', () => {
    // now = 2026-04-30 13:00 UTC → Taipei 21:00
    const now = new Date('2026-04-30T13:00:00Z');
    const today = new Date(2026, 3, 30);
    expect(filterFutureSlots(slots, today, now)).toEqual([]);
  });
});
