const ACCESS_KEY = 'admin_token';
const REFRESH_KEY = 'admin_refresh_token';
export const ADMIN_TOKEN_CLEAR_EVENT = 'admin-token-clear';

export const adminTokenStore = {
  get: () => localStorage.getItem(ACCESS_KEY),
  set: (token: string) => localStorage.setItem(ACCESS_KEY, token),
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    window.dispatchEvent(new Event(ADMIN_TOKEN_CLEAR_EVENT));
  },

  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  setRefresh: (token: string) => localStorage.setItem(REFRESH_KEY, token),
};
