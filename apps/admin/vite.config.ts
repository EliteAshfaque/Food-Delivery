import { defineConfig } from 'vite';

/**
 * The API itself remains the only authentication/authorization authority.
 * This small proxy makes local browser development work without weakening the
 * production CORS allow-list.
 */
export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
