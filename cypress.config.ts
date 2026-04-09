import { defineConfig } from 'cypress';
import * as dotenv from 'dotenv';

// Load environment variables for Cypress
dotenv.config();

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
    chromeWebSecurity: false,
    reporter: 'junit',
    reporterOptions: {
      mochaFile: 'reports/cypress/junit-[hash].xml',
      toConsole: true,
    },
    setupNodeEvents(on, config) {
      // Implement node event listeners here
      config.env = {
        ...config.env,
        username: process.env.CYPRESS_USERNAME,
        password: process.env.CYPRESS_PASSWORD,
      };
      return config;
    },
  },
});
