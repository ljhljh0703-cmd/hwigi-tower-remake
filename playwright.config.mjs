import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './smoke',
  globalSetup: './smoke/preview.mjs',
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list', { printSteps: true }]],
  workers: 1,
  use: {
    browserName: 'chromium',
    headless: true,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  },
  projects: [
    { name: '390×844', use: { viewport: { width: 390, height: 844 } } },
    { name: '320×568', use: { viewport: { width: 320, height: 568 } } },
  ],
})
