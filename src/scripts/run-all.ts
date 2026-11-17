import { testRunnerService } from '../dashboard/services/testRunner';
import { TestCaseType, TestLayer } from '../types';

function readArg(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return hit ? hit.slice(prefix.length + 1) : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag) || readArg(flag) === 'true';
}

async function main() {
  const projectId = readArg('--project');
  const environment = readArg('--env');
  const tags = readArg('--tags');
  const caseType = (readArg('--caseType') as TestCaseType | 'all') || 'all';
  const layer = (readArg('--layer') as TestLayer | 'all') || 'all';
  const headed = hasFlag('--headed');
  const keepOpen = hasFlag('--keepOpen');
  const browserArg = readArg('--browser');
  const browser = browserArg === 'electron' || browserArg === 'chrome' ? browserArg : undefined;

  console.log(
    `[SDET Runner] Executing pipeline [project=${projectId || 'all'}, env=${environment || 'default'}, layer=${layer}, caseType=${caseType}${headed ? `, headed=${browser || 'chrome'}` : ''}${tags ? `, tags=${tags}` : ''}]...`
  );

  const run = await testRunnerService.runAndWait({
    projectId,
    environment,
    layer,
    caseType,
    headed,
    browser,
    keepOpen,
    tags,
    triggeredBy: 'cli',
  });

  console.log('\n=== Execution Summary ===');
  console.log(
    JSON.stringify(
      {
        id: run.id,
        projectId: run.projectId,
        environment: run.environment,
        status: run.status,
        durationMs: run.durationMs,
        summary: run.summary,
        failedCases: run.cases.filter((c) => c.status === 'failed'),
      },
      null,
      2
    )
  );

  process.exit(run.status === 'passed' ? 0 : 1);
}

void main();
