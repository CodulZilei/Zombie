'use strict';

/*
 * Minimal, locked-down bridge between the renderer and the main process.
 * The renderer gets exactly three things: a way to toggle mouse capture,
 * a way to subscribe to control commands (spawn/clear), and the primary
 * mouse position for cursor-chasing. Nothing else is exposed.
 */

const { contextBridge, ipcRenderer, screen } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  // Ask main to ignore (true) or capture (false) mouse events for this window.
  setIgnoreMouse(ignore) {
    ipcRenderer.send('set-ignore-mouse', !!ignore);
  },

  // Control commands arriving from the tray menu or global shortcuts.
  onSpawn(cb) {
    ipcRenderer.on('spawn', (_e, count) => cb(count || 1));
  },
  onClear(cb) {
    ipcRenderer.on('clear', () => cb());
  }
});
