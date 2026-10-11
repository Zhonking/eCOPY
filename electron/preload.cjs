// eCOPY preload — the app talks HTTP to the in-process backend, plus a
// small bridge for native-only actions.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('ecopy', {
  relaunchElevated: () => ipcRenderer.invoke('app:relaunch-elevated'),
  isPackaged: process.env.ECOPY_PACKAGED === '1',
  // Background / floating window controls.
  showFloating: () => ipcRenderer.invoke('app:show-floating'),
  hideFloating: () => ipcRenderer.invoke('app:hide-floating'),
  restoreMain: () => ipcRenderer.invoke('app:restore-main'),
  quitNow: () => ipcRenderer.invoke('app:quit-now'),
  runningCount: () => ipcRenderer.invoke('app:running-count'),
  backgroundMode: () => ipcRenderer.invoke('app:background-mode'),
  // Electron ≥32 removed File.path in renderers; drag-and-drop handlers send
  // the File objects here so real filesystem paths can be resolved.
  pathsForFiles: (files) =>
    files
      .map((f) => {
        try { return webUtils.getPathForFile(f); } catch { return f.path || ''; }
      })
      .filter(Boolean)
});

window.addEventListener('DOMContentLoaded', () => {
  document.title = 'eCOPY';
});
