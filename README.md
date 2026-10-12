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

Requires [Node.js](https://nodejs.org/) 18+.

```bash
npm install     # downloads Electron
npm start
```

A zombie drops in from the top of the screen. Spawn more, make a horde, or let
them multiply on their own.

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
- **Double‑click** empty space to drop a new zombie right there.

Each zombie wanders, occasionally hops, and now and then hunts your cursor. If
it reaches the cursor it "bites" and leaves a splat. Infections have a small
chance to spread into a brand‑new zombie, up to a cap of 16.

## How it works

| File                   | Role                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| `main.js`              | Electron main process: one transparent, always‑on‑top, click‑through window per display; tray + global shortcuts. |
| `preload.js`           | A tiny, locked‑down bridge (`window.petAPI`) — toggle mouse capture, receive spawn/clear commands. |
| `renderer/index.html`  | The overlay page: a `#world` container and a fading HUD.             |
| `renderer/style.css`   | The zombie (built from styled elements, no image assets), its walk/idle/fall/bite animations, and the slime. |
| `renderer/zombie.js`   | The physics + behaviour loop, grab/throw, cursor chasing, and the cosmetic infection effect. |

Mouse pass‑through is done with Electron's
`setIgnoreMouseEvents(true, { forward: true })`. The window ignores all mouse
input by default but still receives `mousemove`, so the renderer can tell when
the cursor is over a zombie and flip capture on just for that moment.

### Platform notes

- **macOS / Windows:** works as described, including cursor‑chasing while
  click‑through.
- **Linux:** behaviour depends on the window manager. Transparency and
  always‑on‑top work on most compositing WMs; mouse‑move forwarding while
  click‑through is less reliable, so cursor‑chasing may only kick in when the
  cursor is near a zombie. A system tray may not exist — use the global
  shortcuts or double‑click to spawn.

## License

MIT. Have fun, and don't actually infect anything. 🧟
