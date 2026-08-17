const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3001';

export function getApiBaseUrl(
  configured: string | undefined = process.env.API_BASE_URL,
): string {
  const value = configured ?? DEFAULT_API_BASE_URL;

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError('API base URL must be an absolute HTTP(S) URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('API base URL must be an absolute HTTP(S) URL.');
  }

  return parsed.origin + parsed.pathname.replace(/\/$/, '');
}
