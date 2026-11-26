import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    retries: 1,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',

    use: {
        baseURL: 'http://localhost:3100',
        trace: 'on-first-retry',
        // Automatically capture a screenshot if a test fails
        screenshot: 'only-on-failure',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    webServer: {
        command: 'npm run start -- --port 3100',
        url: 'http://localhost:3100',
        reuseExistingServer: false,
        timeout: 120 * 1000,
    },
});
