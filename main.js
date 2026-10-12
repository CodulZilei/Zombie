'use strict';

/*
 * Zombie Pet — Electron main process.
 *
 * Creates one transparent, frameless, always-on-top window per display that
 * covers the whole screen. The window ignores mouse events by default, so
 * every click/scroll passes straight through to your real apps underneath.
 * The renderer asks us to *temporarily* capture the mouse only while the
 * cursor is hovering the zombie (so you can grab and throw it).
 *
 * Nothing here reads, modifies, or injects into any other application. The
 * "infection" is a cosmetic overlay drawn inside our own transparent window.
 */

const { app, BrowserWindow, ipcMain, globalShortcut, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

/** One overlay per display, keyed by display id. @type {Map<number, BrowserWindow>} */
const windows = new Map();
let tray = null;
let cursorTimer = null;

// A single CPU-cheap tray icon (16x16 lime circle) encoded inline so we need
// no binary asset in the repo. Tray is optional; it is skipped if unsupported.
const TRAY_ICON_DATA_URL =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAApklEQVR4nGNoOqHBQAnGKmhbJfQfGybK' +
  'AFyacRmCU3P7Ka3/3Wd0wBjExmUIhubmExr/+8/p/Z9+yej/nCsmYAxig8RAcuiGYNgMUgjStOKm5f9' +
  '1d2zAGMQGiYHk0F2CYgDIqSDbQBq23bf/f+CxMxiD2CAxkByydzAMAPkXZBPIVpDG86+8wBjEBomB5EB' +
  'qaGcAxV4gOxApjkaqJCSqJGWqZCZSMQA1d+zQFTj7kAAAAABJRU5ErkJggg==';

function createWindowForDisplay(display) {
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    // Keep the overlay out of normal window management as much as possible.
    type: process.platform === 'linux' ? 'dock' : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  // Float above basically everything, including full-screen apps.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Let every mouse event fall through to the apps underneath. `forward: true`
  // still delivers mousemove to the renderer so it can detect hover and ask us
  // to turn capture back on while the cursor is over the zombie.
  win.setIgnoreMouseEvents(true, { forward: true });

  // Make the overlay exactly fill the display (bounds can drift on some WMs).
  win.setBounds(display.bounds);

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.on('closed', () => {
    if (windows.get(display.id) === win) windows.delete(display.id);
  });

  return win;
}

// Bring the set of overlays in line with the current monitor layout. Existing
// overlays are only resized (so their zombies survive), new displays get a
// fresh overlay, and overlays for unplugged displays are closed last, so there
// is never a moment with zero windows.
function syncWindows() {
  const displays = screen.getAllDisplays();
  const live = new Set(displays.map((d) => d.id));

  for (const display of displays) {
    const win = windows.get(display.id);
    if (win && !win.isDestroyed()) win.setBounds(display.bounds);
    else windows.set(display.id, createWindowForDisplay(display));
  }

  for (const [id, win] of windows) {
    if (!live.has(id)) {
      windows.delete(id);
      if (!win.isDestroyed()) win.destroy();
    }
  }
}

function send(win, channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function broadcast(channel, payload) {
  windows.forEach((w) => send(w, channel, payload));
}

// Spawn on the screen you are looking at, not one zombie per monitor.
function sendToCursorDisplay(channel, payload) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  send(windows.get(display.id), channel, payload);
}

// Forwarded mousemove events only reach a click-through window on some
// platforms (and never while the cursor is over another monitor), so also feed
// each overlay the cursor position directly. This only reads where the pointer
// is; it never touches anything underneath it.
function startCursorFeed() {
  let lastX = NaN;
  let lastY = NaN;
  cursorTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    if (p.x === lastX && p.y === lastY) return;
    lastX = p.x;
    lastY = p.y;
    windows.forEach((win) => {
      if (win.isDestroyed()) return;
      const b = win.getBounds();
      const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
      send(win, 'cursor', { x: p.x - b.x, y: p.y - b.y, inside });
    });
  }, 33);
}

function buildTray() {
  try {
    const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
    if (icon.isEmpty()) return;
    tray = new Tray(icon);
    tray.setToolTip('Zombie Pet');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Spawn a zombie', click: () => sendToCursorDisplay('spawn', 1) },
        { label: 'Spawn a horde (+5)', click: () => sendToCursorDisplay('spawn', 5) },
        { label: 'Clear infections', click: () => broadcast('clear') },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
      ])
    );
  } catch (err) {
    // A tray is a nice-to-have; some Linux desktops have no tray at all.
    console.warn('Tray unavailable:', err.message);
  }
}

function registerShortcuts() {
  // These are the controls, since the overlay itself is click-through.
  globalShortcut.register('CommandOrControl+Shift+Z', () => sendToCursorDisplay('spawn', 1));
  globalShortcut.register('CommandOrControl+Shift+H', () => sendToCursorDisplay('spawn', 5));
  globalShortcut.register('CommandOrControl+Shift+X', () => broadcast('clear'));
  globalShortcut.register('CommandOrControl+Shift+Q', () => app.quit());
}

// The renderer flips mouse capture on while the cursor is over a zombie and
// off again when it leaves, so the overlay never steals your clicks otherwise.
ipcMain.on('set-ignore-mouse', (event, ignore) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(!!ignore, { forward: true });
  }
});

app.whenReady().then(() => {
  // On macOS, keep it a background accessory (no dock icon).
  if (process.platform === 'darwin' && app.dock) app.dock.hide();

  syncWindows();
  buildTray();
  registerShortcuts();
  startCursorFeed();

  // Follow the monitor layout without wiping the zombies already on screen.
  screen.on('display-added', syncWindows);
  screen.on('display-removed', syncWindows);
  screen.on('display-metrics-changed', syncWindows);

  app.on('activate', syncWindows);
});

app.on('will-quit', () => {
  clearInterval(cursorTimer);
  globalShortcut.unregisterAll();
});

// This is an overlay toy: keep running even if every overlay is gone (e.g. all
// monitors briefly unplugged). Quit from the tray or with Ctrl/Cmd+Shift+Q.
app.on('window-all-closed', () => {});
