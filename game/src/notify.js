// The HUD toast queue: at most four stacked messages that fade on their own, with a duplicate
// line refreshed rather than repeated. Exports notify, updateNotifications, clearNotifications,
// shakeScreen and updateShake; hud.js is the only reader.

const MAX_TOASTS = 4;

/**
 * Push a notification. An identical line already on screen is refreshed instead of stacked, so a
 * repeated pickup does not flood the column. `kind` picks the accent colour: 'mission', 'money',
 * 'fail', 'info' or 'story'.
 */
export function notify(world, text, sub = '', kind = 'info', time = 3.6) {
  if (world.notifications === undefined) world.notifications = [];
  const list = world.notifications;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].text === text) {
      list[i].timer = time;
      list[i].max = time;
      list[i].sub = sub;
      list[i].kind = kind;
      return list[i];
    }
  }
  if (list.length >= MAX_TOASTS) list.shift();
  const item = { text, sub, kind, timer: time, max: time, born: world.time ?? 0 };
  list.push(item);
  return item;
}

/** Age the queue by one fixed step and drop the spent entries. */
export function updateNotifications(world, dt) {
  const list = world.notifications;
  if (list === undefined || list.length === 0) return;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    list[i].timer -= dt;
    if (list[i].timer <= 0) list.splice(i, 1);
  }
}

export function clearNotifications(world) {
  if (world.notifications !== undefined) world.notifications.length = 0;
}

/** Shake the frame: crashes, explosions and hard landings call this. */
export function shakeScreen(world, amount) {
  if (world.shake === undefined) world.shake = { amount: 0, time: 0 };
  world.shake.amount = Math.min(18, world.shake.amount + amount);
  world.shake.time = 0.42;
}

/** Age the shake and return the offset the renderer should use this frame. */
export function updateShake(world, dt) {
  const shake = world.shake;
  if (shake === undefined) return 0;
  if (shake.time > 0) {
    shake.time -= dt;
    shake.amount *= Math.exp(-6.5 * dt);
    if (shake.time <= 0) shake.amount = 0;
  } else {
    shake.amount = 0;
  }
  return shake.amount;
}
