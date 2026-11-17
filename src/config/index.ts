import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { EnvironmentProfile, ProjectDefinition } from '../types';
import { EnvironmentProfileSchema, ProjectsRegistrySchema } from './schemas';

dotenv.config();

const ROOT_DIR = process.cwd();
const ENV_DIR = path.resolve(ROOT_DIR, 'config/environments');
const PROJECTS_FILE = path.resolve(ROOT_DIR, 'config/projects.json');

export function loadEnvironmentProfile(envName?: string): EnvironmentProfile {
  const activeName = envName || process.env.TEST_ENV || 'local';
  const filePath = path.join(ENV_DIR, `${activeName}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Environment config not found for "${activeName}" at ${filePath}`);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return EnvironmentProfileSchema.parse(raw);
}

export function listEnvironmentProfiles(): EnvironmentProfile[] {
  if (!fs.existsSync(ENV_DIR)) return [];
  return fs
    .readdirSync(ENV_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => loadEnvironmentProfile(f.replace(/\.json$/, '')));
}

export function loadProjectsRegistry(): ProjectDefinition[] {
  if (!fs.existsSync(PROJECTS_FILE)) return [];
  const raw = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
  return ProjectsRegistrySchema.parse(raw).projects;
}

const activeEnv = loadEnvironmentProfile();
const dummyAppPort = parseInt(process.env.DUMMY_APP_PORT || '3000', 10);
const dashboardPort = parseInt(process.env.DASHBOARD_PORT || '4000', 10);
const useDummyApp =
  process.env.USE_DUMMY_APP !== undefined
    ? process.env.USE_DUMMY_APP !== 'false'
    : activeEnv.useDummyApp;

/**
 * Strongly-typed, multi-environment & multi-project configuration.
 */
export const config = {
  environment: activeEnv.name,
  environmentLabel: activeEnv.label,
  useDummyApp,
  ports: {
    dummyApp: dummyAppPort,
    dashboard: dashboardPort,
  },
  api: {
    baseUrl:
      process.env.BASE_URL ||
      activeEnv.services['users-service'] ||
      `http://localhost:${dummyAppPort}`,
    timeout: parseInt(process.env.API_TIMEOUT || String(activeEnv.timeoutMs), 10),
  },
  oauth: {
    tokenUrl: process.env.OAUTH_TOKEN_URL || activeEnv.oauth.tokenUrl,
    clientId: process.env.OAUTH_CLIENT_ID || 'demo-client-id',
    clientSecret: process.env.OAUTH_CLIENT_SECRET || 'demo-client-secret',
    grantType: process.env.OAUTH_GRANT_TYPE || activeEnv.oauth.grantType,
  },
  cypress: {
    baseUrl:
      process.env.CYPRESS_BASE_URL ||
      activeEnv.services['web-portal'] ||
      `http://localhost:${dummyAppPort}`,
    username: process.env.CYPRESS_USERNAME || 'admin',
    password: process.env.CYPRESS_PASSWORD || 'password',
  },
  jenkins: {
    url: process.env.JENKINS_URL || '',
    user: process.env.JENKINS_USER || '',
    apiToken: process.env.JENKINS_API_TOKEN || '',
    defaultJob: process.env.JENKINS_JOB_NAME || 'sdet-test-framework',
    useMock:
      process.env.JENKINS_MOCK === 'true' ||
      !process.env.JENKINS_URL ||
      !process.env.JENKINS_USER ||
      !process.env.JENKINS_API_TOKEN,
  },
  services: activeEnv.services,
  isDevelopment: process.env.NODE_ENV !== 'production',
};

export function getServiceBaseUrl(serviceId: string, envName?: string): string {
  const profile = envName ? loadEnvironmentProfile(envName) : activeEnv;
  return profile.services[serviceId] || config.api.baseUrl;
}

export function getSafeConfigSummary() {
  return {
    environment: config.environment,
    environmentLabel: config.environmentLabel,
    availableEnvironments: listEnvironmentProfiles().map((e) => ({
      name: e.name,
      label: e.label,
      useDummyApp: e.useDummyApp,
    })),
    useDummyApp: config.useDummyApp,
    ports: config.ports,
    api: config.api,
    services: config.services,
    oauth: {
      tokenUrl: config.oauth.tokenUrl,
      clientId: config.oauth.clientId,
      clientSecretConfigured: Boolean(config.oauth.clientSecret),
      grantType: config.oauth.grantType,
    },
    cypress: {
      baseUrl: config.cypress.baseUrl,
      username: config.cypress.username,
      passwordConfigured: Boolean(config.cypress.password),
    },
    jenkins: {
      configured: !config.jenkins.useMock,
      mode: config.jenkins.useMock ? 'simulator' : 'real',
      url: config.jenkins.url || 'http://localhost:8080 (simulator)',
      defaultJob: config.jenkins.defaultJob,
    },
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

export default config;
