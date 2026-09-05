import { create } from 'axios';

import { getToken } from '../../lib/auth';
import { getApiUrl } from './api-config';

export const api = create({
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  config.baseURL = getApiUrl();
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
