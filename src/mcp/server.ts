import readline from 'readline';
import config, {
  getSafeConfigSummary,
  listEnvironmentProfiles,
  loadProjectsRegistry,
} from '../config';
import { jenkinsClient } from '../dashboard/services/jenkinsClient';
import { runStore } from '../dashboard/services/runStore';
import { discoverTestSuites } from '../dashboard/services/testDiscovery';
import { testRunnerService } from '../dashboard/services/testRunner';
import { dummyDataStore } from '../fixtures/dummy-data';
import { TestCaseType, TestLayer } from '../types';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const SERVER_INFO = {
  name: 'sdet-test-framework-mcp',
  version: '2.0.0',
};

const TOOLS = [
  {
    name: 'list_test_suites',
    description:
      'Discover backend (API & Integration) and frontend (Cypress E2E) test suites, optionally filtered by projectId, layer, or tag.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Optional microservice/frontend project ID (e.g., auth-service, users-service, orders-service, web-portal).',
        },
        layer: {
          type: 'string',
          enum: ['all', 'backend-api', 'backend-integration', 'frontend-e2e'],
        },
        tag: {
          type: 'string',
          description: 'Optional tag filter (e.g., smoke, contract, regression).',
        },
        caseType: {
          type: 'string',
          enum: ['all', 'positive', 'negative', 'edge'],
          description: 'Filter test cases by classification (positive, negative, edge).',
        },
      },
    },
  },
  {
    name: 'run_tests',
    description:
      'Execute backend (Jest) or frontend (Cypress E2E) tests scoped by projectId, environment, and caseType, returning structured pass/fail diagnostics.',
    inputSchema: {
      type: 'object',
      required: ['layer'],
      properties: {
        layer: {
          type: 'string',
          enum: ['backend-api', 'backend-integration', 'frontend-e2e', 'all'],
        },
        projectId: {
          type: 'string',
          description: 'Optional project ID (defaults to all).',
        },
        environment: {
          type: 'string',
          enum: ['local', 'dev', 'qa', 'staging'],
          description: 'Target environment profile (defaults to active TEST_ENV).',
        },
        caseType: {
          type: 'string',
          enum: ['all', 'positive', 'negative', 'edge'],
          description: 'Optional filter to run only positive, negative, or edge cases.',
        },
        headed: {
          type: 'boolean',
          description: 'Run frontend Cypress tests in a visible headed browser for debugging.',
        },
        browser: {
          type: 'string',
          enum: ['chrome', 'electron'],
          description: 'Browser to use for Cypress runs (defaults to chrome in headed mode).',
        },
        targetFile: {
          type: 'string',
          description: 'Optional relative path to a single test file/spec.',
        },
      },
    },
  },
  {
    name: 'get_test_runs',
    description: 'Fetch recent test run summaries or detailed results for a specific runId.',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'trigger_jenkins_build',
    description:
      'Trigger a parameterized Jenkins pipeline build (or local Jenkins simulator) from the AI agent workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        environment: { type: 'string', enum: ['local', 'dev', 'qa', 'staging'] },
        testLayer: {
          type: 'string',
          enum: ['all', 'backend-api', 'backend-integration', 'frontend-e2e'],
        },
        tags: { type: 'string' },
        branch: { type: 'string' },
      },
    },
  },
  {
    name: 'get_jenkins_builds',
    description: 'Inspect Jenkins pipeline build history, stage status, and console logs.',
    inputSchema: {
      type: 'object',
      properties: {
        buildId: { type: 'string' },
      },
    },
  },
  {
    name: 'manage_dummy_data',
    description:
      'Inspect, reset, or seed the built-in dummy data store (users, products, orders, OAuth clients).',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['snapshot', 'reset', 'seed'] },
        count: { type: 'number' },
      },
    },
  },
  {
    name: 'get_environment_config',
    description: 'Return registered projects, environment profiles, and redacted OAuth/Jenkins configuration.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function sendMessage(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sendResult(id: string | number | null | undefined, result: unknown): void {
  if (id === undefined) return;
  sendMessage({ jsonrpc: '2.0', id, result });
}

