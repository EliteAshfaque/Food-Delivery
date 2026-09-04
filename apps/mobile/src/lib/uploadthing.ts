import { generateReactNativeHelpers } from '@uploadthing/expo';
import type { UploadRouter } from '../../../api/src/uploadthing/upload-router';
import { getServerUrl } from './api-config';

export const { useImageUploader, useDocumentUploader } =
  generateReactNativeHelpers<UploadRouter>({
    url: `${getServerUrl()}/api/uploadthing`,
  });
