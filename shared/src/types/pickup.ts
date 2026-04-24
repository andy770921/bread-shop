export type PickupMethod = 'in_person' | 'seven_eleven_frozen';

export interface PickupLocation {
  id: string;
  label_zh: string;
  label_en: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface PickupSettings {
  timeSlots: string[];
  windowDays: number;
  leadDays: number;
  disabledWeekdays: number[];
  closureStartDate: string | null;
  closureEndDate: string | null;
}

export interface PickupSettingsResponse extends PickupSettings {
  locations: PickupLocation[];
}

export interface CreatePickupLocationRequest {
  label_zh: string;
  label_en: string;
}

export interface UpdatePickupLocationRequest {
  label_zh?: string;
  label_en?: string;
  is_active?: boolean;
  sort_order?: number;
}

export type UpdatePickupSettingsRequest = PickupSettings;
