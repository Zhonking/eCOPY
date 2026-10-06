// eCOPY Electron main process (CommonJS).
// Runs the Node backend in-process, then loads the SPA from localhost.
const { app, BrowserWindow, shell, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const PORT = 5218;
const ICON = path.join(__dirname, '..', 'resources', 'icon.ico');
const FLOATING_HTML = path.join(__dirname, 'floating.html');

let mainWindow = null;
let tray = null;
let floatingWin = null;
// When true, the next close of the main window is a real quit (tray menu / IPC).
let quitting = false;

// Last-resort diagnostics: the backend runs in the main process, and an
// uncaught error there would otherwise exit silently with no evidence.
function crashLog(kind, err) {
  try {
    const line = `${new Date().toISOString()} ${kind}: ${err?.stack || err}\n`;
    fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), line);
  } catch {}
}
process.on('uncaughtException', (err) => crashLog('uncaughtException', err));
process.on('unhandledRejection', (err) => crashLog('unhandledRejection', err));

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
  mainWindow = win;
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Reports open in the system browser.
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL(`http://localhost:${PORT}${nav}`);

  // Closing the main window: if copy jobs are running, keep the app alive in
  // the background (tray + floating window) instead of killing the transfers.
  win.on('close', async (e) => {
    if (quitting) return;
    e.preventDefault();
    const running = await runningJobCount();
    if (running > 0) {
      // Background mode: hide main window, show floating progress + tray.
      win.hide();
      ensureTray();
      showFloatingWindow();
    } else {
      quitting = true;
      app.quit();
    }
  });

  win.on('closed', () => {
    mainWindow = null;
  });
}

// How many jobs are currently running? Polls the in-process backend.
async function runningJobCount() {
  try {
    const r = await fetch(`http://localhost:${PORT}/api/aggregate`);
    if (!r.ok) return 0;
    const j = await r.json();
    return Number(j.running) || 0;
  } catch {
    return 0;
  }
}

function ensureTray() {
  if (tray) return;
  try {
    const icon = nativeImage.createFromPath(ICON);
    tray = new Tray(icon);
    tray.setToolTip('eCOPY — 拷卡进行中');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => restoreMainWindow() },
      { label: '显示悬浮窗', click: () => showFloatingWindow() },
      { type: 'separator' },
      { label: '退出 (停止所有任务)', click: () => quitNow() }
    ]));
    tray.on('click', () => restoreMainWindow());
  } catch {
    tray = null;
  }
}

function createFloatingWindow() {
  const win = new BrowserWindow({
    width: 320,
    height: 168,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(FLOATING_HTML);
  win.on('closed', () => { floatingWin = null; });
  return win;
}

function showFloatingWindow() {
  if (!floatingWin || floatingWin.isDestroyed()) {
    floatingWin = createFloatingWindow();
  }
  floatingWin.show();
  floatingWin.setAlwaysOnTop(true, 'screen-saver');
}

function hideFloatingWindow() {
  if (floatingWin && !floatingWin.isDestroyed()) floatingWin.hide();
}

function restoreMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  } else {
    mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}

function quitNow() {
  quitting = true;
  if (floatingWin && !floatingWin.isDestroyed()) floatingWin.destroy();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  app.quit();
}

// Floating window + background-mode IPC (also used by the main window's
// "minimize to floating" button).
ipcMain.handle('app:show-floating', () => { showFloatingWindow(); return true; });
ipcMain.handle('app:hide-floating', () => { hideFloatingWindow(); return true; });
ipcMain.handle('app:restore-main', () => { restoreMainWindow(); return true; });
ipcMain.handle('app:quit-now', () => { quitNow(); return true; });
ipcMain.handle('app:running-count', () => runningJobCount());
ipcMain.handle('app:background-mode', async () => {
  // Hide main window, keep app alive, show floating + tray.
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  ensureTray();
  showFloatingWindow();
  return true;
});

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

  // When all windows close: only quit if no jobs are running and the floating
  // window is gone. Otherwise stay alive (tray + floating) so copies continue.
  app.on('window-all-closed', async () => {
    if (quitting) return;
    const running = await runningJobCount();
    if (running > 0 || (floatingWin && !floatingWin.isDestroyed())) {
      ensureTray();
      if (running > 0) showFloatingWindow();
      return; // keep the process alive
    }
    app.quit();
  });
}
