import axios from 'axios';

/**
 * Extracts a human-readable error message from an Axios or generic error value.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[]; error?: string } | undefined;
    const msg = data?.message ?? data?.error;
    if (Array.isArray(msg)) {
      return msg.join(', ');
    }
    if (typeof msg === 'string' && msg.trim()) {
      return msg;
    }
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}
