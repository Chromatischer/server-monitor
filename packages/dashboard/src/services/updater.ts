import { $ } from 'bun';
import { resolve } from 'path';
import { getSetting } from '../db';
import { broadcast } from './sse-bus';

export interface UpdateStatus {
  available: boolean;
  currentCommit: string;
  remoteCommit: string;
  lastCheck: number | null;
  updating: boolean;
  lastError: string | null;
  commitsBehind: number;
  changelog: string[];
}

const PROJECT_ROOT = resolve(import.meta.dir, '../../../..');

let intervalId: ReturnType<typeof setInterval> | null = null;
let status: UpdateStatus = {
  available: false,
  currentCommit: '',
  remoteCommit: '',
  lastCheck: null,
  updating: false,
  lastError: null,
  commitsBehind: 0,
  changelog: [],
};

export function getUpdateStatus(): UpdateStatus {
  return { ...status };
}

/** Get the current branch name */
async function getCurrentBranch(): Promise<string> {
  const result = await $`git -C ${PROJECT_ROOT} rev-parse --abbrev-ref HEAD`.text();
  return result.trim();
}

/** Get the short hash of a ref */
async function getCommitHash(ref: string): Promise<string> {
  const result = await $`git -C ${PROJECT_ROOT} rev-parse --short ${ref}`.text();
  return result.trim();
}

/** Fetch from remote and check if updates are available */
export async function checkForUpdates(): Promise<UpdateStatus> {
  try {
    const branch = await getCurrentBranch();

    // Fetch latest from remote
    await $`git -C ${PROJECT_ROOT} fetch origin ${branch} --quiet`.quiet();

    const localHash = await getCommitHash('HEAD');
    const remoteHash = await getCommitHash(`origin/${branch}`);

    // Count commits behind
    const behindText = await $`git -C ${PROJECT_ROOT} rev-list HEAD..origin/${branch} --count`.text();
    const commitsBehind = parseInt(behindText.trim(), 10) || 0;

    // Get changelog (commit messages for the new commits)
    let changelog: string[] = [];
    if (commitsBehind > 0) {
      const logText = await $`git -C ${PROJECT_ROOT} log HEAD..origin/${branch} --oneline --no-decorate`.text();
      changelog = logText.trim().split('\n').filter(Boolean);
    }

    status = {
      ...status,
      available: commitsBehind > 0,
      currentCommit: localHash,
      remoteCommit: remoteHash,
      lastCheck: Date.now(),
      lastError: null,
      commitsBehind,
      changelog,
    };

    if (status.available) {
      console.log(`[Updater] Update available: ${localHash} -> ${remoteHash} (${commitsBehind} commit(s) behind)`);
      broadcast('update:available', status);
    } else {
      console.log(`[Updater] Already up to date (${localHash})`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    status = { ...status, lastCheck: Date.now(), lastError: message };
    console.error(`[Updater] Check failed: ${message}`);
  }

  return { ...status };
}

/** Pull updates, install deps, rebuild frontend, then restart the process */
export async function applyUpdate(): Promise<UpdateStatus> {
  if (status.updating) {
    return { ...status };
  }

  status = { ...status, updating: true, lastError: null };
  broadcast('update:started', { message: 'Pulling updates...' });

  try {
    const branch = await getCurrentBranch();

    // Pull latest changes
    console.log('[Updater] Pulling latest changes...');
    const pullResult = await $`git -C ${PROJECT_ROOT} pull origin ${branch}`.text();
    console.log(`[Updater] ${pullResult.trim()}`);

    // Install dependencies (in case package.json changed)
    console.log('[Updater] Installing dependencies...');
    await $`bun install --cwd ${PROJECT_ROOT}`.quiet();

    // Rebuild frontend
    console.log('[Updater] Building frontend...');
    await $`bun run --cwd ${PROJECT_ROOT} build`.quiet();

    const newHash = await getCommitHash('HEAD');

    status = {
      ...status,
      available: false,
      currentCommit: newHash,
      remoteCommit: newHash,
      updating: false,
      lastError: null,
      commitsBehind: 0,
      changelog: [],
    };

    console.log(`[Updater] Update complete (now at ${newHash}). Restarting...`);
    broadcast('update:complete', { message: 'Update applied. Restarting server...', commit: newHash });

    // Give SSE a moment to flush, then restart
    setTimeout(() => {
      console.log('[Updater] Exiting for restart...');
      process.exit(0);
    }, 1000);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    status = { ...status, updating: false, lastError: message };
    console.error(`[Updater] Update failed: ${message}`);
    broadcast('update:failed', { message, error: message });
  }

  return { ...status };
}

/** Start the periodic update checker */
export function startUpdater(): void {
  // Get initial commit hash
  getCommitHash('HEAD')
    .then((hash) => {
      status.currentCommit = hash;
      console.log(`[Updater] Current commit: ${hash}`);
    })
    .catch(() => {});

  const enabled = getSetting('auto_update_enabled');
  if (enabled !== 'true') {
    console.log('[Updater] Auto-update is disabled');
    return;
  }

  const intervalMin = parseInt(getSetting('auto_update_interval_minutes') || '30', 10);
  const intervalMs = intervalMin * 60 * 1000;

  // Initial check after a short delay
  setTimeout(async () => {
    const result = await checkForUpdates();
    if (result.available) {
      console.log('[Updater] Auto-applying update...');
      await applyUpdate();
    }
  }, 10_000);

  // Periodic checks
  intervalId = setInterval(async () => {
    const result = await checkForUpdates();
    if (result.available) {
      console.log('[Updater] Auto-applying update...');
      await applyUpdate();
    }
  }, intervalMs);

  console.log(`[Updater] Auto-update checker running every ${intervalMin} minutes`);
}

/** Stop the periodic update checker */
export function stopUpdater(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/** Restart the updater (e.g. after settings change) */
export function restartUpdater(): void {
  stopUpdater();
  startUpdater();
}
