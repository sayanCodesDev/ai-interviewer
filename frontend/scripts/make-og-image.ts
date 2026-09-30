/**
 * Renders public/og.png (the 1200x630 link-preview card) from the site's own fonts and colours.
 * Run with `bun scripts/make-og-image.ts` after changing the wording; the PNG is committed.
 * Needs playwright-core and a local Chrome (CHROME_PATH to override).
 */
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dir, "..");
const FONTS: Record<string, string> = {
  "geist-latin-wght-normal.woff2": "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
  "instrument-serif-latin-400-normal.woff2": "node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2",
  "instrument-serif-latin-400-italic.woff2": "node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2",
};
// Embedded as data URLs: the page is set with setContent (about:blank), which cannot load file:// fonts, so they would
// silently fall back to Times and Arial.
const font = (name: string) => `data:font/woff2;base64,${readFileSync(path.join(root, FONTS[name]!)).toString("base64")}`;

const MARK = `<svg width="46" height="46" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#C6F135"/><circle cx="10.5" cy="9.5" r="2.6" fill="#151512"/><rect x="8.3" y="14" width="4.4" height="11" rx="2.2" fill="#151512"/><path d="M17 12.5a6.5 6.5 0 0 1 0 9" stroke="#151512" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M21.2 9.3a11 11 0 0 1 0 15.4" stroke="#151512" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Geist";src:url("${font("geist-latin-wght-normal.woff2")}");font-weight:100 900}
@font-face{font-family:"Serif";src:url("${font("instrument-serif-latin-400-normal.woff2")}")}
@font-face{font-family:"Serif";font-style:italic;src:url("${font("instrument-serif-latin-400-italic.woff2")}")}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#0e0e0c;color:#f2f0ea;font-family:"Geist",sans-serif;position:relative;overflow:hidden}
.brand{position:absolute;left:72px;top:62px;display:flex;align-items:center;gap:16px;font-family:"Serif";font-size:40px;letter-spacing:-0.5px}
h1{position:absolute;left:72px;top:158px;width:820px;font-family:"Serif";font-weight:400;font-size:112px;line-height:0.96;letter-spacing:-2.5px}
h1 em{color:#c6f135}
p{position:absolute;left:72px;top:418px;width:740px;font-size:26px;line-height:1.42;color:#9a988f}
.tag{position:absolute;left:72px;bottom:52px;font-family:"Geist",sans-serif;font-size:17px;letter-spacing:2.5px;text-transform:uppercase;color:#6f6d66}
.wave{position:absolute;right:80px;top:170px;width:250px;height:300px;display:flex;align-items:center;justify-content:space-between}
.wave i{display:block;width:22px;border-radius:11px;background:#c6f135}
</style></head><body>
<div class="brand">${MARK}Intervyu</div>
<h1>Do the interview<br><em>before the interview.</em></h1>
<p>AI mock interviews for software engineers. Talk it through, code against real tests, get a scored report.</p>
<div class="tag">Coding · System design · Behavioral · Scored report</div>
<div class="wave">${[70, 130, 210, 290, 180, 250, 110, 190, 90].map((h) => `<i style="height:${h}px"></i>`).join("")}</div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
const families = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family));
if (!families.includes("Serif") || !families.includes("Geist")) throw new Error(`The fonts did not load (${families.join(", ") || "none"}); refusing to write an image in fallback fonts.`);
await page.screenshot({ path: path.join(root, "public", "og.png") });
await browser.close();
console.log("wrote public/og.png");
