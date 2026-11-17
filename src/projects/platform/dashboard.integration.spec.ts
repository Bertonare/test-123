import request from 'supertest';
import { createDashboardApp } from '../../dashboard/server';

describe('[platform] SDET Dashboard, Multi-Env & Jenkins Integration @platform @integration', () => {
  const dashboardApp = createDashboardApp();

  it('[positive] GET /api/overview should return projects, environments, suites, and case breakdown', async () => {
    const res = await request(dashboardApp).get('/api/overview');

    expect(res.status).toBe(200);
    expect(res.body.metrics.totalProjects).toBeGreaterThanOrEqual(4);
    expect(res.body.metrics.totalSuites).toBeGreaterThanOrEqual(5);
    expect(res.body.metrics.caseBreakdown).toHaveProperty('positive');
    expect(res.body.metrics.caseBreakdown).toHaveProperty('negative');
    expect(res.body.metrics.caseBreakdown).toHaveProperty('edge');
    expect(Array.isArray(res.body.projects)).toBe(true);
    expect(Array.isArray(res.body.environments)).toBe(true);
    expect(res.body.jenkins).toHaveProperty('settings');
  });

  it('[positive] GET /api/suites should filter discovered suites by projectId, layer, and caseType', async () => {
    const res = await request(dashboardApp).get('/api/suites?projectId=users-service');
    expect(res.status).toBe(200);
    expect(res.body.suites.length).toBeGreaterThanOrEqual(1);
    expect(res.body.suites.every((s: { projectId: string }) => s.projectId === 'users-service')).toBe(
      true
    );

    const edgeRes = await request(dashboardApp).get('/api/suites?caseType=edge');
    expect(edgeRes.status).toBe(200);
    expect(edgeRes.body.suites.length).toBeGreaterThanOrEqual(1);
    expect(
      edgeRes.body.suites.every((s: { testCases: Array<{ caseType: string }> }) =>
        s.testCases.every((c) => c.caseType === 'edge')
      )
    ).toBe(true);
  });

  it('[positive] GET /api/environments should return local, dev, qa, and staging profiles', async () => {
    const res = await request(dashboardApp).get('/api/environments');
    expect(res.status).toBe(200);
    const names = res.body.environments.map((e: { name: string }) => e.name);
    expect(names).toEqual(expect.arrayContaining(['local', 'dev', 'qa', 'staging']));
  });

  it('[positive] POST /api/jenkins/test-connection & GET /api/jenkins/status should verify simulator connectivity', async () => {
    const connRes = await request(dashboardApp).post('/api/jenkins/test-connection');
    expect(connRes.status).toBe(200);
    expect(connRes.body.ok).toBe(true);

    const statusRes = await request(dashboardApp).get('/api/jenkins/status');
    expect(statusRes.status).toBe(200);
    expect(Array.isArray(statusRes.body.builds)).toBe(true);
    expect(statusRes.body.builds.length).toBeGreaterThanOrEqual(1);
  });

  it('[positive] POST /api/dummy-data/seed & reset should manage dummy entities cleanly', async () => {
    await request(dashboardApp).post('/api/dummy-data/reset').expect(200);

    const initialRes = await request(dashboardApp).get('/api/dummy-data').expect(200);
    const initialCount = initialRes.body.users.length;

    const seedRes = await request(dashboardApp)
      .post('/api/dummy-data/seed')
      .send({ count: 2 })
      .expect(201);
    expect(seedRes.body.snapshot.users.length).toBe(initialCount + 2);

    const resetRes = await request(dashboardApp).post('/api/dummy-data/reset').expect(200);
    expect(resetRes.body.snapshot.users.length).toBe(initialCount);
  });

  it('[positive] GET /api/agent/diagnostics should provide multi-project AI agent context', async () => {
    const res = await request(dashboardApp).get('/api/agent/diagnostics');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('promptSummary');
    expect(res.body.mcpConfig.mcpServers).toHaveProperty('sdet-test-framework');
  });

  it('[negative] POST /api/runs should reject invalid layer, browser, or unknown targetFile with 400', async () => {
    const badLayer = await request(dashboardApp)
      .post('/api/runs')
      .send({ layer: 'invalid-layer' });
    expect(badLayer.status).toBe(400);

    const badBrowser = await request(dashboardApp)
      .post('/api/runs')
      .send({ layer: 'frontend-e2e', headed: true, browser: 'safari' });
    expect(badBrowser.status).toBe(400);

    const badTarget = await request(dashboardApp)
      .post('/api/runs')
      .send({ layer: 'backend-api', targetFile: '../etc/passwd' });
    expect(badTarget.status).toBe(400);
  });

  it('[edge] GET /api/suites/:id/source and GET /api/runs/:id should return 404 for unknown IDs', async () => {
    await request(dashboardApp).get('/api/suites/unknown_suite_id/source').expect(404);
    await request(dashboardApp).get('/api/runs/run_does_not_exist').expect(404);
    await request(dashboardApp).get('/api/runs/run_does_not_exist/export?format=csv').expect(404);
  });

  it('[positive] GET /api/runs/:id/export and /api/runs/export should export JSON, CSV, and HTML reports', async () => {
    const runsRes = await request(dashboardApp).get('/api/runs').expect(200);
    const runId = runsRes.body.runs[0].id as string;

    const jsonExp = await request(dashboardApp).get(`/api/runs/${runId}/export?format=json`);
    expect(jsonExp.status).toBe(200);
    expect(jsonExp.headers['content-disposition']).toContain(`${runId}.json`);

    const csvExp = await request(dashboardApp).get(`/api/runs/${runId}/export?format=csv`);
    expect(csvExp.status).toBe(200);
    expect(csvExp.text).toContain('runId,projectId,environment,layer,caseType');

    const htmlExp = await request(dashboardApp).get(`/api/runs/${runId}/export?format=html`);
    expect(htmlExp.status).toBe(200);
    expect(htmlExp.text).toContain('Test Control — Execution Report');

    const allCsvExp = await request(dashboardApp).get('/api/runs/export?format=csv');
    expect(allCsvExp.status).toBe(200);
    expect(allCsvExp.text).toContain(runId);
  });

  it('[positive] POST /api/environments/health-check should check services and reject invalid env', async () => {
    const okRes = await request(dashboardApp)
      .post('/api/environments/health-check')
      .send({ environment: 'local' });
    expect(okRes.status).toBe(200);
    expect(okRes.body.environment).toBe('local');
    expect(Array.isArray(okRes.body.checks)).toBe(true);
    expect(okRes.body.checks.length).toBeGreaterThanOrEqual(4);

    const badRes = await request(dashboardApp)
      .post('/api/environments/health-check')
      .send({ environment: 'nonexistent-env' });
    expect(badRes.status).toBe(400);
  });
});
