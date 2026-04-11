import { UserProfile } from './user';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
  };
  access_token: string;
  refresh_token: string;
}

export type MeResponse = UserProfile;
