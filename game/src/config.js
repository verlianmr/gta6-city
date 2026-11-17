// Sunset Palms — every tuning number and colour lives here, so the city, the player and the
// HUD all read from one sun-soaked palette. The game is drawn into a fixed 1280x720 logical
// frame that the browser scales to the window; no rule below depends on the screen size.

/** The logical frame every module draws into. */
export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds. */
export const STEP = 1 / 60;

/** Sunset over a warm Pacific coast: terracotta, cream, teal water and low gold light. */
export const COLOURS = {
  night: '#171420',
  asphalt: '#4c474c',
  asphaltDark: '#403b41',
  asphaltLight: '#5a535a',
  lane: '#f4d99a',
  crosswalk: '#e9dfc7',
  sidewalk: '#dcc9a6',
  sidewalkEdge: '#bda57f',
  lot: '#cbb58f',
  lotEdge: '#b29971',
  grass: '#79ad52',
  grassDark: '#5f8c40',
  path: '#ddc795',
  waterShallow: '#62cbc7',
  waterMid: '#2aa3ad',
  waterDeep: '#1d7089',
  foam: '#f7f3e4',
  sand: '#f3d89b',
  sandDark: '#dfbd7d',
  wood: '#9b6b45',
  woodDark: '#7a5134',
  wallCream: '#f2ddb4',
  wallSand: '#e6c58d',
  wallCoral: '#e98d66',
  wallRose: '#e2a09a',
  wallTeal: '#6fbcb4',
  wallWhite: '#f7edd8',
  wallOchre: '#e2b45c',
  roofTerracotta: '#c25c3f',
  roofGrey: '#8f8b80',
  roofTeal: '#5f9a92',
  roofCoral: '#cf6b4d',
  roofSand: '#b99a6b',
  glass: '#5fa8bd',
  glassDark: '#477f94',
  shadow: 'rgba(58, 34, 28, 0.26)',
  shadowSoft: 'rgba(58, 34, 28, 0.12)',
  lamp: '#ffd79a',
  palm: '#4f8a4d',
  palmLight: '#76aa5c',
  palmDark: '#3a6b3c',
  trunk: '#8a6544',
  playerJacket: '#f0b45c',
  playerJeans: '#3d4f63',
  playerSkin: '#c98b63',
  playerHair: '#3a2a24',
  hudPanel: 'rgba(24, 21, 28, 0.82)',
  hudPanelLight: 'rgba(44, 38, 48, 0.88)',
  hudEdge: 'rgba(255, 213, 148, 0.30)',
  gold: '#ffd27a',
  goldDeep: '#e8a94a',
  text: '#fff4df',
  muted: '#c3b49b',
  red: '#e2604f',
  green: '#7ec86a',
  police: '#6fa8ff',
  minimapRoad: '#37333b',
  minimapBlock: '#cdbb98',
  minimapBuilding: '#9a8a72',
};

/** Movement, camera and time-of-day feel. */
export const TUNING = {
  player: {
    radius: 11,
    walkSpeed: 196,
    runSpeed: 338,
    accel: 11,
    brake: 16,
    turnRate: 15,
    hpMax: 100,
  },
  camera: {
    follow: 5.6,
    lookAhead: 0.14,
    minZoom: 0.82,
    maxZoom: 1.42,
    wheelStep: 0.0011,
  },
  clock: {
    startMinute: 18 * 60 + 32,
    minutesPerSecond: 0.55,
    sunsetMinute: 18 * 60 + 20,
  },
};

/** The procedural grid: nine by seven city blocks, a beach and the ocean beyond it. */
export const CITY = {
  cols: 9,
  rows: 7,
  blockSize: 430,
  roadWidth: 108,
  sidewalk: 20,
  beachDepth: 250,
  oceanDepth: 720,
  buildingDensity: 0.93,
  minFloors: 2,
  maxFloors: 15,
  parkBlocks: [
    [2, 2],
    [6, 5],
  ],
  plazaBlock: [4, 3],
};

/** Default screenshot scene and seed when ?shot= is used without ?seed=. */
export const SHOT_MODE = 'cover';
export const SHOT_SEED = 7;

/** No external fonts: the platform UI face, with a humanist fallback. */
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
