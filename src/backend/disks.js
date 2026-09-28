// Disk/volume enumeration, space & physical-health monitoring.
// Windows is fully implemented; other platforms get portable statfs fallback.
import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import os from 'node:os';
import { promisify } from 'node:util';

const pExecFile = promisify(execFile);
const isWindows = os.platform() === 'win32';

function runPowerShell(command, timeoutMs = 8000) {
  return pExecFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }
  );
}

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export async function listVolumes() {
  if (!isWindows) return [];
  const cmd =
    'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,FileSystem,DriveType,Size,FreeSpace | ConvertTo-Json -Compress';
  try {
    const { stdout } = await runPowerShell(cmd);
    const rows = asArray(JSON.parse(stdout.trim()));
    return rows
      .filter((r) => r.DeviceID)
      .map((r) => ({
        mount: r.DeviceID,
        path: `${r.DeviceID}/`,
        label: r.VolumeName || '',
        fs: r.FileSystem || '',
        driveType: Number(r.DriveType),
        removable: Number(r.DriveType) === 2,
        size: Number(r.Size || 0),
        free: Number(r.FreeSpace || 0)
      }));
  } catch {
    return [];
  }
}

export async function listPhysical() {
  if (!isWindows) return [];
  // Temperature/health come from the storage reliability provider, which
  // requires an elevated process on most systems. Collect the reason on
  // failure so the UI can offer an admin restart instead of guessing.
  const cmd =
    "Get-PhysicalDisk | ForEach-Object { $r = $null; $err = $null; try { $r = $_ | Get-StorageReliabilityCounter -ErrorAction Stop } catch { $err = $_.Exception.Message }; [pscustomobject]@{ Name=$_.FriendlyName; MediaType=$_.MediaType; Health=$_.HealthStatus; Status=$_.OperationalStatus; Size=$_.Size; Temperature=if($r){$r.Temperature}else{$null}; TempError=$err } } | ConvertTo-Json -Compress";
  try {
    const { stdout } = await runPowerShell(cmd, 15000);
    const rows = asArray(JSON.parse(stdout.trim()));
    return rows.map((r) => ({
      name: r.Name,
      mediaType: String(r.MediaType || ''),
      health: String(r.Health || ''),
      status: String(r.Status || ''),
      size: Number(r.Size || 0),
      tempC: r.Temperature == null ? null : Number(r.Temperature),
      tempError: r.TempError ? String(r.TempError) : null
    }));
  } catch {
    return [];
  }
}

export async function statPath(path) {
  try {
    const s = await statfs(path);
    const total = Number(s.blocks) * Number(s.bsize);
    const free = Number(s.bavail) * Number(s.bsize);
    return { total, free, used: total - free, bsize: Number(s.bsize) };
  } catch {
    return null;
  }
}

// Resolve volume label for any path (Windows: drive letter lookup).
export async function volumeLabelForPath(path) {
  const vols = await listVolumes();
  const letter = String(path).match(/^([A-Za-z]):/);
  if (letter) {
    const v = vols.find((x) => x.mount.toLowerCase() === `${letter[1].toUpperCase()}:`);
    if (v) return { label: v.label || letter[1].toUpperCase(), mount: v.mount, fs: v.fs };
  }
  return null;
}

// Best-effort safe eject/dismount of a volume by drive letter ('D' or 'D:').
export async function ejectVolume(letterOrMount) {
  if (!isWindows) return { ok: false, reason: 'unsupported platform' };
  const letter = String(letterOrMount).match(/^([A-Za-z]):?/);
  if (!letter) return { ok: false, reason: 'not a drive letter' };
  const cmd = `Dismount-Volume -DriveLetter ${letter[1].toUpperCase()} -ErrorAction Stop`;
  try {
    await runPowerShell(cmd, 8000);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// Poll volumes; invoke callback(volumes, added[]) when the set changes.
export function watchVolumes(onChange, intervalMs = 2000) {
  let known = new Set();
  let primed = false;
  let stopped = false;

  async function tick() {
    if (stopped) return;
    const vols = await listVolumes();
    const now = new Set(vols.map((v) => v.mount));
    // First tick is the baseline snapshot — every existing volume would
    // otherwise look "newly inserted" and flood card notifications.
    if (!primed) {
      primed = true;
      known = now;
      if (onChange) onChange(vols, []);
      return;
    }
    const added = vols.filter((v) => !known.has(v.mount));
    const changed = added.length > 0 || now.size !== known.size;
    known = now;
    if (changed && onChange) onChange(vols, added);
  }

  const timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);
  tick().catch(() => {});
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
