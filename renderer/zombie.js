'use strict';

/*
 * Zombie Pet — renderer engine.
 *
 * Runs a tiny physics/behaviour loop for one or more zombies living in the
 * transparent overlay. They shamble, fall with gravity, can be grabbed and
 * thrown, chase the cursor, and leave cosmetic "infection" slime on the
 * screen. None of this reads or touches any other application — the slime is
 * just styled elements painted inside this overlay window.
 */

(function () {
  const world = document.getElementById('world');
  const hud = document.getElementById('hud');
  const statZombies = document.getElementById('stat-zombies');
  const statInfected = document.getElementById('stat-infected');

  // ---- tunables -------------------------------------------------------
  const GRAVITY = 2100;        // px / s^2
  const WALK_SPEED = 56;       // px / s shamble
  const CHASE_SPEED = 104;     // px / s when hunting the cursor
  const JUMP_V = -560;         // px / s impulse
  const MAX_ZOMBIES = 16;
  const MAX_SLIME = 120;
  const ZW = 44;               // must match .zombie width
  const ZH = 64;               // must match .zombie height
  const BITE_RANGE = 46;       // how close to the cursor before it "bites"

  // ---- shared state ---------------------------------------------------
  /** @type {Zombie[]} */
  const zombies = [];
  const slimes = [];
  let infectedCount = 0;

  const cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2, known: false };
  let grabbed = null;          // the zombie currently held by the mouse
  let hoverCapturing = false;  // whether we've asked main to capture the mouse
  let hudTimer = null;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const groundY = () => window.innerHeight - ZH;
  const maxX = () => window.innerWidth - ZW;

  // ====================================================================
  // Zombie
  // ====================================================================
  class Zombie {
    constructor(x, y) {
      this.x = clamp(x, 0, maxX());
      this.y = clamp(y, 0, groundY());
      this.vx = 0;
      this.vy = 0;
      this.facing = Math.random() < 0.5 ? 1 : -1;
      this.grounded = false;
      this.mode = 'wander';      // 'wander' | 'chase'
      this.walking = false;
      this.think = 0;            // countdown to next decision
      this.biteCooldown = 0;
      this.el = this._build();
      world.appendChild(this.el);
    }

    _build() {
      const el = document.createElement('div');
      el.className = 'zombie idle';
      el.innerHTML =
        '<div class="z-flip">' +
        '  <div class="z-part z-arm z-arm-back"></div>' +
        '  <div class="z-part z-leg z-leg-back"></div>' +
        '  <div class="z-part z-body"></div>' +
        '  <div class="z-part z-leg z-leg-front"></div>' +
        '  <div class="z-part z-head">' +
        '    <div class="z-eye z-eye-l"></div>' +
        '    <div class="z-eye z-eye-r"></div>' +
        '    <div class="z-mouth"></div>' +
        '  </div>' +
        '  <div class="z-part z-arm z-arm-front"></div>' +
        '</div>';
      return el;
    }

    get cx() { return this.x + ZW / 2; }
    get cy() { return this.y + ZH / 2; }

    contains(px, py) {
      return px >= this.x && px <= this.x + ZW && py >= this.y && py <= this.y + ZH;
    }

    // Choose a new short-term behaviour.
    _decide() {
      const r = Math.random();
      if (cursor.known && r < 0.3) {
        this.mode = 'chase';
        this.think = rand(1.6, 3.2);
      } else if (r < 0.5) {
        this.mode = 'wander';
        this.walking = false;          // idle
        this.vx = 0;
        this.think = rand(0.8, 2.4);
      } else if (r < 0.62 && this.grounded) {
        this.vy = JUMP_V;              // hop
        this.mode = 'wander';
        this.walking = true;
        this.facing = Math.random() < 0.5 ? 1 : -1;
        this.think = rand(0.6, 1.2);
      } else {
        this.mode = 'wander';          // walk a while
        this.walking = true;
        this.facing = Math.random() < 0.5 ? 1 : -1;
        this.think = rand(1.0, 3.0);
      }
    }

    update(dt) {
      if (this === grabbed) {          // the mouse owns position while held
        this._render('air');
        return;
      }

      this.think -= dt;
      this.biteCooldown -= dt;
      if (this.think <= 0 && this.grounded) this._decide();

      // Horizontal intent (only steer while on the ground).
      if (this.grounded) {
        if (this.mode === 'chase' && cursor.known) {
          const dir = Math.sign(cursor.x - this.cx) || 1;
          this.facing = dir;
          this.vx = dir * CHASE_SPEED;
          this.walking = true;
          // Reached the cursor? Bite + infect, then back off.
          if (Math.abs(cursor.x - this.cx) < BITE_RANGE && this.biteCooldown <= 0) {
            this._bite(cursor.x, groundY() + ZH);
            this.mode = 'wander';
            this.walking = false;
            this.vx = 0;
            this.think = rand(0.8, 1.6);
          }
        } else if (this.mode === 'wander' && this.walking) {
          this.vx = this.facing * WALK_SPEED;
          // small chance to drool infection as it shambles
          if (Math.random() < 0.9 * dt) this._bite(this.cx, groundY() + ZH);
        } else {
          this.vx = 0;
        }
      }

      // Integrate.
      this.vy += GRAVITY * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Walls — bounce and turn around.
      if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx); this.facing = 1; }
      else if (this.x > maxX()) { this.x = maxX(); this.vx = -Math.abs(this.vx); this.facing = -1; }

      // Floor.
      const g = groundY();
      if (this.y >= g) {
        if (!this.grounded && this.vy > 650) this.vy = -this.vy * 0.28; // little bounce on hard landing
        else { this.y = g; this.vy = 0; this.grounded = true; }
        if (this.y > g) this.y = g;
      } else {
        this.grounded = false;
      }
      this.y = clamp(this.y, 0, g);

      this._render(this.grounded ? (this.walking ? 'walk' : 'idle') : 'air');
    }

    _bite(px, py) {
      this.biteCooldown = 0.6;
      this.el.classList.remove('bite');
      void this.el.offsetWidth;            // restart the CSS animation
      this.el.classList.add('bite');
      spawnSlime(px, py);
    }

    _render(state) {
      this.el.classList.toggle('face-left', this.facing < 0);
      // state classes: idle / walk / air (+ grabbed handled separately)
      const cl = this.el.classList;
      cl.toggle('idle', state === 'idle');
      cl.toggle('walk', state === 'walk');
      cl.toggle('air', state === 'air');
      this.el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0)`;
    }

    destroy() {
      this.el.remove();
    }
  }

  // ====================================================================
  // Infection slime (cosmetic only)
  // ====================================================================
  function spawnSlime(x, y) {
    x = clamp(x, 6, window.innerWidth - 6);
    y = clamp(y, 6, window.innerHeight - 6);

    const size = rand(16, 34);
    const el = document.createElement('div');
    el.className = 'slime';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.width = size + 'px';
    el.style.height = size * 0.8 + 'px';
    world.appendChild(el);

    // a couple of drips sliding down from the splat
    const drips = 1 + ((Math.random() * 2) | 0);
    for (let i = 0; i < drips; i++) {
      const d = document.createElement('div');
      d.className = 'drip';
      d.style.left = x + rand(-size / 3, size / 3) + 'px';
      d.style.top = y + 'px';
      const dist = rand(30, 90);
      d.style.setProperty('--dist', dist + 'px');
      d.style.setProperty('--fall', rand(700, 1300) + 'ms');
      world.appendChild(d);
      d.addEventListener('animationend', () => d.remove());
    }

    const record = { el, born: performance.now(), life: rand(6000, 11000) };
    slimes.push(record);

    while (slimes.length > MAX_SLIME) {
      const old = slimes.shift();
      old.el.remove();
    }

    infectedCount++;
    updateHud();

    // small chance the infection "spreads" into a new zombie
    if (zombies.length < MAX_ZOMBIES && Math.random() < 0.06) {
      addZombie(x - ZW / 2, groundY());
    }
  }

  function reapSlime(now) {
    for (let i = slimes.length - 1; i >= 0; i--) {
      const s = slimes[i];
      const age = now - s.born;
      if (age > s.life && !s.fading) {
        s.fading = true;
        s.el.classList.add('fading');
        const el = s.el;
        setTimeout(() => el.remove(), 1500);
        slimes.splice(i, 1);
      }
    }
  }

  // ====================================================================
  // Spawning / clearing
  // ====================================================================
  function addZombie(x, y) {
    if (zombies.length >= MAX_ZOMBIES) return null;
    if (x == null) x = rand(0, maxX());
    if (y == null) y = -ZH; // drop in from above
    const z = new Zombie(x, y);
    z.vx = rand(-40, 40);
    zombies.push(z);
    updateHud();
    flashHud();
    return z;
  }

  function spawnMany(n) {
    for (let i = 0; i < n; i++) addZombie(rand(0, maxX()), -ZH - i * 30);
  }

  function clearInfections() {
    for (const s of slimes) s.el.remove();
    slimes.length = 0;
    document.querySelectorAll('.drip, .slime').forEach((n) => n.remove());
    infectedCount = 0;
    updateHud();
    flashHud();
  }

  // ====================================================================
  // HUD
  // ====================================================================
  function updateHud() {
    statZombies.textContent = String(zombies.length);
    statInfected.textContent = String(infectedCount);
  }
  function flashHud() {
    hud.classList.remove('hidden');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => hud.classList.add('hidden'), 7000);
  }

  // ====================================================================
  // Mouse: hover capture + grab/throw
  // ====================================================================
  const samples = []; // recent pointer samples for throw velocity

  function setCapture(on) {
    if (on === hoverCapturing) return;
    hoverCapturing = on;
    if (window.petAPI) window.petAPI.setIgnoreMouse(!on);
  }

  function zombieAt(x, y) {
    // topmost first
    for (let i = zombies.length - 1; i >= 0; i--) {
      if (zombies[i].contains(x, y)) return zombies[i];
    }
    return null;
  }

  window.addEventListener('mousemove', (e) => {
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    cursor.known = true;

    if (grabbed) {
      grabbed.x = clamp(e.clientX - ZW / 2, 0, maxX());
      grabbed.y = clamp(e.clientY - ZH / 2, 0, groundY());
      grabbed.grounded = false;
      samples.push({ t: performance.now(), x: grabbed.x, y: grabbed.y });
      if (samples.length > 6) samples.shift();
      return; // keep capturing while held
    }

    // Capture the mouse only while hovering a zombie, so clicks elsewhere
    // pass straight through to the apps underneath.
    setCapture(!!zombieAt(e.clientX, e.clientY));
  });

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const z = zombieAt(e.clientX, e.clientY);
    if (!z) return;
    grabbed = z;
    z.el.classList.add('grabbed', 'air');
    z.vx = z.vy = 0;
    samples.length = 0;
    setCapture(true);
    e.preventDefault();
  });

  window.addEventListener('mouseup', () => {
    if (!grabbed) return;
    const z = grabbed;
    z.el.classList.remove('grabbed');
    // throw velocity from the last ~100 ms of movement
    if (samples.length >= 2) {
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dt = Math.max((b.t - a.t) / 1000, 0.001);
      z.vx = clamp((b.x - a.x) / dt, -1600, 1600);
      z.vy = clamp((b.y - a.y) / dt, -1600, 1600);
    }
    grabbed = null;
    // re-evaluate hover at the release point
    setCapture(!!zombieAt(cursor.x, cursor.y));
  });

  // If the pointer leaves the window entirely, stop capturing.
  window.addEventListener('mouseout', (e) => {
    if (!grabbed && !e.relatedTarget) setCapture(false);
  });

  // ====================================================================
  // Control hooks from the tray menu / global shortcuts
  // ====================================================================
  if (window.petAPI) {
    window.petAPI.onSpawn((n) => spawnMany(n));
    window.petAPI.onClear(() => clearInfections());
  }

  // Double-click empty space to drop a zombie right there (handy on Linux
  // where tray/shortcuts may be unavailable). Only fires while capturing,
  // which means the cursor was over a zombie — so use a keyboard-free hop.
  window.addEventListener('dblclick', (e) => {
    addZombie(e.clientX - ZW / 2, groundY());
  });

  // Keep things sane across resolution / workspace changes.
  window.addEventListener('resize', () => {
    for (const z of zombies) {
      z.x = clamp(z.x, 0, maxX());
      z.y = clamp(z.y, 0, groundY());
    }
  });

  // ====================================================================
  // Main loop
  // ====================================================================
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // avoid huge steps after a stall
    for (const z of zombies) z.update(dt);
    reapSlime(now);
    requestAnimationFrame(frame);
  }

  // ---- boot -----------------------------------------------------------
  addZombie(window.innerWidth / 2 - ZW / 2, -ZH);
  flashHud();
  requestAnimationFrame(frame);
})();
