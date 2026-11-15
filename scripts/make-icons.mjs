#!/usr/bin/env node
/**
 * Generates the app icon (a crossed fork and knife over the letter L) in every size/format
 * the app needs, from SVG, using the Playwright Chromium that's available in dev containers.
 *
 *   node scripts/make-icons.mjs            # uses the colors below
 *
 * Change COLORS to re-theme the icon, then run again and rebuild the app.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright isn't a project dependency; use the copy installed with your tools (or `npm i -g playwright`).
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), ...(process.env.NODE_PATH ?? '').split(':').filter(Boolean)] }));

export const COLORS = {
  background: '#1F4E8C', // icon tile
  letter: '#8FB8F0', // the L
  utensils: '#FFFFFF', // fork and knife
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (p) => join(root, 'assets', 'images', p);

const L_PATH = `
  M 270 150 L 560 150 Q 584 150 584 174 L 584 214 Q 584 234 564 236 L 512 242 L 512 618
  L 724 618 L 736 556 Q 740 532 764 532 L 806 532 Q 830 532 830 556 L 830 850 Q 830 874 806 874
  L 230 874 Q 206 874 206 850 L 206 812 Q 206 790 226 788 L 290 780 L 290 242 L 238 236
  Q 218 234 218 214 L 218 174 Q 218 150 242 150 Z`;

/** Fork pointing up, centered on (0,0), about 760 units long. */
const FORK = `
  M -16 380 Q -22 120 -26 30 Q -28 -10 -40 -40
  Q -78 -80 -78 -150 L -78 -330 Q -78 -344 -66 -344 Q -54 -344 -54 -330 L -54 -170
  Q -54 -160 -44 -160 Q -34 -160 -34 -170 L -34 -340 Q -34 -354 -20 -354 Q -6 -354 -6 -340 L -6 -170
  Q -6 -160 0 -160 Q 6 -160 6 -170 L 6 -340 Q 6 -354 20 -354 Q 34 -354 34 -340 L 34 -170
  Q 34 -160 44 -160 Q 54 -160 54 -170 L 54 -330 Q 54 -344 66 -344 Q 78 -344 78 -330 L 78 -150
  Q 78 -80 40 -40 Q 28 -10 26 30 Q 22 120 16 380 Q 0 400 -16 380 Z`;

/** Knife pointing up (blade edge on the right), centered on (0,0). */
const KNIFE = `
  M -30 380 Q -34 200 -34 70 L -34 -300 Q -34 -370 10 -380 Q 50 -330 52 -200
  Q 54 -60 30 40 Q 28 60 30 80 Q 34 200 30 380 Q 0 404 -30 380 Z
  M -34 40 L 30 40`;

function artwork({ letter, utensils, outline }) {
  const forkT = 'translate(520 512) rotate(-36) scale(0.8)';
  const knifeT = 'translate(520 512) rotate(36) scale(0.8)';
  const utensilPaths = (attrs) => `
      <path transform="${forkT}" d="${FORK}" ${attrs} />
      <path transform="${knifeT}" d="${KNIFE}" fill-rule="evenodd" ${attrs} />`;
  // With outline 'cutout', the gap around the utensils is cut out of the L instead of painted,
  // so one-color (monochrome / themed) icons still show the fork and knife.
  const cut = outline === 'cutout';
  const id = `cut${Math.random().toString(36).slice(2, 8)}`;
  return `
  <g>
    ${cut ? `<mask id="${id}"><rect width="1024" height="1024" fill="white"/>${utensilPaths('fill="black" stroke="black" stroke-width="26" stroke-linejoin="round"')}</mask>` : ''}
    <!-- The L -->
    <path fill="${letter}" ${cut ? `mask="url(#${id})"` : ''} d="${L_PATH}" />
    <!-- Crossed fork and knife, outlined in the tile color so they read clearly over the L -->
    <g fill="${utensils}" ${cut ? '' : `stroke="${outline}" stroke-width="26" stroke-linejoin="round" paint-order="stroke"`}>
      ${utensilPaths('')}
    </g>
  </g>`;
}

const svg = (size, body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  ${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}${body}</svg>`;

/** Scale the artwork about the center (Android adaptive icons crop to the middle ~66%). */
const scaled = (body, k) => `<g transform="translate(512 512) scale(${k}) translate(-512 -508)">${body}</g>`;

const C = COLORS;
const full = artwork({ letter: C.letter, utensils: C.utensils, outline: C.background });
const mono = artwork({ letter: '#FFFFFF', utensils: '#FFFFFF', outline: 'cutout' });

const jobs = [
  // iOS + default icon: full-bleed square (iOS rounds the corners itself)
  ['icon.png', 1024, svg(1024, scaled(full, 0.86), C.background)],
  // Android adaptive icon layers
  ['android-icon-foreground.png', 1024, svg(1024, scaled(full, 0.6), null)],
  ['android-icon-background.png', 1024, svg(1024, '', C.background)],
  ['android-icon-monochrome.png', 1024, svg(1024, scaled(mono, 0.6), null)],
  // Splash screen mark (shown centered on the splash background color)
  ['splash-icon.png', 1024, svg(1024, scaled(full, 0.95), null)],
  ['favicon.png', 48, svg(48, scaled(full, 0.9), C.background)],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, size, markup] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  const png = await page.locator('svg').screenshot({ omitBackground: true });
  mkdirSync(dirname(out(name)), { recursive: true });
  writeFileSync(out(name), png);
  console.log(`wrote assets/images/${name} (${size}px)`);
}
await browser.close();
