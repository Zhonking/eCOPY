// eCOPY preload — the app talks HTTP to the in-process backend, plus a
// small bridge for native-only actions.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ecopy', {
  relaunchElevated: () => ipcRenderer.invoke('app:relaunch-elevated'),
  isPackaged: process.env.ECOPY_PACKAGED === '1'
});

window.addEventListener('DOMContentLoaded', () => {
  document.title = 'eCOPY';
});
