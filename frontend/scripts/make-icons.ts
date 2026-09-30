/**
 * Renders the PNG app icons in public/ from the logo mark (src/favicon.svg is the vector original):
 * apple-touch-icon.png (180), icon-192.png and icon-512.png, plus icon-maskable-512.png with the safe-zone padding
 * Android's adaptive icons crop to. Run with `bun scripts/make-icons.ts` after changing the mark; the PNGs are committed.
 * Needs playwright-core and a local Chrome (CHROME_PATH to override).
 */
import { chromium } from "playwright-core";
import path from "node:path";

const root = path.join(import.meta.dir, "..");

// The mark on a 32-unit grid, as in src/components/brand/Logo.tsx.
const bars = `<rect x="7" y="13" width="3.5" height="6" rx="1.75" fill="#151512"/><rect x="14.25" y="8" width="3.5" height="16" rx="1.75" fill="#151512"/><rect x="21.5" y="11" width="3.5" height="10" rx="1.75" fill="#151512"/>`;
const rounded = (size: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#C6F135"/>${bars}</svg>`;
// Maskable: full-bleed background, the bars scaled into the central 80% safe zone.
const maskable = (size: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" fill="#C6F135"/><g transform="translate(16 16) scale(0.72) translate(-16 -16)">${bars}</g></svg>`;

const ICONS = [
    { file: "apple-touch-icon.png", size: 180, svg: maskable },
    { file: "icon-192.png", size: 192, svg: rounded },
    { file: "icon-512.png", size: 512, svg: rounded },
    { file: "icon-maskable-512.png", size: 512, svg: maskable },
];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
    await page.setContent(`<html><body style="margin:0;background:transparent">${icon.svg(icon.size)}</body></html>`);
    await page.screenshot({ path: path.join(root, "public", icon.file), omitBackground: true, clip: { x: 0, y: 0, width: icon.size, height: icon.size } });
    await page.close();
    console.log(`wrote public/${icon.file}`);
}
await browser.close();
