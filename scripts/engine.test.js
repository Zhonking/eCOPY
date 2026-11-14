import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// The store resolves its data directory at import time. Isolate the complete
// integration test in a temporary working directory before loading the engine.
const originalCwd = process.cwd();
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ecopy-engine-'));
process.chdir(tempRoot);
const { engine } = await import('../src/backend/engine.js');

after(async () => {
  process.chdir(originalCwd);
  await rm(tempRoot, { recursive: true, force: true });
});

function waitForFinish(id) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      engine.off('job', check);
      reject(new Error(`Timed out waiting for job ${id}`));
    }, 60000);
    function check() {
      const job = engine.snapshot(id);
      if (!job || !['completed', 'failed', 'canceled'].includes(job.status)) return;
      clearTimeout(timer);
      engine.off('job', check);
      resolve(job);
    }
    engine.on('job', check);
  });
}

async function createAndRun(input) {
  const job = await engine.createJob({
    algorithm: 'xxh64',
    template: 'offload',
    conflictPolicy: 'fail',
    ...input
  });
  const finished = waitForFinish(job.id);
  await engine.start(job.id);
  return finished;
}

async function missing(filePath) {
  await assert.rejects(access(filePath), { code: 'ENOENT' });
}

test('multi-target copy verifies data and counts pre-existing files once', async () => {
  const root = path.join(tempRoot, 'multi-target');
  const source = path.join(root, 'source');
  const targetA = path.join(root, 'target-a');
  const targetB = path.join(root, 'target-b');
  const payload = Buffer.alloc(4 * 1024 * 1024 + 517);
  for (let i = 0; i < payload.length; i++) payload[i] = (i * 31 + 7) & 0xff;
  const metadata = Buffer.from('<clip reel="A001">verified</clip>\n');

  await mkdir(path.join(source, 'DCIM'), { recursive: true });
  await writeFile(path.join(source, 'DCIM', 'A001.MOV'), payload);
  await writeFile(path.join(source, 'metadata.xml'), metadata);
  await mkdir(path.join(targetA, 'offload', 'DCIM'), { recursive: true });
  await writeFile(path.join(targetA, 'offload', 'DCIM', 'A001.MOV'), payload);

  const job = await createAndRun({
    project: 'Engine test',
    sources: [{ path: source }],
    targetPaths: [targetA, targetB]
  });

  assert.equal(job.status, 'completed', job.error || 'copy did not complete');
  assert.equal(job.sources[0].safe, true);
  for (const target of [targetA, targetB]) {
    assert.deepEqual(await readFile(path.join(target, 'offload', 'DCIM', 'A001.MOV')), payload);
    assert.deepEqual(await readFile(path.join(target, 'offload', 'metadata.xml')), metadata);
    await missing(path.join(target, 'offload', 'DCIM', 'A001.MOV.part'));
    await missing(path.join(target, 'offload', 'metadata.xml.part'));
  }
  for (const leg of Object.values(job.sources[0].legs)) {
    assert.equal(leg.status, 'verified');
    assert.equal(leg.bytesCopied, job.sources[0].totalBytes);
    assert.equal(leg.filesVerified, 2);
  }
  const legs = Object.values(job.sources[0].legs);
  assert.equal(legs[0].filesSkipped, 1);
  assert.equal(legs[1].filesSkipped, 0);
});

test('keep-both retry reuses the alternate name without duplicating progress', async () => {
  const root = path.join(tempRoot, 'keep-both');
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  const payload = Buffer.from('source payload that must be preserved exactly');

  await mkdir(path.join(source, 'DCIM'), { recursive: true });
  await mkdir(path.join(target, 'offload', 'DCIM'), { recursive: true });
  await writeFile(path.join(source, 'DCIM', 'clip.MOV'), payload);
  await writeFile(path.join(target, 'offload', 'DCIM', 'clip.MOV'), 'different existing file');

  let job = await createAndRun({
    project: 'Conflict test',
    sources: [{ path: source }],
    targetPaths: [target],
    conflictPolicy: 'keep-both'
  });
  assert.equal(job.status, 'completed', job.error || 'keep-both copy did not complete');
  assert.deepEqual(await readFile(path.join(target, 'offload', 'DCIM', 'clip_1.MOV')), payload);
  assert.equal(await readFile(path.join(target, 'offload', 'DCIM', 'clip.MOV'), 'utf8'), 'different existing file');

  // Recreate a retry after copy but before verification, with the alternate
  // file removed while offline. It must be copied once as clip_1.MOV again,
  // without stale progress or allocating clip_2.MOV.
  job = engine.snapshot(job.id);
  job.status = 'failed';
  job.sources[0].safe = false;
  job.sources[0].status = 'pending';
  for (const leg of Object.values(job.sources[0].legs)) {
    leg.status = 'pending';
    leg.verifiedAt = null;
    for (const file of job.sources[0].files) file.targets[leg.targetId].status = 'copied';
  }
  await rm(path.join(target, 'offload', 'DCIM', 'clip_1.MOV'));

  const finished = waitForFinish(job.id);
  await engine.start(job.id);
  job = await finished;
  assert.equal(job.status, 'completed', job.error || 'retry did not complete');
  const leg = Object.values(job.sources[0].legs)[0];
  assert.equal(leg.bytesCopied, job.sources[0].totalBytes);
  assert.equal(leg.filesCopied, 1);
  assert.deepEqual(await readFile(path.join(target, 'offload', 'DCIM', 'clip_1.MOV')), payload);
  await missing(path.join(target, 'offload', 'DCIM', 'clip_2.MOV'));
});

test('preflight rejects duplicate targets through equivalent paths', async () => {
  const root = path.join(tempRoot, 'duplicate-target');
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'file.bin'), 'payload');

  const job = await engine.createJob({
    algorithm: 'xxh64',
    template: 'offload',
    sources: [{ path: source }],
    targetPaths: [target, `${target}${path.sep}`]
  });
  await assert.rejects(engine.start(job.id), /Duplicate target path/);
  assert.equal(engine.snapshot(job.id).status, 'draft');
});
