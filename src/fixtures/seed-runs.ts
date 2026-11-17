import { TestCaseResult, TestCaseType, TestRunRecord } from '../types';

/**
 * Classifies a test case title into 'positive', 'negative', or 'edge'.
 * Prefers explicit [positive], [negative], [edge] (or @positive/@negative/@edge) markers,
 * with a clean keyword fallback if omitted.
 */
export function classifyTestCaseType(title: string): TestCaseType {
  const lower = title.toLowerCase();
  if (lower.includes('[edge]') || lower.includes('@edge')) return 'edge';
  if (lower.includes('[negative]') || lower.includes('@negative')) return 'negative';
  if (lower.includes('[positive]') || lower.includes('@positive')) return 'positive';

  if (/\b(edge|boundary|empty|zero|negative quantity|malformed|expired|non-existent|unsupported|404|409)\b/.test(lower)) {
    return 'edge';
  }
  if (/\b(reject|invalid|missing|unauthorized|unauthenticated|error|fail|400|401|403)\b/.test(lower)) {
    return 'negative';
  }
  return 'positive';
}

export function computeCaseBreakdown(cases: Array<{ caseType: TestCaseType }>) {
  return {
    positive: cases.filter((c) => c.caseType === 'positive').length,
    negative: cases.filter((c) => c.caseType === 'negative').length,
    edge: cases.filter((c) => c.caseType === 'edge').length,
  };
}

/**
 * Sample pre-seeded historical test runs so Test Control renders
 * immediate backend/frontend & Positive/Negative/Edge metrics on first launch.
 */
export function createSeedRunHistory(): TestRunRecord[] {
  const now = Date.now();
  const min = 60 * 1000;

  const authCases: TestCaseResult[] = [
    {
      suite: '[auth-service] OAuth 2.0 Authentication & Contract Tests',
      title: '[positive] should issue a valid Bearer token matching OAuthTokenContract via client_credentials',
      fullName: 'auth-service client_credentials positive test',
      caseType: 'positive',
      status: 'passed',
      durationMs: 145,
    },
    {
      suite: '[auth-service] OAuth 2.0 Authentication & Contract Tests',
      title: '[negative] should reject invalid client credentials with 401 and error contract',
      fullName: 'auth-service invalid client negative test',
      caseType: 'negative',
      status: 'passed',
      durationMs: 32,
    },
    {
      suite: '[auth-service] OAuth 2.0 Authentication & Contract Tests',
      title: '[edge] should reject unsupported grant_type with 400 error contract',
      fullName: 'auth-service unsupported grant edge test',
      caseType: 'edge',
      status: 'passed',
      durationMs: 28,
    },
  ];

  const orderCases: TestCaseResult[] = [
    {
      suite: '[orders-service] Cross-Service Order & Inventory Integration',
      title: '[positive] should create a user, place an order, satisfy OrderContract, and decrement product stock',
      fullName: 'orders-service order integration positive test',
      caseType: 'positive',
      status: 'passed',
      durationMs: 112,
    },
    {
      suite: '[orders-service] Cross-Service Order & Inventory Integration',
      title: '[negative] should reject an order with 409 when requested quantity exceeds available stock',
      fullName: 'orders-service insufficient stock negative test',
      caseType: 'negative',
      status: 'passed',
      durationMs: 41,
    },
    {
      suite: '[orders-service] Cross-Service Order & Inventory Integration',
      title: '[edge] should reject zero or negative order quantity with 400',
      fullName: 'orders-service zero quantity edge test',
      caseType: 'edge',
      status: 'passed',
      durationMs: 24,
    },
  ];

  const portalCases: TestCaseResult[] = [
    {
      suite: '[web-portal] Authentication E2E Flow',
      title: '[positive] should login successfully with valid credentials',
      fullName: 'web-portal login positive test',
      caseType: 'positive',
      status: 'passed',
      durationMs: 1640,
    },
    {
      suite: '[web-portal] Authentication E2E Flow',
      title: '[negative] should show error message for invalid credentials',
      fullName: 'web-portal invalid login negative test',
      caseType: 'negative',
      status: 'passed',
      durationMs: 920,
    },
    {
      suite: '[web-portal] Authentication E2E Flow',
      title: '[edge] should redirect unauthenticated /dashboard access back to /login',
      fullName: 'web-portal unauthenticated redirect edge test',
      caseType: 'edge',
      status: 'passed',
      durationMs: 480,
    },
  ];

  return [
    {
      id: 'seed-run-101',
      projectId: 'auth-service',
      environment: 'local',
      layer: 'backend-api',
      caseType: 'all',
      targetFile: 'src/projects/auth-service/auth-oauth.api.spec.ts',
      triggeredBy: 'seed',
      status: 'passed',
      startedAt: new Date(now - 90 * min).toISOString(),
      finishedAt: new Date(now - 90 * min + 1420).toISOString(),
      durationMs: 1420,
      summary: {
        total: authCases.length,
        passed: authCases.length,
        failed: 0,
        skipped: 0,
        byType: computeCaseBreakdown(authCases),
      },
      cases: authCases,
      logs: ['[seed] Jest auth-service API suite completed cleanly (3/3 passed).'],
      exitCode: 0,
    },
    {
      id: 'seed-run-102',
      projectId: 'orders-service',
      environment: 'local',
      layer: 'backend-integration',
      caseType: 'all',
      targetFile: 'src/projects/orders-service/orders.integration.spec.ts',
      triggeredBy: 'seed',
      status: 'passed',
      startedAt: new Date(now - 60 * min).toISOString(),
      finishedAt: new Date(now - 60 * min + 1890).toISOString(),
      durationMs: 1890,
      summary: {
        total: orderCases.length,
        passed: orderCases.length,
        failed: 0,
        skipped: 0,
        byType: computeCaseBreakdown(orderCases),
      },
      cases: orderCases,
      logs: ['[seed] Jest orders-service Integration suite completed cleanly (3/3 passed).'],
      exitCode: 0,
    },
    {
      id: 'seed-run-103',
      projectId: 'web-portal',
      environment: 'local',
      layer: 'frontend-e2e',
      caseType: 'all',
      targetFile: 'cypress/e2e/web-portal/login-flow.cy.ts',
      triggeredBy: 'seed',
      status: 'passed',
      startedAt: new Date(now - 30 * min).toISOString(),
      finishedAt: new Date(now - 30 * min + 4650).toISOString(),
      durationMs: 4650,
      summary: {
        total: portalCases.length,
        passed: portalCases.length,
        failed: 0,
        skipped: 0,
        byType: computeCaseBreakdown(portalCases),
      },
      cases: portalCases,
      logs: ['[seed] Cypress web-portal E2E suite completed cleanly (3/3 passed).'],
      exitCode: 0,
    },
  ];
}
