import { defineConfig } from 'cypress';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

function resolveEnvironmentBaseUrl(): string {
  if (process.env.CYPRESS_BASE_URL) {
    return process.env.CYPRESS_BASE_URL;
  }
  const envName = process.env.TEST_ENV || 'local';
  const envPath = path.resolve(process.cwd(), 'config/environments', `${envName}.json`);
  if (fs.existsSync(envPath)) {
    const parsed = JSON.parse(fs.readFileSync(envPath, 'utf8'));
    if (parsed?.services?.['web-portal']) {
      return parsed.services['web-portal'];
    }
  }
  const dummyPort = process.env.DUMMY_APP_PORT || '3000';
  return `http://localhost:${dummyPort}`;
}

export default defineConfig({
  e2e: {
    baseUrl: resolveEnvironmentBaseUrl(),
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
    chromeWebSecurity: false,
    reporter: 'mocha-junit-reporter',
    reporterOptions: {
      mochaFile: 'reports/cypress/junit-[hash].xml',
      toConsole: false,
    },
    setupNodeEvents(on, config) {
      config.env = {
        ...config.env,
        testEnv: process.env.TEST_ENV || 'local',
        username: process.env.CYPRESS_USERNAME || 'admin',
        password: process.env.CYPRESS_PASSWORD || 'password',
      };

      on('after:run', (results) => {
        const outputPath = process.env.CYPRESS_JSON_OUTPUT;
        if (!outputPath || !results || !('runs' in results)) return;

        const cases: Array<{
          suite: string;
          title: string;
          fullName: string;
          status: 'passed' | 'failed' | 'skipped';
          durationMs: number;
          failureMessage?: string;
        }> = [];

        for (const run of results.runs) {
          const specName = run.spec?.relative || 'cypress-spec';
          for (const test of run.tests || []) {
            const titleParts = Array.isArray(test.title) ? test.title : [String(test.title)];
            const suite = titleParts.length > 1 ? titleParts.slice(0, -1).join(' > ') : specName;
            const title = titleParts[titleParts.length - 1] || specName;
            const status =
              test.state === 'passed' ? 'passed' : test.state === 'failed' ? 'failed' : 'skipped';

            cases.push({
              suite,
              title,
              fullName: titleParts.join(' '),
              status,
              durationMs: test.duration || 0,
              failureMessage: test.displayError || undefined,
            });
          }
        }

        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(
          outputPath,
          JSON.stringify(
            {
              summary: {
                total: cases.length,
                passed: cases.filter((c) => c.status === 'passed').length,
                failed: cases.filter((c) => c.status === 'failed').length,
                skipped: cases.filter((c) => c.status === 'skipped').length,
              },
              cases,
            },
            null,
            2
          ),
          'utf8'
        );
      });

      return config;
    },
  },
});
