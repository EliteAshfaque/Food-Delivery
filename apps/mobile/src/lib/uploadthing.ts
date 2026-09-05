import { generateReactNativeHelpers } from "@uploadthing/expo";
import type { UploadRouter } from "../../../api/src/uploadthing/upload-router";
import { getServerUrl } from "./api-config";
import { getToken } from "../../lib/auth";

const uploadUrl = `${getServerUrl()}/api/uploadthing`;

function isUploadThingRequest(input: RequestInfo | URL) {
  const requestUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  return requestUrl.startsWith(uploadUrl);
}

// The Expo helper also uses this fetch function to read a local photo. Only
// attach the bearer token to our API route, never to a picked file or an
// UploadThing storage URL.
async function authenticatedUploadFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  if (!isUploadThingRequest(input)) {
    return fetch(input, init);
  }

  const token = await getToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}

export const { useImageUploader, useDocumentUploader } =
  generateReactNativeHelpers<UploadRouter>({
    url: uploadUrl,
    fetch: authenticatedUploadFetch,
  });
