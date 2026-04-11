export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  preferred_language: string;
  line_user_id: string | null;
}

export interface UpdateProfileRequest {
  name?: string;
  phone?: string;
  preferred_language?: 'zh' | 'en';
}
