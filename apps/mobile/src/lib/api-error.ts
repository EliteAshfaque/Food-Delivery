import { isAxiosError } from 'axios';

type NestErrorBody = {
  error?: unknown;
  message?: unknown;
  statusCode?: unknown;
};

const GENERIC_SERVER_MESSAGES = new Set([
  'Bad Request',
  'Forbidden',
  'Internal Server Error',
  'Not Found',
  'Unauthorized',
]);

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Please check the details and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do that.',
  404: 'That item is no longer available.',
  409: 'This has changed already. Refresh and try again.',
  422: 'Please check the details and try again.',
  429: 'Too many attempts. Please wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again.',
  502: 'The service is temporarily unavailable. Please try again.',
  503: 'The service is temporarily unavailable. Please try again.',
  504: 'The request took too long. Please try again.',
};

function isSafeUserMessage(value: string) {
  const message = value.trim();
  if (!message || message.length > 280) return false;
  if (/^[A-Z0-9_:-]+$/.test(message)) return false;

  // Do not surface accidental infrastructure details if a server/proxy sends
  // an unfiltered response. Nest's deliberate human messages still pass.
  return !/(?:\bat\s+\w+\s*\(|\bexception\b|\bpostgres\b|\bdrizzle\b|\bprisma\b|\bsql\b|\bselect\s+\*\b|https?:\/\/|\btrace(?:back)?\b)/i.test(
    message,
  );
}

function messageFromBody(body: NestErrorBody | undefined) {
  const message = body?.message;

  if (Array.isArray(message)) {
    const messages = message.filter(
      (item): item is string =>
        typeof item === 'string' &&
        isSafeUserMessage(item) &&
        !GENERIC_SERVER_MESSAGES.has(item.trim()),
    );
    return messages.length > 0 ? [...new Set(messages)].join('\n') : null;
  }

  if (
    typeof message === 'string' &&
    isSafeUserMessage(message) &&
    !GENERIC_SERVER_MESSAGES.has(message.trim())
  ) {
    return message.trim();
  }

  return null;
}

/**
 * Converts Nest's default error response (including validation message arrays)
 * and transport failures into concise, safe text for mobile UI. Never render a
 * raw Axios/network error directly to a customer.
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
) {
  if (isAxiosError<NestErrorBody>(error)) {
    const response = error.response;
    const responseMessage = messageFromBody(response?.data);
    if (responseMessage) return responseMessage;

    if (!response) {
      if (error.code === 'ECONNABORTED') {
        return 'The request took too long. Check your connection and try again.';
      }
      return 'We could not reach Wasil. Check your connection and try again.';
    }

    return STATUS_MESSAGES[response.status] ?? fallback;
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (
      message &&
      isSafeUserMessage(message) &&
      !/^network error$/i.test(message) &&
      !GENERIC_SERVER_MESSAGES.has(message)
    ) {
      return message;
    }
  }

  return fallback;
}

/** A small type guard for places that need to branch on an HTTP status. */
export function getApiErrorStatus(error: unknown) {
  return isAxiosError(error) ? error.response?.status : undefined;
}
