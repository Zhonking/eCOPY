// Persistent store: settings, jobs, crash recovery. Everything is plain JSON,
// written atomically (tmp + rename), so a crash can never corrupt state.
import { mkdir, readFile, writeFile, readdir, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { clone } from '../shared/util.js';

export const DATA_DIR = path.resolve('.ecopy');
const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export const DEFAULT_SETTINGS = {
  operator: os.userInfo().username || 'operator',
  algorithm: 'xxh64',
  template: '{project}/{date}/{camera}/{reel}',
  sourceConcurrency: 2,
  autoDetect: true,
  autoStart: false, // always require confirmation
  conflictPolicy: 'fail', // fail | keep-both
  theme: 'dark',
  language: 'zh',
  onboarded: false,
  notifications: {
    webhookUrl: '',
    slackLike: false,
    events: ['completed', 'failed', 'safe']
  },
  recentProjects: []
};

async function ensure() {
  await mkdir(JOBS_DIR, { recursive: true });
}

async function atomicWrite(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

export async function getSettings() {
  try {
    const raw = await readFile(SETTINGS_FILE, 'utf8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await ensure();
  await atomicWrite(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

export async function saveJob(job) {
  await ensure();
  const file = path.join(JOBS_DIR, `${job.id}.json`);
  await atomicWrite(file, JSON.stringify(job));
  return job;
}

export async function getJob(id) {
  try {
    const raw = await readFile(path.join(JOBS_DIR, `${id}.json`), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Remove a job from history: its JSON record plus any generated reports.
// Copied files on targets are never touched.
export async function deleteJob(id) {
  await ensure();
  await rm(path.join(JOBS_DIR, `${id}.json`), { force: true });
  await rm(path.join(DATA_DIR, 'reports', id), { recursive: true, force: true });
}

export async function listJobs() {
  await ensure();
  let files = [];
  try {
    files = await readdir(JOBS_DIR);
  } catch {
    return [];
  }
  const jobs = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      jobs.push(JSON.parse(await readFile(path.join(JOBS_DIR, f), 'utf8')));
    } catch {
      /* skip corrupt */
    }
  }
  return jobs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// On boot: any job left "running" was interrupted by crash/exit.
export async function recoverInterrupted() {
  const jobs = await listJobs();
  const touched = [];
  for (const job of jobs) {
    if (job.status === 'running' || job.status === 'canceling') {
      job.status = 'interrupted';
      for (const s of job.sources) {
        if (s.status === 'copying' || s.status === 'verifying' || s.status === 'pending') {
          s.status = 'interrupted';
        }
        for (const leg of Object.values(s.legs || {})) {
          if (['copying', 'verifying', 'pending'].includes(leg.status)) {
            leg.status = 'interrupted';
            leg.error = leg.error || 'Process exited before verification completed';
          }
        }
      }
      await saveJob(job);
      touched.push(job);
    }
  }
  return touched;
}

export function dataPath(...p) {
  return path.join(DATA_DIR, ...p);
}

export { existsSync, clone };
