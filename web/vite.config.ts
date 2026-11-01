import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.PROPERTY_API_PROXY_TARGET || 'http://127.0.0.1:8081';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api/v1': { target }, '/storage': { target } },
    },
    preview: { port: 4173, strictPort: true },
  };
});
