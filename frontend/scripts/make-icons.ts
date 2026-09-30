/**
 * Renders the PNG app icons in public/ from the logo mark (src/favicon.svg is the vector original):
 * apple-touch-icon.png (180), icon-192.png and icon-512.png, plus icon-maskable-512.png with the safe-zone padding
 * Android's adaptive icons crop to. Run with `bun scripts/make-icons.ts` after changing the mark; the PNGs are committed.
 * Needs playwright-core and a local Chrome (CHROME_PATH to override).
 */
import { chromium } from "playwright-core";
import path from "node:path";

const root = path.join(import.meta.dir, "..");

// The mark on a 32-unit grid, as in src/components/brand/Logo.tsx (the "i" and its voice waves).
const bars = `<circle cx="10.5" cy="9.5" r="2.6" fill="#151512"/><rect x="8.3" y="14" width="4.4" height="11" rx="2.2" fill="#151512"/><path d="M17 12.5a6.5 6.5 0 0 1 0 9" stroke="#151512" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M21.2 9.3a11 11 0 0 1 0 15.4" stroke="#151512" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
const rounded = (size: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#C6F135"/>${bars}</svg>`;
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
