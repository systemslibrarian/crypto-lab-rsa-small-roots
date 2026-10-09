import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',fullyParallel:false,workers:1,forbidOnly:!!process.env.CI,retries:0,timeout:60000,
  reporter:'list',use:{baseURL:'http://127.0.0.1:4218/crypto-lab-rsa-small-roots/',colorScheme:'dark',trace:'retain-on-failure'},
  webServer:{command:'npm run build && npm run preview -- --host 127.0.0.1 --port 4218 --strictPort',url:'http://127.0.0.1:4218/crypto-lab-rsa-small-roots/',reuseExistingServer:false,timeout:60000}
});
