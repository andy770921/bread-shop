import type { PickupLocation, PickupMethod, PickupSettings } from '@repo/shared';

export type ValidationResult = { ok: true } | { ok: false; reason: string };

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export interface TaipeiParts {
  y: number;
  m: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

export function taipeiParts(d: Date): TaipeiParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    day: Number(parts.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(parts.minute),
    weekday: WEEKDAY_MAP[parts.weekday as string],
  };
}

export function ymdString(parts: TaipeiParts): string {
  return `${parts.y}-${pad(parts.m)}-${pad(parts.day)}`;
}

export function validatePickupAt(input: {
  method: PickupMethod;
  locationId: string;
  pickupAt: Date;
  now: Date;
  settings: PickupSettings;
  locations: Pick<PickupLocation, 'id' | 'is_active'>[];
}): ValidationResult {
  const { method, locationId, pickupAt, now, settings, locations } = input;

  if (method === 'seven_eleven_frozen') {
    return { ok: false, reason: 'seven_eleven_not_available' };
  }
  if (method !== 'in_person') {
    return { ok: false, reason: 'unknown_pickup_method' };
  }

  const location = locations.find((l) => l.id === locationId);
  if (!location || location.is_active === false) {
    return { ok: false, reason: 'pickup_location_unavailable' };
  }

  if (Number.isNaN(pickupAt.getTime())) {
    return { ok: false, reason: 'invalid_pickup_at' };
  }
  if (pickupAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'pickup_in_past' };
  }

  const nowParts = taipeiParts(now);
  const pickParts = taipeiParts(pickupAt);
  const nowYmd = ymdString(nowParts);

  const windowEnd = new Date(Date.UTC(nowParts.y, nowParts.m - 1, nowParts.day));
  windowEnd.setUTCDate(windowEnd.getUTCDate() + settings.windowDays);
  const windowEndYmd = `${windowEnd.getUTCFullYear()}-${pad(windowEnd.getUTCMonth() + 1)}-${pad(windowEnd.getUTCDate())}`;

  const pickYmd = ymdString(pickParts);
  if (pickYmd < nowYmd) {
    return { ok: false, reason: 'pickup_in_past' };
  }
  if (pickYmd > windowEndYmd) {
    return { ok: false, reason: 'pickup_beyond_window' };
  }

  if (settings.disabledWeekdays.includes(pickParts.weekday)) {
    return { ok: false, reason: 'weekday_closed' };
  }

  if (settings.closureStartDate && settings.closureEndDate) {
    if (pickYmd >= settings.closureStartDate && pickYmd <= settings.closureEndDate) {
      return { ok: false, reason: 'within_closure' };
    }
  }

  const hhmm = `${pad(pickParts.hour)}:${pad(pickParts.minute)}`;
  if (!settings.timeSlots.includes(hhmm)) {
    return { ok: false, reason: 'time_slot_unavailable' };
  }

  return { ok: true };
}
