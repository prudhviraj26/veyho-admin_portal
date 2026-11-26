export const SCHOOL_WEB_URL =
  import.meta.env.VITE_SCHOOL_WEB_URL || 'http://localhost:5173';

/**
 * Launches the school web application in an isolated Support Mode tab using the
 * operator's current RS256 platform token and target school ID via URL hash handoff.
 */
export function enterSupportMode(schoolId: string): boolean {
  const token = localStorage.getItem('shq_token');
  if (!token) {
    return false;
  }

  localStorage.setItem('shq_support_school_id', schoolId);

  const targetUrl = `${SCHOOL_WEB_URL.replace(/\/$/, '')}/support-handoff#token=${encodeURIComponent(token)}&schoolId=${encodeURIComponent(schoolId)}`;
  const popup = window.open(targetUrl, '_blank', 'noopener');
  if (!popup) {
    window.location.assign(targetUrl);
  }
  return true;
}
