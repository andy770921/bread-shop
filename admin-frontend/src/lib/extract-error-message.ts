import { ApiResponseError } from '@repo/shared';

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiResponseError) {
    const body = err.body as { message?: unknown; error?: unknown } | null | string;
    if (body && typeof body === 'object') {
      const raw = body.message ?? body.error;
      if (Array.isArray(raw)) return `${raw.map(String).join('; ')} (HTTP ${err.status})`;
      if (typeof raw === 'string' && raw.length > 0) return `${raw} (HTTP ${err.status})`;
    }
    if (typeof body === 'string' && body.length > 0) return `${body} (HTTP ${err.status})`;
    return `${err.statusText || fallback} (HTTP ${err.status})`;
  }
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}
