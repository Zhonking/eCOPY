// Disk/volume enumeration, space & physical-health monitoring.
// Windows is fully implemented; other platforms get portable statfs fallback.
import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const pExecFile = promisify(execFile);
const isWindows = os.platform() === 'win32';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Bundled smartctl (smartmontools) — reads SMART for NVMe (incl. CFE cards),
// SATA, SAS and USB-attached storage where Windows' own provider cannot.
const SMARTCTL_PATH = path.resolve(__dirname, '../../resources/smartctl.exe');

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

// Parse a single "smartctl -a <dev>" output block into a physical-disk record.
// Handles NVMe (CFE cards), ATA/SATA and SCSI/SAS output formats.
function parseSmartctlA(stdout, device, type) {
  const lines = stdout.split(/\r?\n/);
  const find = (re) => {
    for (const l of lines) {
      const m = l.match(re);
      if (m) return m;
    }
    return null;
  };

  // Model/device name — NVMe, ATA, SCSI differ.
  let name = '';
  const nvmeModel = find(/^Model Number:\s+(.+?)\s*$/);
  const ataModel = find(/^Device Model:\s+(.+?)\s*$/);
  const scsiVendor = find(/^Vendor:\s+(.+?)\s*$/);
  const scsiProduct = find(/^Product:\s+(.+?)\s*$/);
  if (nvmeModel) name = nvmeModel[1];
  else if (ataModel) name = ataModel[1];
  else if (scsiProduct) name = scsiVendor ? `${scsiVendor[1]} ${scsiProduct[1]}`.trim() : scsiProduct[1];

  // Health self-assessment.
  let health = '';
  const h = find(/^SMART overall-health self-assessment test result:\s+(.+?)\s*$/);
  if (h) health = h[1];

  // Temperature — NVMe/ATA/SCSI all report "Temperature: NN Celsius";
  // also "Airflow_Temperature" / "Temperature_Celsius" appear in ATA tables.
  let tempC = null;
  let tempError = null;
  const t = find(/^Temperature:\s+(-?\d+)\s+Celsius/);
  if (t) tempC = Number(t[1]);
  else {
    const t2 = find(/(?:Airflow_Temperature|Temperature_Celsius)[^\n]*?\s(-?\d+)\s*\(/);
    if (t2) tempC = Number(t2[1]);
  }
  if (tempC == null) {
    // smartctl may say "No error logged" or the device simply has no sensor.
    const notSupported = /No SMART\s+support|not supported|Device Read Identity|Unable to detect/i.test(stdout);
    if (notSupported) tempError = 'SMART not supported by device';
  }

  // Size — NVMe: "Namespace N Size/Capacity:" ; ATA/SCSI: "User Capacity:".
  let size = 0;
  const sz = find(/^User Capacity:\s+([\d,]+)\s+bytes/) ||
    find(/^Namespace\s+\d+\s+Size\/Capacity:\s+([\d,]+)\s/) ||
    find(/^User Size:\s+([\d,]+)\s+bytes/);
  if (sz) size = Number(sz[1].replace(/,/g, ''));

  return {
    name: name || device,
    mediaType: typeToMediaType(type, name),
    health,
    status: health || '',
    size,
    tempC,
    tempError,
    device,
    protocol: type
  };
}

function typeToMediaType(type, name) {
  if (/nvme/i.test(type)) return 'SSD';
  if (/sat|ata/i.test(type)) return 'SSD';
  if (/scsi|sas/i.test(type)) return /HDD|hard/i.test(name) ? 'HDD' : 'SSD';
  if (/usbsd|usb/i.test(type)) return 'SSD';
  return '';
}

export async function listPhysical() {
  if (!isWindows) return [];

  // --- Primary: bundled smartctl ---
  // Reads SMART for NVMe (including CFE cards in USB/PCIe readers),
  // SATA, SAS and many USB-bridged devices. Windows' own
  // Get-StorageReliabilityCounter usually fails for USB-attached NVMe.
  try {
    const { stdout: scanOut } = await pExecFile(
      SMARTCTL_PATH, ['--scan'],
      { timeout: 10000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
    );
    const devices = scanOut
      .split(/\r?\n/)
      .map((l) => l.match(/^(\/dev\/\w+)\s+-d\s+(\S+)/))
      .filter(Boolean)
      .map((m) => ({ device: m[1], type: m[2] }));

    if (devices.length) {
      const results = await Promise.allSettled(
        devices.map(async ({ device, type }) => {
          let stdout = '';
          let stderr = '';
          // Pass the device type detected by --scan so USB bridges (CFE
          // readers, SATA-to-USB adapters) use the right SMART passthrough.
          const args = ['-a', device];
          if (type) args.push('-d', type);
          try {
            const r = await pExecFile(
              SMARTCTL_PATH, args,
              { timeout: 15000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }
            );
            stdout = r.stdout;
          } catch (e) {
            // smartctl exits non-zero on unsupported/permission errors, but
            // still prints partial info on stdout. Use whatever we got.
            stdout = e.stdout || '';
            stderr = e.stderr || '';
          }
          const row = parseSmartctlA(stdout, device, type);
          if (row.tempC == null && !row.tempError) {
            const combined = (stdout + '\n' + stderr);
            if (/permission denied|access is denied|requires admin|elevation/i.test(combined)) {
              row.tempError = 'Requires administrator privileges';
            } else if (!row.health) {
              row.tempError = 'SMART data unavailable';
            }
          }
          return row;
        })
      );
      const rows = results
        .filter((r) => r.status === 'fulfilled')
        .map((r) => r.value);
      if (rows.length) return rows;
    }
  } catch {
    // smartctl missing or broken — fall through to PowerShell below.
  }

  // --- Fallback: Windows Storage Reliability Counter ---
  // Covers internal SATA/NVMe but not USB-bridged cards (CFE readers, etc.).
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