function sendError(
  id: string | number | null | undefined,
  code: number,
  message: string
): void {
  if (id === undefined) return;
  sendMessage({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleDummyAction(action: string, count = 3) {
  const baseUrl = config.api.baseUrl;
  try {
    if (action === 'snapshot') {
      const r = await fetch(`${baseUrl}/api/test-utils/snapshot`);
      if (r.ok) return await r.json();
    } else if (action === 'reset') {
      const r = await fetch(`${baseUrl}/api/test-utils/reset`, { method: 'POST' });
      if (r.ok) return await r.json();
    } else if (action === 'seed') {
      const r = await fetch(`${baseUrl}/api/test-utils/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count }),
      });
      if (r.ok) return await r.json();
    }
  } catch {
    // Fallback to in-memory store
  }

  if (action === 'reset') return { message: 'Dummy data reset', snapshot: dummyDataStore.reset() };
  if (action === 'seed') {
    const created = dummyDataStore.seedAdditionalDummyUsers(count);
    return { created, snapshot: dummyDataStore.getSnapshot() };
  }
  return dummyDataStore.getSnapshot();
}

async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    if (name === 'list_test_suites') {
      const layer = args.layer && args.layer !== 'all' ? (args.layer as TestLayer) : undefined;
      const projectId = typeof args.projectId === 'string' ? args.projectId : undefined;
      const tag = typeof args.tag === 'string' ? args.tag : undefined;
      const caseType = typeof args.caseType === 'string' ? (args.caseType as TestCaseType | 'all') : 'all';
      const suites = discoverTestSuites({ projectId, layer, tag, caseType });
      return {
        content: [{ type: 'text', text: JSON.stringify({ suites }, null, 2) }],
      };
    }

    if (name === 'run_tests') {
      const layer = args.layer as TestLayer | 'all';
      const projectId = typeof args.projectId === 'string' ? args.projectId : undefined;
      const environment = typeof args.environment === 'string' ? args.environment : undefined;
      const caseType = typeof args.caseType === 'string' ? (args.caseType as TestCaseType | 'all') : 'all';
      const headed = typeof args.headed === 'boolean' ? args.headed : false;
      const browser =
        args.browser === 'chrome' || args.browser === 'electron' ? args.browser : undefined;
      const targetFile = typeof args.targetFile === 'string' ? args.targetFile : undefined;
      const run = await testRunnerService.runAndWait({
        projectId,
        environment,
        layer,
        caseType,
        headed,
        browser,
        targetFile,
        triggeredBy: 'ai-agent',
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                id: run.id,
                projectId: run.projectId,
                environment: run.environment,
                status: run.status,
                layer: run.layer,
                durationMs: run.durationMs,
                summary: run.summary,
                failedCases: run.cases.filter((c) => c.status === 'failed'),
                cases: run.cases,
              },
              null,
              2
            ),
          },
        ],
        isError: run.status !== 'passed',
      };
    }

    if (name === 'get_test_runs') {
      const runId = typeof args.runId === 'string' ? args.runId : undefined;
      if (runId) {
        const run = runStore.getRun(runId);
        return {
          content: [{ type: 'text', text: JSON.stringify(run || { error: 'Not found' }, null, 2) }],
        };
      }
      const limit = typeof args.limit === 'number' ? args.limit : 5;
      return {
        content: [{ type: 'text', text: JSON.stringify({ runs: runStore.listRuns().slice(0, limit) }, null, 2) }],
      };
    }

    if (name === 'trigger_jenkins_build') {
      const build = await jenkinsClient.triggerBuild({
        projectId: typeof args.projectId === 'string' ? args.projectId : undefined,
        environment: typeof args.environment === 'string' ? args.environment : undefined,
        testLayer: typeof args.testLayer === 'string' ? (args.testLayer as TestLayer | 'all') : 'all',
        tags: typeof args.tags === 'string' ? args.tags : undefined,
        branch: typeof args.branch === 'string' ? args.branch : undefined,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(build, null, 2) }],
      };
    }

    if (name === 'get_jenkins_builds') {
      const buildId = typeof args.buildId === 'string' ? args.buildId : undefined;
      if (buildId) {
        const build = jenkinsClient.getBuild(buildId);
        return {
          content: [{ type: 'text', text: JSON.stringify(build || { error: 'Not found' }, null, 2) }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ builds: jenkinsClient.listBuilds() }, null, 2) }],
      };
    }

    if (name === 'manage_dummy_data') {
      const action = String(args.action || 'snapshot');
      const count = typeof args.count === 'number' ? args.count : 3;
      const result = await handleDummyAction(action, count);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    if (name === 'get_environment_config') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                config: getSafeConfigSummary(),
                projects: loadProjectsRegistry(),
                environments: listEnvironmentProfiles(),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Tool execution failed: ${(err as Error).message}` }],
      isError: true,
    };
  }
}

async function handleRequest(req: JsonRpcRequest): Promise<void> {
  const { id, method, params } = req;

  if (method === 'initialize') {
    sendResult(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
    return;
  }

  if (method === 'notifications/initialized' || method === 'ping') {
    if (id !== undefined) sendResult(id, {});
    return;
  }

  if (method === 'tools/list') {
    sendResult(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    const toolName = String(params?.name || '');
    const args = (params?.arguments as Record<string, unknown>) || {};
    const result = await handleToolCall(toolName, args);
    sendResult(id, result);
    return;
  }

  if (id !== undefined) {
    sendError(id, -32601, `Method not found: ${method}`);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false,
});

console.error('[sdet-test-framework-mcp] MCP stdio server v2.0.0 listening...');

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const parsed = JSON.parse(trimmed) as JsonRpcRequest;
    void handleRequest(parsed);
  } catch (err) {
    console.error('[sdet-test-framework-mcp] Invalid JSON-RPC message:', err);
  }
});
