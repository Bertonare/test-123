import fs from 'fs';
import path from 'path';
import { createSeedRunHistory } from '../../fixtures/seed-runs';
import { TestRunRecord } from '../../types';

const HISTORY_FILE = path.resolve(process.cwd(), 'reports/dashboard-history.json');
const MAX_HISTORY_RECORDS = 50;

export class RunStore {
  private ensureFile(): void {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(HISTORY_FILE)) {
      const seeded = createSeedRunHistory();
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(seeded, null, 2), 'utf8');
    }
  }

  listRuns(): TestRunRecord[] {
    this.ensureFile();
    try {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
      const parsed = JSON.parse(raw) as TestRunRecord[];
      return Array.isArray(parsed)
        ? parsed.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        : [];
    } catch {
      return [];
    }
  }

  getRun(id: string): TestRunRecord | undefined {
    return this.listRuns().find((r) => r.id === id);
  }

  upsertRun(run: TestRunRecord): TestRunRecord {
    const runs = this.listRuns();
    const idx = runs.findIndex((r) => r.id === run.id);
    if (idx >= 0) {
      runs[idx] = run;
    } else {
      runs.unshift(run);
    }
    const trimmed = runs
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, MAX_HISTORY_RECORDS);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    return run;
  }

  resetToSeed(): TestRunRecord[] {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const seeded = createSeedRunHistory();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(seeded, null, 2), 'utf8');
    return seeded;
  }

  clearAll(): void {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(HISTORY_FILE, '[]', 'utf8');
  }
}

export const runStore = new RunStore();
