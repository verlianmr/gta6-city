// Sunset Palms — the hand-in program.
//
// The game is the static site under game/ plus the renders in screenshots/. This program stages
// both into the output directory (MAKEFUN_OUTPUT_DIR, or /output when unset), refuses to hand in
// anything the platform's gate would refuse, and writes dossier.json with make.fun's vendored
// buildDossier. Node 22, standard library only: no install, no build, no dependencies.
//
//   node main.ts                              # -> /output
//   MAKEFUN_OUTPUT_DIR=/tmp/pkg node main.ts  # -> /tmp/pkg

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

/** What the platform's gate allows: the dossier's text, the screenshots and the game tree. */
type Caps = {
  /** Bytes of source text the dossier may carry. */
  text_max_bytes: number;
  /** At most this many images, each at most this many bytes. */
  screenshots: { max: number; max_bytes: number };
  /** Files and directories under game/ combined. */
  game_max_files: number;
  /** Bytes of all files under game/ combined. */
  game_max_bytes: number;
  /** Longest path under game/, in UTF-8 bytes. */
  game_path_max_bytes: number;
};

const CAPS: Caps = {
  text_max_bytes: 163840, // 160 KiB of source in the dossier
  screenshots: { max: 4, max_bytes: 262144 }, // 4 renders, 256 KiB each
  game_max_files: 993, // entries, directories included
  game_max_bytes: 50331648, // 48 MiB
  game_path_max_bytes: 1000,
};

/** A directory walked once: the platform counts entries, the dossier cares about files and bytes. */
type TreeCount = {
  /** Files plus directories, the number game_max_files bounds. */
  entries: number;
  files: number;
  bytes: number;
  /** Longest relative path in UTF-8 bytes, the number game_path_max_bytes bounds. */
  longestPath: number;
  /** The heaviest single file, for a cap message that can name it. */
  heaviest: { path: string; bytes: number } | null;
};

const DEFAULT_OUTPUT = '/output';
const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));

/** Walk a directory and total it up; refuses anything that is not a plain file or directory. */
function countTree(dir: string, prefix = ''): TreeCount {
  const total: TreeCount = { entries: 0, files: 0, bytes: 0, longestPath: 0, heaviest: null };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const full = join(dir, entry.name);
    total.entries += 1;
    total.longestPath = Math.max(total.longestPath, Buffer.byteLength(relative, 'utf8'));
    if (entry.isDirectory()) {
      const inner = countTree(full, relative);
      total.entries += inner.entries;
      total.files += inner.files;
      total.bytes += inner.bytes;
      total.longestPath = Math.max(total.longestPath, inner.longestPath);
      if (inner.heaviest !== null && (total.heaviest === null || inner.heaviest.bytes > total.heaviest.bytes)) {
        total.heaviest = inner.heaviest;
      }
    } else if (entry.isFile()) {
      const bytes = statSync(full).size;
      total.files += 1;
      total.bytes += bytes;
      if (total.heaviest === null || bytes > total.heaviest.bytes) total.heaviest = { path: relative, bytes };
    } else {
      throw new Error(`${full}: a symbolic link or special file; game/ must hold plain files and directories only`);
    }
  }
  return total;
}

/** Human-readable size for the summary line. */
function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

/** Throw, listing every reason, when the staged tree would be refused by the platform. */
function checkCaps(game: TreeCount, shots: TreeCount): void {
  const problems: string[] = [];

  if (game.entries > CAPS.game_max_files) {
    problems.push(
      `game/ has ${game.entries} entries (files and directories), over the ${CAPS.game_max_files} allowed; ` +
        `remove ${game.entries - CAPS.game_max_files}.`,
    );
  }
  if (game.bytes > CAPS.game_max_bytes) {
    problems.push(
      `game/ comes to ${size(game.bytes)} (${game.bytes} bytes), over the ${size(CAPS.game_max_bytes)} allowed; ` +
        `remove ${size(game.bytes - CAPS.game_max_bytes)}.`,
    );
  }
  if (game.longestPath > CAPS.game_path_max_bytes) {
    problems.push(
      `a path under game/ is ${game.longestPath} bytes, over the ${CAPS.game_path_max_bytes} allowed; shorten it.`,
    );
  }
  if (shots.files > CAPS.screenshots.max) {
    problems.push(
      `screenshots/ holds ${shots.files} images, over the ${CAPS.screenshots.max} allowed; ` +
        `keep 3 or 4 and delete the rest.`,
    );
  }
  if (shots.files < 3) {
    problems.push(
      `screenshots/ holds ${shots.files} image${shots.files === 1 ? '' : 's'}; the entry needs 3 or 4 renders, ` +
        `the first by name being the cover.`,
    );
  }
  if (shots.heaviest !== null && shots.heaviest.bytes > CAPS.screenshots.max_bytes) {
    problems.push(
      `screenshots/${shots.heaviest.path} is ${size(shots.heaviest.bytes)} (${shots.heaviest.bytes} bytes), ` +
        `over the ${size(CAPS.screenshots.max_bytes)} per image allowed; shrink or drop it.`,
    );
  }

  if (problems.length > 0) {
    throw new Error(`hand-in refused by the platform caps:\n  - ${problems.join('\n  - ')}\ndossier.json was not written.`);
  }
}

/** Copy a source directory over its staged twin, replacing whatever was there before. */
function stage(source: string, target: string, label: string): void {
  if (!existsSync(source)) throw new Error(`cannot stage ${label}: ${source} does not exist`);
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}

/** Stage game/ and screenshots/, check the caps, write dossier.json and report what was done. */
function assemble(): void {
  const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? DEFAULT_OUTPUT;
  const stagedGame = join(outputDir, 'game');
  const stagedShots = join(outputDir, 'screenshots');
  const dossierPath = join(outputDir, 'dossier.json');

  mkdirSync(outputDir, { recursive: true });
  stage(join(REPO_ROOT, 'game'), stagedGame, 'game/');
  stage(join(REPO_ROOT, 'screenshots'), stagedShots, 'screenshots/');

  const game = countTree(stagedGame);
  const shots = countTree(stagedShots);
  checkCaps(game, shots);

  const dossier = buildDossier(outputDir, CAPS);
  writeFileSync(dossierPath, dossier);

  console.log(
    [
      'Sunset Palms — hand-in assembled',
      `  output        ${outputDir}`,
      `  game/         ${game.files} files, ${game.entries - game.files} directories, ${size(game.bytes)} (${game.bytes} bytes)`,
      `  screenshots/  ${shots.files} images, ${size(shots.bytes)} (${shots.bytes} bytes)`,
      `  dossier.json  ${size(dossier.length)} (${dossier.length} bytes)`,
      `  caps          ok: <= ${CAPS.game_max_files} entries, <= ${size(CAPS.game_max_bytes)}, ` +
        `<= ${CAPS.screenshots.max} x ${size(CAPS.screenshots.max_bytes)}`,
    ].join('\n'),
  );
}

assemble();
