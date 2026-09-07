import type { AuthUser } from './domain';

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() || '/api';
const apiBaseUrl = configuredApiUrl.replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

export type AdminRequest = <T>(
  path: string,
  options?: RequestOptions,
) => Promise<T>;

function apiUrl(path: string) {
  return `${apiBaseUrl}/${path.replace(/^\//, '')}`;
}

function errorMessage(body: unknown, fallback: string) {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message)) {
      return message.filter((item): item is string => typeof item === 'string').join(' ');
    }
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.slice(0, 500);
  }
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
  token?: string,
): Promise<T> {
  const { body, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
      headers,
    });
  } catch {
    throw new ApiError(
      'Could not reach the API. Confirm the API is running and the portal URL is configured correctly.',
      0,
    );
  }

  const responseBody = await parseResponse(response);
  if (!response.ok) {
    throw new ApiError(
      errorMessage(responseBody, `Request failed (${response.status})`),
      response.status,
    );
  }

  return responseBody as T;
}

export async function login(email: string, password: string) {
  return request<{ token: string; user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), password },
  });
}

export async function profile(token: string) {
  return request<{ user: AuthUser }>('/auth/me', {}, token);
}

export function queryString(values: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
