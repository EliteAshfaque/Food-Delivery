import { genUploader } from 'uploadthing/client';

const SESSION_TOKEN_KEY = 'wasil.admin.session-token';

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() || '/api';
const apiBaseUrl = configuredApiUrl.replace(/\/$/, '');

/** Same UploadThing mount used by the Nest API and mobile owner app. */
export const uploadthingUrl = `${apiBaseUrl}/uploadthing`;

function readAdminToken() {
  try {
    return window.sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

// The admin portal shares Nest UploadThing routes. Full FileRouter typing
// lives in apps/api; keep this client loosely typed to avoid pulling Nest
// modules into the Vite bundle.
const { uploadFiles } = genUploader({
  url: uploadthingUrl,
});

async function uploadViaRoute(
  endpoint: 'restaurantImage' | 'menuItemImage',
  file: File,
  restaurantId?: string,
) {
  const token = readAdminToken();
  if (!token) {
    throw new Error('Sign in again before uploading images.');
  }

  const results = await uploadFiles(endpoint, {
    files: [file],
    ...({
      input: restaurantId ? { restaurantId } : {},
    } as object),
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const uploaded = results[0] as
    | { ufsUrl?: string; url?: string }
    | undefined;
  const url = uploaded?.ufsUrl ?? uploaded?.url;
  if (!url) {
    throw new Error('Upload completed without an image URL.');
  }
  return url;
}

/** Restaurant cover image via shared `restaurantImage` route. */
export async function uploadRestaurantImage(
  file: File,
  restaurantId?: string,
) {
  return uploadViaRoute('restaurantImage', file, restaurantId);
}

/** Menu item photo via shared `menuItemImage` route. */
export async function uploadMenuItemImage(file: File, restaurantId: string) {
  return uploadViaRoute('menuItemImage', file, restaurantId);
}
