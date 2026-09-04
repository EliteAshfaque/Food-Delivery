import { generateReactNativeHelpers } from '@uploadthing/expo';
import type { UploadRouter } from '../../../api/src/uploadthing/upload-router';

export const { useImageUploader, useDocumentUploader } =
  generateReactNativeHelpers<UploadRouter>({
    url: `${process.env.EXPO_PUBLIC_SERVER_URL}/api/uploadthing`,
  });
