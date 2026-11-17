// Keyboard and pointer input, with no game rules in it. Held keys give a movement axis and a
// run flag; one-shot presses are queued as ACTION_* flags and taken once per frame, so a press
// between two frames is never lost and never counted twice. The mouse is stored normalised to
// the canvas (0..1), which keeps aim independent of the window size.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_BRAKE = 8;
export const ACTION_MUTE = 16;
export const ACTION_FIRE = 32;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const BRAKE = new Set(['Space']);
const MUTE = new Set(['KeyM']);

const RELEVANT = new Set([
  ...LEFT,
  ...RIGHT,
  ...UP,
  ...DOWN,
  ...RUN,
  ...CONFIRM,
  ...PAUSE,
  ...INTERACT,
  ...BRAKE,
  ...MUTE,
]);

export function createInput(canvas) {
  const down = new Set();
  let actions = 0;
  let wheel = 0;

  const mouse = { nx: 0.5, ny: 0.5, inside: false, moved: false, firing: false };
  const viewport = { x: 0, y: 0, width: 0, height: 0 };

  function setMouse(event) {
    const rect = canvas.getBoundingClientRect();
    const width = viewport.width || rect.width;
    const height = viewport.height || rect.height;
    if (width === 0 || height === 0) return;
    mouse.nx = (event.clientX - rect.left - viewport.x) / width;
    mouse.ny = (event.clientY - rect.top - viewport.y) / height;
    mouse.inside = mouse.nx >= 0 && mouse.nx <= 1 && mouse.ny >= 0 && mouse.ny <= 1;
    mouse.moved = true;
  }

  window.addEventListener('keydown', (event) => {
    if (!RELEVANT.has(event.code)) return;
    event.preventDefault();
    down.add(event.code);
    if (event.repeat) return;
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    if (INTERACT.has(event.code)) actions |= ACTION_INTERACT;
    if (BRAKE.has(event.code)) actions |= ACTION_BRAKE;
    if (MUTE.has(event.code)) actions |= ACTION_MUTE;
  });

  window.addEventListener('keyup', (event) => {
    if (!RELEVANT.has(event.code)) return;
    event.preventDefault();
    down.delete(event.code);
  });

  canvas.addEventListener('pointermove', setMouse);
  canvas.addEventListener('pointerdown', (event) => {
    setMouse(event);
    if (event.button === 0) {
      actions |= ACTION_CONFIRM;
      actions |= ACTION_FIRE;
      mouse.firing = true;
    }
  });
  canvas.addEventListener('pointerenter', (event) => {
    setMouse(event);
    mouse.inside = true;
  });
  canvas.addEventListener('pointerleave', () => {
    mouse.inside = false;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouse.firing = false;
  });
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      wheel += event.deltaY;
    },
    { passive: false },
  );
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    down.clear();
    mouse.inside = false;
    mouse.firing = false;
  });

  return {
    mouse,
    /** The 16:9 logical frame inside the canvas, in CSS pixels; main.js keeps it current. */
    setViewport(x, y, width, height) {
      viewport.x = x;
      viewport.y = y;
      viewport.width = width;
      viewport.height = height;
    },
    /** -1, 0 or 1: held left/right keys, cancel when both are down. */
    axisX() {
      return (down.has('ArrowRight') || down.has('KeyD') ? 1 : 0) - (down.has('ArrowLeft') || down.has('KeyA') ? 1 : 0);
    },
    /** -1, 0 or 1: held up/down keys, cancel when both are down. */
    axisY() {
      return (down.has('ArrowDown') || down.has('KeyS') ? 1 : 0) - (down.has('ArrowUp') || down.has('KeyW') ? 1 : 0);
    },
    isRunning() {
      return down.has('ShiftLeft') || down.has('ShiftRight');
    },
    isDown(code) {
      return down.has(code);
    },
    /** True while the left mouse button is held: the pistol keeps firing at its own rate. */
    isFiring() {
      return mouse.firing;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The wheel movement since the last call, in CSS pixels. */
    takeWheel() {
      const taken = wheel;
      wheel = 0;
      return taken;
    },
  };
}
