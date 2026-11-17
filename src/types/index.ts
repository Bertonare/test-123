export type TestLayer = 'backend-api' | 'backend-integration' | 'frontend-e2e';

export type TestCaseType = 'positive' | 'negative' | 'edge';

export type TestRunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'cancelled';

export type EnvironmentName = 'local' | 'dev' | 'qa' | 'staging';

export interface CaseTypeBreakdown {
  positive: number;
  negative: number;
  edge: number;
}

export interface EnvironmentProfile {
  name: string;
  label: string;
  useDummyApp: boolean;
  timeoutMs: number;
  oauth: {
    tokenUrl: string;
    grantType: string;
  };
  services: Record<string, string>;
}

export interface ProjectDefinition {
  id: string;
  name: string;
  type: 'microservice' | 'frontend' | 'platform';
  owner: string;
  description: string;
  defaultLayer: TestLayer;
  jenkinsJob: string;
  testRoot: string;
  tags: string[];
}

export interface DummyUser {
  id: string;
  username: string;
  password?: string;
  name: string;
  email: string;
  role: 'admin' | 'sdet' | 'developer' | 'viewer';
  active: boolean;
  createdAt: string;
}

export interface DummyProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
}

export interface DummyOrder {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: string;
}

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
  name: string;
  scopes: string[];
}

export interface DummyDatabaseSnapshot {
  users: Omit<DummyUser, 'password'>[];
  products: DummyProduct[];
  orders: DummyOrder[];
  oauthClients: Array<{ clientId: string; name: string; scopes: string[] }>;
  lastResetAt: string;
}

export interface TestCaseInfo {
  id: string;
  suite: string;
  title: string;
  caseType: TestCaseType;
  line: number;
}

export interface TestSuiteInfo {
  id: string;
  name: string;
  filePath: string;
  projectId: string;
  layer: TestLayer;
  framework: 'jest' | 'cypress';
  tags: string[];
  description: string;
  caseBreakdown: CaseTypeBreakdown;
  testCases: TestCaseInfo[];
  lastStatus?: 'passed' | 'failed' | 'unknown';
  lastDurationMs?: number;
}

export interface TestCaseResult {
  suite: string;
  title: string;
  fullName: string;
  caseType: TestCaseType;
  status: 'passed' | 'failed' | 'pending' | 'skipped';
  durationMs: number;
  failureMessage?: string;
}

export interface TestRunRecord {
  id: string;
  projectId?: string;
  environment?: string;
  layer: TestLayer | 'all';
  caseType?: TestCaseType | 'all';
  headed?: boolean;
  browser?: 'electron' | 'chrome';
  keepOpen?: boolean;
  targetFile?: string;
  triggeredBy: 'dashboard' | 'cli' | 'ai-agent' | 'jenkins' | 'seed';
  status: TestRunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    byType?: CaseTypeBreakdown;
  };
  cases: TestCaseResult[];
  logs: string[];
  exitCode?: number;
}

export type JenkinsBuildResult = 'QUEUED' | 'BUILDING' | 'SUCCESS' | 'FAILURE' | 'ABORTED';

export interface JenkinsStage {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  durationMs?: number;
}

export interface JenkinsBuildRecord {
  id: string;
  jobName: string;
  buildNumber: number;
  mode: 'real' | 'simulator';
  parameters: {
    PROJECT: string;
    ENVIRONMENT: string;
    TEST_LAYER: string;
    CASE_TYPE?: string;
    TAGS: string;
    GIT_BRANCH: string;
  };
  result: JenkinsBuildResult;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  url: string;
  linkedRunId?: string;
  stages: JenkinsStage[];
  consoleLogs: string[];
}
