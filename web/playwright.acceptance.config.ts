import { defineConfig } from '@playwright/test';
if (!/^sda_acceptance_[0-9a-f]+$/.test(process.env.SDA_ACCEPTANCE_DATABASE || '')) {
  throw new Error(
    'Run backend/tools/test-browser-acceptance.sh to provision an isolated database.',
  );
}
export default defineConfig({
  testDir: './tests/acceptance',
  workers: 1,
  retries: 0,
  timeout: 120000,
  reporter: [['list']],
  outputDir: 'test-results/acceptance',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    actionTimeout: 15000,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5174',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    env: { PROPERTY_API_PROXY_TARGET: 'http://127.0.0.1:8082' },
  },
});
