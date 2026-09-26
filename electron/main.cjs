// eCOPY Electron main process (CommonJS).
// Runs the Node backend in-process, then loads the SPA from localhost.
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const PORT = 5218;
const ICON = path.join(__dirname, '..', 'resources', 'icon.ico');

// Keep taskbar grouping/icon consistent with the packaged exe.
app.setAppUserModelId('com.xuezhizhong.ecopy');

// Never suspend/stop drawing when the window is backgrounded or occluded:
// otherwise SSE updates freeze and, on some GPU drivers, a force-raised
// window stays a black screen until an input triggers a repaint.
for (const sw of [
  'disable-renderer-backgrounding',
  'disable-backgrounding-occluded-windows',
  'disable-background-timer-throttling',
]) app.commandLine.appendSwitch(sw);

// In packaged builds, write .ecopy data to userData (install dir is read-only).
if (app.isPackaged) {
  process.chdir(app.getPath('userData'));
  process.env.ECOPY_PACKAGED = '1';
}

async function startServer() {
  const entry = path.join(__dirname, '..', 'src', 'backend', 'server.js');
  await import(pathToFileURL(entry).href);
}

function waitForServer(retries = 60) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      fetch(`http://localhost:${PORT}/api/state`)
        .then((r) => (r.ok ? resolve() : retry(n)))
        .catch(() => retry(n));
    };
    const retry = (n) => {
      if (n <= 0) return reject(new Error('backend did not start'));
      setTimeout(() => attempt(n - 1), 250);
    };
    attempt(retries);
  });
}

// Deep-link style navigation: --ecopy-nav=#/jobs (also handled on 2nd instance).
function navFromArgv(argv) {
  const a = (argv || []).find((x) => x.startsWith('--ecopy-nav='));
  return a ? a.slice('--ecopy-nav='.length) : '';
}

// Portable builds don't always forward 2nd-instance argv reliably, so a
// signal file (%TEMP%\ecopy-nav.signal, content e.g. "#/job/abc") also works.
function navigate(hash) {
  const [win] = BrowserWindow.getAllWindows();
  if (!win || !hash) return;
  win.webContents.once('did-finish-load', () => win.webContents.invalidate());
  win.loadURL(`http://localhost:${PORT}${hash.startsWith('/') ? hash : '/' + hash}`);
  if (win.isMinimized()) win.restore();
  win.focus();
}

function watchNavSignal() {
  const file = path.join(os.tmpdir(), 'ecopy-nav.signal');
  try { fs.unlinkSync(file); } catch {}
  let last = 0;
  fs.watchFile(file, { interval: 400 }, (stat) => {
    if (!stat.mtimeMs || stat.mtimeMs === last) return;
    last = stat.mtimeMs;
    try { navigate(fs.readFileSync(file, 'utf8').trim()); } catch {}
  });
}

function createWindow() {
  const nav = navFromArgv(process.argv);
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#070b13',
    title: 'eCOPY',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Reports open in the system browser.
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL(`http://localhost:${PORT}${nav}`);
}

// Elevated restart: an outer (normal) PowerShell asks UAC to launch an
// elevated helper. The helper writes a signal file (meaning UAC was approved),
// then WAITS for THIS process to exit completely. Only then does it start the
// packaged exe — starting earlier makes the new instance fail the
// single-instance lock (and hit EADDRINUSE) because the old one is still alive.
ipcMain.handle('app:relaunch-elevated', () => {
  if (!app.isPackaged) return false;
  const exe = process.execPath.replace(/'/g, "''");
  const oldPid = process.pid;
  const signal = path.join(os.tmpdir(), 'ecopy-elevated.signal');
  try {
    fs.unlinkSync(signal);
  } catch {}

  // 1) signal = UAC approved, this instance may quit
  // 2) Wait-Process = block until the old app has actually exited
  // 3) grace delay so the single-instance lock and the listening socket are free
  // 4) launch the exe (inherits the elevated token — no second UAC prompt)
  const inner =
    `New-Item -ItemType File -Force '${signal}' | Out-Null; ` +
    `try { Wait-Process -Id ${oldPid} -Timeout 25 -ErrorAction Stop } catch {}; ` +
    `Start-Sleep -Milliseconds 1000; ` +
    `Start-Process -FilePath '${exe}'`;
  const encoded = Buffer.from(inner, 'utf16le').toString('base64');
  const outer =
    `Start-Process -FilePath powershell.exe -Verb RunAs ` +
    `-ArgumentList '-NoProfile','-EncodedCommand','${encoded}'`;

  let child;
  try {
    // detached MUST stay false: CREATE_NEW_PROCESS_GROUP makes PowerShell's
    // Start-Process (ShellExecuteEx) silently fail — no UAC, no child process.
    child = spawn('powershell.exe', ['-NoProfile', '-Command', outer], {
      detached: false,
      stdio: 'ignore',
      windowsHide: true
    });
    child.on('error', () => {});
  } catch {
    return false;
  }

  // Quit only once the elevated helper has actually started (UAC approved).
  const deadline = Date.now() + 120000;
  const timer = setInterval(() => {
    if (fs.existsSync(signal)) {
      clearInterval(timer);
      app.quit();
    } else if (Date.now() > deadline) {
      clearInterval(timer);
    }
  }, 150);
  return true;
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    navigate(navFromArgv(argv));
  });

  app.whenReady().then(async () => {
    await startServer();
    await waitForServer();
    watchNavSignal();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
