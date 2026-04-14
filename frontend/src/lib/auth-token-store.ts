'use client';

const ACCESS_TOKEN_KEY = 'access_token';

export const authTokenStore = {
  get(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  },

  set(token: string | null): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (!token) {
      window.localStorage.removeItem(ACCESS_TOKEN_KEY);
      return;
    }

    window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  },

  clear(): void {
    this.set(null);
  },
};
