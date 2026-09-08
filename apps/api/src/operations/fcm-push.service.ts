import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth, type JWTInput } from 'google-auth-library';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

const firebaseMessagingScope =
  'https://www.googleapis.com/auth/firebase.messaging';
const firebaseMessagingEndpoint = 'https://fcm.googleapis.com/v1/projects';
const pushRequestTimeoutMs = 10_000;
const maxFcmDataBytes = 3_000;

type FirebaseServiceAccount = JWTInput & {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  type?: string;
};

type FirebaseConfiguration =
  | {
      configured: true;
      projectId: string;
      credentials: JWTInput;
    }
  | {
      configured: false;
      error: string;
    };

type ServiceAccountSource = { value: string } | { error: string } | undefined;

type FcmErrorResponse = {
  error?: {
    code?: number;
    status?: string;
    message?: string;
    details?: Array<{
      '@type'?: string;
      errorCode?: string;
    }>;
  };
};

/**
 * A provider error intentionally contains a safe, user-facing summary rather
 * than a raw Google response. Notification delivery rows are visible to admin
 * users and must never expose service-account material or bearer tokens.
 */
export class FcmPushProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly unregisterDevice = false,
  ) {
    super(message);
    this.name = 'FcmPushProviderError';
  }
}

export type FcmPushMessage = {
  token: string;
  title: string;
  body: string;
  payload?: Record<string, unknown> | null;
};

/**
 * Sends Android native FCM registration tokens directly through the Firebase
 * HTTP v1 API. Expo tokens deliberately remain on the existing Expo path.
 *
 * The service is optional at runtime: API startup still succeeds without
 * Firebase credentials and a direct-FCM delivery is marked FAILED with a
 * useful, non-retryable configuration error instead of being silently lost.
 */
@Injectable()
export class FcmPushService {
  private readonly configuration: FirebaseConfiguration;
  private googleAuth?: GoogleAuth;

  constructor(private readonly configService: ConfigService) {
    this.configuration = this.resolveConfiguration();
  }

