import fs from 'fs';
import path from 'path';
import config from '../../config';
import { JenkinsBuildRecord, JenkinsStage, TestCaseType, TestLayer } from '../../types';
import { testRunnerService } from './testRunner';

const JENKINS_HISTORY_FILE = path.resolve(process.cwd(), 'reports/jenkins-builds.json');
const MAX_BUILDS = 30;

export interface JenkinsRuntimeSettings {
  url: string;
  user: string;
  apiToken: string;
  defaultJob: string;
  useMock: boolean;
}

export class JenkinsClientService {
  private settings: JenkinsRuntimeSettings = {
    url: config.jenkins.url,
    user: config.jenkins.user,
    apiToken: config.jenkins.apiToken,
    defaultJob: config.jenkins.defaultJob,
    useMock: config.jenkins.useMock,
  };

  getSettingsSummary() {
    return {
      mode: this.settings.useMock ? 'simulator' : 'real',
      url: this.settings.url || 'http://localhost:8080 (built-in simulator)',
      user: this.settings.user || 'jenkins-bot',
      tokenConfigured: Boolean(this.settings.apiToken),
      defaultJob: this.settings.defaultJob,
    };
  }

  updateSettings(input: Partial<JenkinsRuntimeSettings>) {
    if (input.url !== undefined) this.settings.url = input.url.trim().replace(/\/$/, '');
    if (input.user !== undefined) this.settings.user = input.user.trim();
    if (input.apiToken !== undefined) this.settings.apiToken = input.apiToken.trim();
    if (input.defaultJob !== undefined && input.defaultJob.trim()) {
      this.settings.defaultJob = input.defaultJob.trim();
    }
    if (input.useMock !== undefined) {
      this.settings.useMock = Boolean(input.useMock);
    } else if (this.settings.url && this.settings.user && this.settings.apiToken) {
      this.settings.useMock = false;
    }
    return this.getSettingsSummary();
  }

  private ensureStore(): void {
    const dir = path.dirname(JENKINS_HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(JENKINS_HISTORY_FILE)) {
      const now = Date.now();
      const seedBuilds: JenkinsBuildRecord[] = [
        {
          id: 'jkb-seed-42',
          jobName: this.settings.defaultJob,
          buildNumber: 42,
          mode: 'simulator',
          parameters: {
            PROJECT: 'all',
            ENVIRONMENT: 'local',
            TEST_LAYER: 'all',
            TAGS: 'smoke',
            GIT_BRANCH: 'main',
          },
          result: 'SUCCESS',
          startedAt: new Date(now - 45 * 60 * 1000).toISOString(),
          finishedAt: new Date(now - 44 * 60 * 1000).toISOString(),
          durationMs: 54200,
          url: '#jenkins-build-42',
          stages: [
            { name: 'Checkout', status: 'passed', durationMs: 850 },
            { name: 'Build & Typecheck', status: 'passed', durationMs: 3200 },
            { name: 'Run Tests (all)', status: 'passed', durationMs: 49200 },
            { name: 'Publish JUnit Reports', status: 'passed', durationMs: 950 },
          ],
          consoleLogs: [
            '[Jenkins] Started by Dashboard trigger (seed demo build #42)',
            '[Pipeline] stage (Checkout) -> SUCCESS',
            '[Pipeline] stage (Build & Typecheck) -> SUCCESS',
            '[Pipeline] stage (Run Tests) -> SUCCESS',
            '[Pipeline] junit reports/junit/*.xml, reports/cypress/*.xml -> Archived',
            'Finished: SUCCESS',
          ],
        },
      ];
      fs.writeFileSync(JENKINS_HISTORY_FILE, JSON.stringify(seedBuilds, null, 2), 'utf8');
    }
  }

