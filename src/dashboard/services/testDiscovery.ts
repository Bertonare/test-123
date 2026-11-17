import fs from 'fs';
import path from 'path';
import { loadProjectsRegistry } from '../../config';
import { classifyTestCaseType, computeCaseBreakdown } from '../../fixtures/seed-runs';
import { TestCaseInfo, TestCaseType, TestLayer, TestSuiteInfo } from '../../types';
import { runStore } from './runStore';

function parseTestCasesFromSource(content: string): TestCaseInfo[] {
  const lines = content.split(/\r?\n/);
  const cases: TestCaseInfo[] = [];
  let currentSuite = 'Default Suite';

  lines.forEach((line, idx) => {
    const describeMatch = line.match(/describe\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (describeMatch) {
      currentSuite = describeMatch[1];
    }

    const itMatch = line.match(/\b(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (itMatch) {
      const title = itMatch[1];
      cases.push({
        id: `case-${idx + 1}`,
        suite: currentSuite,
        title,
        caseType: classifyTestCaseType(title),
        line: idx + 1,
      });
    }
  });

  return cases;
}

function extractTags(content: string, fallbackTags: string[]): string[] {
  const unique = new Set<string>(fallbackTags);
  for (const line of content.split(/\r?\n/)) {
    if (line.includes('describe(') || line.trim().startsWith('//') || line.trim().startsWith('*')) {
      const matches = line.match(/(?:^|\s)@([a-zA-Z0-9_-]+)/g) || [];
      for (const m of matches) {
        unique.add(m.trim().slice(1));
      }
    }
  }
  return Array.from(unique);
}

function inferLayer(filePath: string, defaultLayer: TestLayer): TestLayer {
  if (filePath.endsWith('.cy.ts')) return 'frontend-e2e';
  if (filePath.includes('.api.')) return 'backend-api';
  if (filePath.includes('.integration.')) return 'backend-integration';
  return defaultLayer;
}

function collectFiles(rootDir: string, pattern: RegExp): string[] {
  if (!fs.existsSync(rootDir)) return [];
  const results: string[] = [];

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Discovers test suites across all registered projects and classifies each test case
 * into positive, negative, or edge cases.
 */
export function discoverTestSuites(filter?: {
  projectId?: string;
  layer?: TestLayer;
  tag?: string;
  caseType?: TestCaseType | 'all';
}): TestSuiteInfo[] {
  const cwd = process.cwd();
  const projects = loadProjectsRegistry();
  const runs = runStore.listRuns();
  const suites: TestSuiteInfo[] = [];

  for (const project of projects) {
    if (filter?.projectId && filter.projectId !== 'all' && project.id !== filter.projectId) {
      continue;
    }

    const absRoot = path.resolve(cwd, project.testRoot);
    const pattern = project.type === 'frontend' ? /\.cy\.ts$/ : /\.(spec|test)\.ts$/;
    const files = collectFiles(absRoot, pattern);

    for (const file of files) {
      const relPath = path.relative(cwd, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf8');
      const layer = inferLayer(relPath, project.defaultLayer);
      if (filter?.layer && layer !== filter.layer) {
        continue;
      }

      const tags = extractTags(content, project.tags);
      if (filter?.tag && !tags.includes(filter.tag)) {
        continue;
      }

      const allCases = parseTestCasesFromSource(content);
      const filteredCases =
        filter?.caseType && filter.caseType !== 'all'
          ? allCases.filter((c) => c.caseType === filter.caseType)
          : allCases;

      if (filter?.caseType && filter.caseType !== 'all' && filteredCases.length === 0) {
        continue;
      }

      const firstDescribe = content.match(/describe\s*\(\s*['"`]([^'"`]+)['"`]/);
      const matchingRun = runs.find(
        (r) =>
          r.status !== 'running' &&
          (r.targetFile === relPath ||
            (r.projectId === project.id && (r.layer === layer || r.layer === 'all')) ||
            (!r.projectId && !r.targetFile && (r.layer === layer || r.layer === 'all')))
      );

      suites.push({
        id: relPath.replace(/[^a-zA-Z0-9]/g, '_'),
        name: firstDescribe ? firstDescribe[1] : path.basename(relPath),
        filePath: relPath,
        projectId: project.id,
        layer,
        framework: project.type === 'frontend' ? 'cypress' : 'jest',
        tags,
        description: project.description,
        caseBreakdown: computeCaseBreakdown(allCases),
        testCases: filteredCases,
        lastStatus:
          matchingRun && (matchingRun.status === 'passed' || matchingRun.status === 'failed')
            ? matchingRun.status
            : 'unknown',
        lastDurationMs: matchingRun?.durationMs,
      });
    }
  }

  return suites;
}
