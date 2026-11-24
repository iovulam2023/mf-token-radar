// Token Radar driver: one sealed snapshot in, one ranked board out.
//
// Reads a snapshot JSON, scores it with the model in lib/model.ts, and lays
// the result out as an output directory: board.json (the ranked rows),
// data.js (the dashboard's dataset, which dashboard/index.html loads as
// ../data.js), a copy of dashboard/, a copy of screenshots/, and the
// dossier.json that vendor/makefun-board.ts builds over the three.
//
// Usage: node main.ts [--input <snapshot.json>]
// The output directory comes from MAKEFUN_OUTPUT_DIR (default /output);
// the input defaults to /input/snapshot.json.

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** The dossier's text cap, the one figure the scorer compares byte for byte. */
const DOSSIER_TEXT_MAX_BYTES = 65536;

/** This file's own directory: dashboard/ and screenshots/ live beside it. */
const repoDir = dirname(fileURLToPath(import.meta.url));

/** The --input flag's value, in either `--input path` or `--input=path` form. */
function snapshotPath(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--input') {
      const value = argv[i + 1];
      if (value === undefined) throw new Error('--input needs a path after it');
      return value;
    }
    if (arg.startsWith('--input=')) return arg.slice('--input='.length);
  }
  return '/input/snapshot.json';
}

function run(): void {
  const input = snapshotPath(process.argv.slice(2));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

  const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
  const { board, radar } = buildRadar(snapshot);

  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    console.error(`token-radar: refusing this board: ${issue}`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  cpSync(join(repoDir, 'dashboard'), join(outDir, 'dashboard'), { recursive: true });
  writeFileSync(join(outDir, 'data.js'), dataScript(radar));
  cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
  writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, { text_max_bytes: DOSSIER_TEXT_MAX_BYTES }));

  console.log(`token-radar: ${board.length} rows from the ${snapshot.as_of} snapshot, written to ${outDir}`);
}

try {
  run();
} catch (err) {
  console.error(`token-radar: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
