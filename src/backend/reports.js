// Reports: ASC MHL (per target offload), CSV + HTML (central, printable to PDF).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DATA_DIR } from './store.js';
import { ALGORITHMS } from './checksum.js';
import { isoLocal, dateStamp, formatBytes, sanitizePathToken } from '../shared/util.js';

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function csvEscape(s) {
  s = String(s ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildMHL(job, source, leg, nowIso) {
  const algo = ALGORITHMS[job.algorithm];
  const rows = source.files
    .map((f) => {
      const st = f.targets[leg.targetId];
      const hash = st?.hash || f.sourceHash;
      if (!hash) return '';
      return `    <hash>
      <path>${xmlEscape(st?.destRel || f.rel)}</path>
      <size>${f.size}</size>
      <${algo.mhlTag} hashdate="${nowIso}">${hash}</${algo.mhlTag}>
    </hash>`;
    })
    .filter(Boolean)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<hashlist version="1.0" xmlns="urn:ASC:MHL:v1.0">
  <creator_info>
    <creation_date>${nowIso}</creation_date>
    <creator>eCOPY 1.0</creator>
  </creator_info>
  <process_info>
    <process>${algo.label.toUpperCase()}</process>
    <author>${xmlEscape(job.operator)}</author>
    <host>${xmlEscape(os.hostname())}</host>
    <source>${xmlEscape(source.path)}</source>
    <destination>${xmlEscape(leg.destRootAbs)}</destination>
  </process_info>
  <hashes>
${rows}
  </hashes>
</hashlist>
`;
}

function buildCSV(job) {
  const head = [
    'job_id', 'project', 'operator', 'source_volume', 'brand', 'reel', 'target',
    'file', 'size_bytes', 'algorithm', 'source_hash', 'target_hash', 'verified', 'verified_at'
  ];
  const lines = [head.join(',')];
  for (const source of job.sources) {
    for (const leg of Object.values(source.legs)) {
      for (const f of source.files) {
        const st = f.targets[leg.targetId];
        lines.push(
          [
            job.id, job.project, job.operator, source.volume, source.brand, source.reel,
            leg.targetLabel, f.rel, f.size, job.algorithm, f.sourceHash,
            st?.hash || '', st?.status === 'verified' ? 'TRUE' : 'FALSE',
            st?.status === 'verified' ? leg.verifiedAt : ''
          ].map(csvEscape).join(',')
        );
      }
    }
  }
  return lines.join('\n');
}

function htmlColor(status) {
  return {
    safe: '#2fe07f',
    verified: '#2fe07f',
    error: '#ff5d5d',
    interrupted: '#ffb020',
    copying: '#4aa8ff',
    verifying: '#ffb020'
  }[status] || '#8b93a7';
}

function buildHTML(job) {
  const rows = [];
  for (const source of job.sources) {
    for (const leg of Object.values(source.legs)) {
      for (const f of source.files) {
        const st = f.targets[leg.targetId];
        rows.push(
          `<tr>
<td>${xmlEscape(source.volume)}</td><td>${xmlEscape(source.brand)}</td>
<td>${xmlEscape(leg.targetLabel)}</td><td class="path">${xmlEscape(f.rel)}</td>
<td>${formatBytes(f.size)}</td><td class="mono">${xmlEscape(f.sourceHash || '')}</td>
<td class="mono">${xmlEscape(st?.hash || '')}</td>
<td style="color:${htmlColor(st?.status)};font-weight:600">${(st?.status || '').toUpperCase()}</td></tr>`
        );
      }
    }
  }

  const sourceCards = job.sources
    .map(
      (s) => `<div class="card-mini" style="border-color:${htmlColor(s.safe ? 'safe' : s.status)}">
<div class="vol">${xmlEscape(s.volume)}</div>
<div class="brand">${xmlEscape(s.cameraLabel)}${s.model ? ` · ${xmlEscape(s.model)}` : ''}</div>
<div class="reel">Reel ${xmlEscape(s.reel)}</div>
<div class="state" style="color:${htmlColor(s.safe ? 'safe' : s.status)}">${s.safe ? 'SAFE TO FORMAT' : s.status.toUpperCase()}</div>
</div>`
    )
    .join('\n');

  const totalFiles = job.sources.reduce((a, s) => a + s.fileCount, 0);
  const totalBytes = job.sources.reduce((a, s) => a + s.totalBytes, 0);
  const now = isoLocal();

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>eCOPY Report — ${xmlEscape(job.name)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:'Inter','Segoe UI',system-ui,sans-serif; background:#0d1117; color:#e6edf3; padding:40px; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:#8b93a7; font-size:13px; margin-bottom:24px; }
  .meta { display:flex; gap:32px; margin-bottom:24px; flex-wrap:wrap; }
  .meta div b { display:block; color:#8b93a7; font-size:11px; text-transform:uppercase; letter-spacing:.08em; margin-bottom:2px; }
  .cards { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:28px; }
  .card-mini { border:1px solid #232a35; border-radius:10px; padding:12px 16px; min-width:170px; background:#111823; }
  .card-mini .vol { font-weight:700; font-size:14px; }
  .card-mini .brand,.card-mini .reel { color:#8b93a7; font-size:12px; }
  .card-mini .state { margin-top:8px; font-weight:700; font-size:12px; letter-spacing:.04em; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; }
  th { text-align:left; color:#8b93a7; font-size:11px; text-transform:uppercase; letter-spacing:.06em; padding:8px 10px; border-bottom:1px solid #232a35; }
  td { padding:7px 10px; border-bottom:1px solid #1a212c; }
  td.path { color:#c5d0e0; max-width:360px; overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .mono { font-family:ui-monospace,'Cascadia Code',Consolas,monospace; font-size:11.5px; color:#9fe7c1; }
  .print-btn { background:#2386ff; color:#fff; border:0; border-radius:8px; padding:9px 18px; font-size:13px; cursor:pointer; margin-bottom:20px; }
  @media print {
    body { background:#fff; color:#111; padding:12px; }
    .print-btn { display:none; }
    th { color:#555; border-color:#ccc; }
    td { border-color:#ddd; }
    .card-mini { background:#f6f6f6; border-color:#ccc; }
    .card-mini .brand,.card-mini .reel { color:#555; }
    td.path { color:#222; } .mono{color:#0a7d46;}
  }
</style></head>
<body>
<button class="print-btn" onclick="window.print()">Export as PDF</button>
<h1>${xmlEscape(job.name)}</h1>
<div class="sub">Generated ${now} by eCOPY · checksum ${job.algorithm}</div>
<div class="meta">
  <div><b>Project</b>${xmlEscape(job.project)}</div>
  <div><b>Operator</b>${xmlEscape(job.operator)}</div>
  <div><b>Files</b>${totalFiles}</div>
  <div><b>Total size</b>${formatBytes(totalBytes)}</div>
  <div><b>Started</b>${job.startedAt || ''}</div>
  <div><b>Finished</b>${job.finishedAt || ''}</div>
</div>
<div class="cards">${sourceCards}</div>
<table>
<thead><tr><th>Card</th><th>Brand</th><th>Target</th><th>File</th><th>Size</th><th>Source hash</th><th>Target hash</th><th>Status</th></tr></thead>
<tbody>${rows.join('\n')}</tbody>
</table>
</body></html>`;
}

export async function generateReports(job, log = () => {}) {
  const reportDir = path.join(DATA_DIR, 'reports', job.id);
  await mkdir(reportDir, { recursive: true });
  const nowIso = isoLocal();
  const d = dateStamp();

  job.reports = [];

  // ASC MHL — one per verified source→target leg, written next to the offload
  // (that is where conforming tools expect it) plus a copy in the report dir.
  for (const source of job.sources) {
    for (const leg of Object.values(source.legs)) {
      if (leg.status !== 'verified' || !leg.destRootAbs) continue;
      const mhl = buildMHL(job, source, leg, nowIso);
      const name = `${sanitizePathToken(source.volume)}_${d}.mhl`;
      const offloadCopy = path.join(leg.destRootAbs, name);
      await mkdir(leg.destRootAbs, { recursive: true });
      await writeFile(offloadCopy, mhl);
      await writeFile(path.join(reportDir, `${sanitizePathToken(source.volume)}_${sanitizePathToken(leg.targetLabel)}.mhl`), mhl);
      job.reports.push({ type: 'mhl', target: leg.targetId, source: source.id, absPath: offloadCopy });
    }
  }

  // CSV
  const csvPath = path.join(reportDir, `report_${d}.csv`);
  await writeFile(csvPath, buildCSV(job));
  job.reports.push({ type: 'csv', absPath: csvPath });

  // HTML (printable → PDF)
  const htmlPath = path.join(reportDir, `report_${d}.html`);
  await writeFile(htmlPath, buildHTML(job));
  job.reports.push({ type: 'html', absPath: htmlPath });

  log(`Reports written: ${job.reports.length} × MHL, CSV, HTML → ${reportDir}`);
}
