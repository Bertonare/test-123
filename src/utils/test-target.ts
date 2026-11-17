import http from 'http';
import { AddressInfo } from 'net';
import config, { getServiceBaseUrl, loadEnvironmentProfile } from '../config';
import { createDummyApp } from '../dummy-app/server';

export interface TestTargetHandle {
  baseUrl: string;
  tokenUrl: string;
  environment: string;
  serviceId: string;
  isEmbeddedDummy: boolean;
  close: () => Promise<void>;
}

/**
 * Resolves the target URL for Jest API/Integration suites scoped by microservice & environment.
 * When USE_DUMMY_APP is enabled for the active environment, boots an isolated in-process
 * Dummy Target App on an ephemeral port so tests execute deterministically without external servers.
 */
export async function setupTestTarget(
  serviceId = 'users-service',
  envName?: string
): Promise<TestTargetHandle> {
  const envProfile = loadEnvironmentProfile(envName);
  const useDummy =
    process.env.USE_DUMMY_APP !== undefined
      ? process.env.USE_DUMMY_APP !== 'false'
      : envProfile.useDummyApp;

  if (!useDummy) {
    return {
      baseUrl: getServiceBaseUrl(serviceId, envProfile.name),
      tokenUrl: process.env.OAUTH_TOKEN_URL || envProfile.oauth.tokenUrl,
      environment: envProfile.name,
      serviceId,
      isEmbeddedDummy: false,
      close: async () => {},
    };
  }

  const app = createDummyApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    tokenUrl: `${baseUrl}/oauth/token`,
    environment: envProfile.name,
    serviceId,
    isEmbeddedDummy: true,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