  async send(message: FcmPushMessage) {
    if (!this.configuration.configured) {
      throw new FcmPushProviderError(this.configuration.error, false);
    }

    const accessToken = await this.getAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), pushRequestTimeoutMs);

    try {
      let response: Response;
      try {
        const tracking = this.getOrderTrackingNotification(message.payload);
        // Android only calls FirebaseMessagingService for a data message while
        // the app is backgrounded. Lifecycle updates need that path so the
        // native foreground tracking card can replace its existing stepper.
        // Other notifications intentionally retain FCM's normal system UI.
        const data = this.serializeData(
          tracking
            ? {
                ...message.payload,
                notificationTitle: message.title,
                notificationBody: message.body,
              }
            : message.payload,
        );
        response = await fetch(
          `${firebaseMessagingEndpoint}/${encodeURIComponent(this.configuration.projectId)}/messages:send`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                token: message.token,
                ...(tracking
                  ? {}
                  : {
                      notification: {
                        title: message.title,
                        body: message.body,
                      },
                    }),
                data,
                android: {
                  priority: 'HIGH',
                  notification: {
                    channel_id: 'active-order-tracking-v2',
                    sound: 'default',
                    // The order id is a stable native notification key. FCM
                    // replaces this card on each status update rather than
                    // leaving the lock screen with stale status cards.
                    ...(tracking
                      ? {
                          tag: `order-${tracking.orderId}`,
                          sticky: !tracking.isTerminal,
                          visibility: 'PUBLIC',
                          notification_priority: 'PRIORITY_HIGH',
                        }
                      : {}),
                  },
                },
              },
            }),
            signal: controller.signal,
          },
        );
      } catch (error) {
        throw new FcmPushProviderError(
          error instanceof Error && error.name === 'AbortError'
            ? 'FCM push provider timed out'
            : 'Could not reach the FCM push provider',
          true,
        );
      }

      const responseBody = await this.readResponse(response);
      if (!response.ok) {
        throw this.toProviderError(response.status, responseBody);
      }

      const name = this.readMessageName(responseBody);
      if (!name) {
        throw new FcmPushProviderError(
          'FCM push provider returned an invalid delivery response.',
          true,
        );
      }
      return { id: name };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Build a single Android "active order" notification only for customer
   * lifecycle messages. Admin broadcasts and driver offers remain ordinary
   * dismissible push notifications.
   */
  private getOrderTrackingNotification(
    payload?: Record<string, unknown> | null,
  ) {
    if (!payload || payload.trackingNotification !== true) return null;
    const orderId =
      typeof payload.orderId === 'string' ? payload.orderId : null;
    const status =
      typeof payload.orderStatus === 'string' ? payload.orderStatus : null;
    if (!orderId || !status) return null;

    return {
      orderId,
      isTerminal: status === 'DELIVERED' || status === 'CANCELLED',
    };
  }

  private resolveConfiguration(): FirebaseConfiguration {
    const source = this.readServiceAccountSource();
    if (!source) {
      return {
        configured: false,
        error:
          'Direct FCM is not configured. Set FIREBASE_SERVICE_ACCOUNT_FILE, FIREBASE_SERVICE_ACCOUNT_JSON_BASE64, or FIREBASE_SERVICE_ACCOUNT_JSON and FIREBASE_PROJECT_ID on the API.',
      };
    }
    if ('error' in source) {
      return { configured: false, error: source.error };
    }

    let parsed: FirebaseServiceAccount;
    try {
      parsed = JSON.parse(source.value) as FirebaseServiceAccount;
    } catch {
      return {
        configured: false,
        error:
          'Direct FCM is misconfigured: the Firebase service-account JSON is invalid.',
      };
    }

    const credentials = this.validateServiceAccount(parsed);
    if (!credentials) {
      return {
        configured: false,
        error:
          'Direct FCM is misconfigured: the Firebase service account needs project_id, client_email, and private_key.',
      };
    }

    const configuredProjectId = this.configService
      .get<string>('FIREBASE_PROJECT_ID')
      ?.trim();
    const credentialProjectId = credentials.project_id?.trim();
    if (
      configuredProjectId &&
      credentialProjectId &&
      configuredProjectId !== credentialProjectId
    ) {
      return {
        configured: false,
        error:
          'Direct FCM is misconfigured: FIREBASE_PROJECT_ID does not match the Firebase service account project_id.',
      };
    }

    const projectId = configuredProjectId || credentialProjectId;
    if (!projectId) {
      return {
        configured: false,
        error:
          'Direct FCM is misconfigured: set FIREBASE_PROJECT_ID or include project_id in the Firebase service account.',
      };
    }

    return { configured: true, projectId, credentials };
  }

  private readServiceAccountSource(): ServiceAccountSource {
    const encoded = this.configService
      .get<string>('FIREBASE_SERVICE_ACCOUNT_JSON_BASE64')
      ?.trim();
    if (encoded) {
      try {
        return { value: Buffer.from(encoded, 'base64').toString('utf8') };
      } catch {
        // JSON.parse below reports a stable, secret-safe configuration error.
        return { value: '' };
      }
    }

    const inline = this.configService
      .get<string>('FIREBASE_SERVICE_ACCOUNT_JSON')
      ?.trim();
    if (inline) return { value: inline };

    const filePath = this.configService
      .get<string>('FIREBASE_SERVICE_ACCOUNT_FILE')
      ?.trim();
    if (!filePath) return undefined;
    if (!isAbsolute(filePath)) {
      return {
        error:
          'Direct FCM is misconfigured: FIREBASE_SERVICE_ACCOUNT_FILE must be an absolute path.',
      };
    }

    try {
      return { value: readFileSync(filePath, 'utf8') };
    } catch {
      return {
        error:
          'Direct FCM is misconfigured: the Firebase service-account file could not be read.',
      };
    }
  }

  private validateServiceAccount(
    candidate: FirebaseServiceAccount,
  ): JWTInput | null {
    const clientEmail = candidate.client_email?.trim();
    const privateKey = candidate.private_key?.replace(/\\n/g, '\n').trim();
    const projectId = candidate.project_id?.trim();

    if (!clientEmail || !privateKey || !projectId) return null;
    if (candidate.type && candidate.type !== 'service_account') return null;

    return {
      type: 'service_account',
      client_email: clientEmail,
      private_key: privateKey,
      project_id: projectId,
    };
  }

  private async getAccessToken() {
    if (!this.configuration.configured) {
      throw new FcmPushProviderError(this.configuration.error, false);
    }

    try {
      this.googleAuth ??= new GoogleAuth({
        credentials: this.configuration.credentials,
        projectId: this.configuration.projectId,
        scopes: [firebaseMessagingScope],
      });
      const token = await this.googleAuth.getAccessToken();
      if (!token) {
        throw new Error('Firebase returned no access token');
      }
      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const credentialFailure =
        /invalid_grant|invalid credential|invalid jwt|unauthorized|permission/i.test(
          message,
        );
      throw new FcmPushProviderError(
        credentialFailure
          ? 'Could not authenticate with the configured Firebase service account.'
          : 'Could not obtain an FCM access token.',
        !credentialFailure,
      );
    }
  }

  private serializeData(payload: Record<string, unknown> | null | undefined) {
    const data: Record<string, string> = {};
    for (const [key, value] of Object.entries(payload ?? {})) {
      if (
        !this.isSupportedDataKey(key) ||
        value === undefined ||
        value === null
      )
        continue;

      let normalized: string;
      if (typeof value === 'string') normalized = value;
      else if (typeof value === 'number' || typeof value === 'boolean') {
        normalized = String(value);
      } else {
        try {
          normalized = JSON.stringify(value);
        } catch {
          throw new FcmPushProviderError(
            'FCM notification data contains a value that cannot be serialized.',
            false,
          );
        }
      }
      data[key] = normalized;
    }

    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > maxFcmDataBytes) {
      throw new FcmPushProviderError(
        'FCM notification data is too large. Reduce the custom payload and retry.',
        false,
      );
    }
    return data;
  }

  private isSupportedDataKey(key: string) {
    return (
      key.length > 0 &&
      key.length <= 128 &&
      key !== 'from' &&
      key !== 'message_type' &&
      !key.startsWith('google.') &&
      !key.startsWith('gcm.')
    );
  }

  private async readResponse(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return {};
    }
  }

  private readMessageName(response: unknown) {
    if (
      response &&
      typeof response === 'object' &&
      'name' in response &&
      typeof response.name === 'string'
    ) {
      return response.name;
    }
    return null;
  }

  private toProviderError(httpStatus: number, response: unknown) {
    const error = this.readFcmError(response);
    const code = error?.details?.find(
      (detail) =>
        detail['@type'] ===
        'type.googleapis.com/google.firebase.fcm.v1.FcmError',
    )?.errorCode;
    const status = error?.status;

    if (code === 'UNREGISTERED') {
      return new FcmPushProviderError(
        'FCM device is no longer registered.',
        false,
        true,
      );
    }
    if (code === 'SENDER_ID_MISMATCH') {
      return new FcmPushProviderError(
        'The FCM token belongs to a different Firebase project.',
        false,
      );
    }
    if (code === 'THIRD_PARTY_AUTH_ERROR') {
      return new FcmPushProviderError(
        'Firebase rejected the Android push credentials.',
        false,
      );
    }
    if (code === 'INVALID_ARGUMENT') {
      return new FcmPushProviderError(
        'FCM rejected the notification payload or registration token.',
        false,
      );
    }

    const retryable =
      httpStatus === 408 ||
      httpStatus === 429 ||
      httpStatus >= 500 ||
      status === 'UNAVAILABLE' ||
      status === 'RESOURCE_EXHAUSTED';
    return new FcmPushProviderError(
      retryable
        ? 'FCM push provider is temporarily unavailable.'
        : `FCM push provider rejected the notification (HTTP ${httpStatus}).`,
      retryable,
    );
  }

  private readFcmError(response: unknown): FcmErrorResponse['error'] {
    if (
      response &&
      typeof response === 'object' &&
      'error' in response &&
      response.error &&
      typeof response.error === 'object'
    ) {
      return response.error;
    }
    return undefined;
  }
}
