# 🧟 Zombie Pet

A desktop pet in the spirit of [Shimeji](https://en.wikipedia.org/wiki/Shimeji)
and [Desktop Goose](https://samperson.itch.io/desktop-goose): a little zombie
that spawns on your laptop, shambles around **on top of everything**, falls
with gravity, chases your cursor, can be grabbed and thrown, and leaves
cosmetic "infection" slime wherever it goes.

It runs as a **transparent, click‑through overlay**, so it sits above your other
windows without getting in the way — every click and scroll passes straight
through to the real app underneath, *except* while your cursor is right on top
of the zombie (so you can grab it).

## What "infect" means here (and what it does **not**)

The zombie "infecting" tabs and apps is a **purely visual gag**. The green
slime splats are just styled HTML elements painted inside the zombie's own
transparent overlay window, floating *in front of* your screen. They fade out
on their own after a few seconds.

This app **never** reads, modifies, injects into, or tampers with any other
application, browser tab, file, or process. It has no access to anything on
screen but its own overlay. There is deliberately no real "infection" — that
would be malware, and this is a toy. Think of it as the zombie drooling on the
glass, not touching what's behind it.

## Run it

Requires [Node.js](https://nodejs.org/) 22.12+ (needed by Electron 44).

```bash
npm install     # installs Electron (its binary downloads on first start)
npm start
```

A zombie drops in from the top of the screen. Spawn more, make a horde, or let
them multiply on their own. New zombies appear on whichever monitor your cursor
is on.

## Controls

The overlay is click‑through, so the controls are global shortcuts and a tray
menu (where your OS supports a tray):

| Action            | Shortcut                       |
| ----------------- | ------------------------------ |
| Spawn a zombie    | `Ctrl/Cmd` + `Shift` + `Z`     |
| Spawn a horde (+5)| `Ctrl/Cmd` + `Shift` + `H`     |
| Clear infections  | `Ctrl/Cmd` + `Shift` + `X`     |
| Quit              | `Ctrl/Cmd` + `Shift` + `Q`     |

With the mouse:

- **Hover** a zombie — the overlay grabs the cursor so you can interact.
- **Drag** a zombie to pick it up; **release** to throw it (it keeps your
  flick's momentum and bounces when it lands).
- **Double‑click** a zombie to spawn another one beside it. (Empty space
  can't be double‑clicked — those clicks go to the app underneath, as they
  should.)

Each zombie wanders, occasionally hops, and now and then hunts your cursor. If
it reaches the cursor it "bites" and leaves a splat. Infections have a small
chance to spread into a brand‑new zombie, up to a cap of 16.

## How it works

| File                   | Role                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| `main.js`              | Electron main process: one transparent, always‑on‑top, click‑through window per display (kept in sync as monitors come and go); tray + global shortcuts; cursor‑position feed. |
| `preload.js`           | A tiny, locked‑down bridge (`window.petAPI`) — toggle mouse capture, receive spawn/clear commands and the cursor position. |
| `renderer/index.html`  | The overlay page: a `#world` container and a fading HUD.             |
| `renderer/style.css`   | The zombie (built from styled elements, no image assets), its walk/idle/fall/bite animations, and the slime. |
| `renderer/zombie.js`   | The physics + behaviour loop, grab/throw, cursor chasing, and the cosmetic infection effect. |

Mouse pass‑through is done with Electron's
`setIgnoreMouseEvents(true, { forward: true })`. The window ignores all mouse
input by default, and the renderer flips capture on only while the cursor is
over a zombie. To know where the cursor is, it uses forwarded `mousemove`
events where the OS provides them, plus a ~30 Hz feed of
`screen.getCursorScreenPoint()` from the main process, which works on every
platform and across monitors. That feed is only the pointer's position — it
says nothing about what's under it.

### Platform notes

- **macOS / Windows:** works as described.
- **Linux (X11):** transparency and always‑on‑top work on most compositing
  WMs. Mouse‑move forwarding to click‑through windows isn't available there,
  but the main‑process cursor feed covers it, so chasing and grabbing still
  work. A system tray may not exist — use the global shortcuts, or
  double‑click a zombie to spawn more.
- **Linux (Wayland):** apps can't read the global cursor position or register
  global shortcuts under most compositors, so chasing, grabbing and the
  shortcuts may not work. Running under XWayland
  (`npm start -- --ozone-platform=x11`) usually helps.

## License

MIT. Have fun, and don't actually infect anything. 🧟