  listBuilds(): JenkinsBuildRecord[] {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(JENKINS_HISTORY_FILE, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  getBuild(id: string): JenkinsBuildRecord | undefined {
    return this.listBuilds().find((b) => b.id === id);
  }

  private upsertBuild(record: JenkinsBuildRecord): JenkinsBuildRecord {
    const builds = this.listBuilds();
    const idx = builds.findIndex((b) => b.id === record.id);
    if (idx >= 0) {
      builds[idx] = record;
    } else {
      builds.unshift(record);
    }
    fs.writeFileSync(
      JENKINS_HISTORY_FILE,
      JSON.stringify(builds.slice(0, MAX_BUILDS), null, 2),
      'utf8'
    );
    return record;
  }

  private getAuthHeader(): string {
    const token = Buffer.from(`${this.settings.user}:${this.settings.apiToken}`).toString('base64');
    return `Basic ${token}`;
  }

  async testConnection(): Promise<{ ok: boolean; mode: string; message: string; version?: string }> {
    if (this.settings.useMock || !this.settings.url) {
      return {
        ok: true,
        mode: 'simulator',
        message: 'Jenkins Pipeline Simulator active (executes real local test suites cleanly).',
      };
    }

    try {
      const res = await fetch(`${this.settings.url}/api/json`, {
        headers: { Authorization: this.getAuthHeader() },
      });
      if (!res.ok) {
        return {
          ok: false,
          mode: 'real',
          message: `Jenkins returned HTTP ${res.status}`,
        };
      }
      const version = res.headers.get('x-jenkins') || 'unknown';
      return {
        ok: true,
        mode: 'real',
        version,
        message: `Connected to Jenkins ${version} at ${this.settings.url}`,
      };
    } catch (err) {
      return {
        ok: false,
        mode: 'real',
        message: `Connection failed: ${(err as Error).message}`,
      };
    }
  }

  async triggerBuild(params: {
    projectId?: string;
    environment?: string;
    testLayer?: TestLayer | 'all';
    caseType?: TestCaseType | 'all';
    tags?: string;
    branch?: string;
    jobName?: string;
  }): Promise<JenkinsBuildRecord> {
    const existing = this.listBuilds();
    const nextNumber = existing.length > 0 ? Math.max(...existing.map((b) => b.buildNumber)) + 1 : 1;
    const jobName = params.jobName || this.settings.defaultJob;
    const buildParams = {
      PROJECT: params.projectId || 'all',
      ENVIRONMENT: params.environment || config.environment,
      TEST_LAYER: params.testLayer || 'all',
      CASE_TYPE: params.caseType || 'all',
      TAGS: params.tags || '',
      GIT_BRANCH: params.branch || 'main',
    };

    if (!this.settings.useMock && this.settings.url) {
      return this.triggerRealJenkinsBuild(jobName, nextNumber, buildParams);
    }

    const buildId = `jkb-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const record: JenkinsBuildRecord = {
      id: buildId,
      jobName,
      buildNumber: nextNumber,
      mode: 'simulator',
      parameters: buildParams,
      result: 'BUILDING',
      startedAt: new Date().toISOString(),
      url: `#jenkins-build-${nextNumber}`,
      stages: [
        { name: 'Checkout', status: 'running' },
        { name: 'Build & Typecheck', status: 'pending' },
        { name: `Run Tests (${buildParams.TEST_LAYER})`, status: 'pending' },
        { name: 'Publish JUnit Reports', status: 'pending' },
      ],
      consoleLogs: [
        `[Jenkins] Triggered job "${jobName}" #${nextNumber} via Dashboard`,
        `[Jenkins] Parameters: PROJECT=${buildParams.PROJECT}, ENVIRONMENT=${buildParams.ENVIRONMENT}, TEST_LAYER=${buildParams.TEST_LAYER}, GIT_BRANCH=${buildParams.GIT_BRANCH}`,
        `[Pipeline] Start of Pipeline`,
        `[Pipeline] stage (Checkout)`,
      ],
    };

    this.upsertBuild(record);
    void this.runSimulatedPipeline(record);
    return record;
  }

  private async runSimulatedPipeline(record: JenkinsBuildRecord): Promise<void> {
    const startMs = Date.now();
    const appendConsole = (line: string) => {
      record.consoleLogs.push(line);
      if (record.consoleLogs.length > 400) {
        record.consoleLogs = record.consoleLogs.slice(-400);
      }
      this.upsertBuild(record);
    };

    const setStage = (idx: number, status: JenkinsStage['status'], durationMs?: number) => {
      if (record.stages[idx]) {
        record.stages[idx].status = status;
        if (durationMs !== undefined) record.stages[idx].durationMs = durationMs;
      }
      this.upsertBuild(record);
    };

    try {
      // Stage 1: Checkout
      await new Promise((r) => setTimeout(r, 250));
      setStage(0, 'passed', 250);
      appendConsole(`[Git] Checked out branch '${record.parameters.GIT_BRANCH}'`);

      // Stage 2: Build & Config Validation
      setStage(1, 'running');
      appendConsole(`[Pipeline] stage (Build & Typecheck)`);
      await new Promise((r) => setTimeout(r, 250));
      setStage(1, 'passed', 250);
      appendConsole(`[Config] Validated environment '${record.parameters.ENVIRONMENT}' & project '${record.parameters.PROJECT}'`);

      // Stage 3: Execute Real Tests
      setStage(2, 'running');
      appendConsole(`[Pipeline] stage (Run Tests (${record.parameters.TEST_LAYER}))`);
      const testStart = Date.now();
      const layerParam = (
        ['backend-api', 'backend-integration', 'frontend-e2e', 'all'].includes(
          record.parameters.TEST_LAYER
        )
          ? record.parameters.TEST_LAYER
          : 'all'
      ) as TestLayer | 'all';

      const caseTypeParam = (
        ['positive', 'negative', 'edge', 'all'].includes(record.parameters.CASE_TYPE || '')
          ? record.parameters.CASE_TYPE
          : 'all'
      ) as TestCaseType | 'all';

      const run = await testRunnerService.runAndWait({
        projectId: record.parameters.PROJECT === 'all' ? undefined : record.parameters.PROJECT,
        environment: record.parameters.ENVIRONMENT,
        layer: layerParam,
        caseType: caseTypeParam,
        tags: record.parameters.TAGS || undefined,
        triggeredBy: 'jenkins',
      });

      record.linkedRunId = run.id;
      const testDur = Date.now() - testStart;
      for (const l of run.logs.slice(-30)) {
        record.consoleLogs.push(`  ${l}`);
      }

      if (run.status === 'passed') {
        setStage(2, 'passed', testDur);
        setStage(3, 'running');
        appendConsole(`[Pipeline] stage (Publish JUnit Reports)`);
        appendConsole(`[JUnit] Recording test results (${run.summary.passed}/${run.summary.total} passed)`);
        setStage(3, 'passed', 120);
        record.result = 'SUCCESS';
      } else {
        setStage(2, 'failed', testDur);
        setStage(3, 'passed', 100);
        appendConsole(`[JUnit] Failures detected (${run.summary.failed} failed)`);
        record.result = 'FAILURE';
      }
    } catch (err) {
      record.result = 'FAILURE';
      appendConsole(`[ERROR] Pipeline failed: ${(err as Error).message}`);
    } finally {
      record.finishedAt = new Date().toISOString();
      record.durationMs = Date.now() - startMs;
      appendConsole(`Finished: ${record.result}`);
      this.upsertBuild(record);
    }
  }

  private async triggerRealJenkinsBuild(
    jobName: string,
    fallbackNumber: number,
    buildParams: JenkinsBuildRecord['parameters']
  ): Promise<JenkinsBuildRecord> {
    const authHeader = this.getAuthHeader();
    const headers: Record<string, string> = { Authorization: authHeader };

    try {
      const crumbRes = await fetch(`${this.settings.url}/crumbIssuer/api/json`, { headers });
      if (crumbRes.ok) {
        const crumbJson = (await crumbRes.json()) as { crumbRequestField: string; crumb: string };
        headers[crumbJson.crumbRequestField] = crumbJson.crumb;
      }
    } catch {
      // Crumb issuer may be disabled on some Jenkins setups
    }

    const qs = new URLSearchParams(buildParams).toString();
    const triggerRes = await fetch(
      `${this.settings.url}/job/${encodeURIComponent(jobName)}/buildWithParameters?${qs}`,
      { method: 'POST', headers }
    );

    if (!triggerRes.ok && triggerRes.status !== 201) {
      throw new Error(`Failed to trigger Jenkins job "${jobName}" (HTTP ${triggerRes.status})`);
    }

    const queueUrl = triggerRes.headers.get('location') || '';
    const buildId = `jkb-real-${Date.now()}`;
    const record: JenkinsBuildRecord = {
      id: buildId,
      jobName,
      buildNumber: fallbackNumber,
      mode: 'real',
      parameters: buildParams,
      result: 'QUEUED',
      startedAt: new Date().toISOString(),
      url: queueUrl || `${this.settings.url}/job/${encodeURIComponent(jobName)}/`,
      stages: [
        { name: 'Jenkins Queue', status: 'running' },
        { name: 'Pipeline Execution', status: 'pending' },
      ],
      consoleLogs: [
        `[Jenkins] Triggered real Jenkins job "${jobName}"`,
        `[Jenkins] Queue URL: ${queueUrl || 'dispatched'}`,
      ],
    };

    return this.upsertBuild(record);
  }

  async syncRealBuild(buildId: string): Promise<JenkinsBuildRecord | undefined> {
    const build = this.getBuild(buildId);
    if (!build || build.mode !== 'real' || !this.settings.url) return build;

    const authHeader = this.getAuthHeader();
    try {
      const jobApi = await fetch(
        `${this.settings.url}/job/${encodeURIComponent(build.jobName)}/lastBuild/api/json`,
        { headers: { Authorization: authHeader } }
      );
      if (jobApi.ok) {
        const data = (await jobApi.json()) as {
          number: number;
          building: boolean;
          result: string | null;
          duration: number;
          url: string;
        };
        build.buildNumber = data.number;
        build.url = data.url;
        build.durationMs = data.duration;
        build.result = data.building
          ? 'BUILDING'
          : data.result === 'SUCCESS'
            ? 'SUCCESS'
            : data.result === 'ABORTED'
              ? 'ABORTED'
              : 'FAILURE';
        build.stages = [
          { name: 'Jenkins Queue', status: 'passed' },
          {
            name: 'Pipeline Execution',
            status: data.building ? 'running' : build.result === 'SUCCESS' ? 'passed' : 'failed',
            durationMs: data.duration,
          },
        ];

        const consoleRes = await fetch(
          `${this.settings.url}/job/${encodeURIComponent(build.jobName)}/${data.number}/consoleText`,
          { headers: { Authorization: authHeader } }
        );
        if (consoleRes.ok) {
          const text = await consoleRes.text();
          build.consoleLogs = text.split(/\r?\n/).slice(-250);
        }
        if (!data.building) {
          build.finishedAt = new Date().toISOString();
        }
        this.upsertBuild(build);
      }
    } catch (err) {
      build.consoleLogs.push(`[warn] Jenkins sync failed: ${(err as Error).message}`);
      this.upsertBuild(build);
    }
    return build;
  }
}

export const jenkinsClient = new JenkinsClientService();
