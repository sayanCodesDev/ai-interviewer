/**
 * Renders public/og.png (the 1200x630 link-preview card) from the site's own fonts and colours.
 * Run with `bun scripts/make-og-image.ts` after changing the wording; the PNG is committed.
 * Needs playwright-core and a local Chrome (CHROME_PATH to override).
 */
import { chromium } from "playwright-core";
import path from "node:path";

const root = path.join(import.meta.dir, "..");
const FONTS: Record<string, string> = {
  "geist-latin-wght-normal.woff2": "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
  "instrument-serif-latin-400-normal.woff2": "node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2",
  "instrument-serif-latin-400-italic.woff2": "node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2",
};
const font = (name: string) => `file://${path.join(root, FONTS[name]!)}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Geist";src:url("${font("geist-latin-wght-normal.woff2")}");font-weight:100 900}
@font-face{font-family:"Serif";src:url("${font("instrument-serif-latin-400-normal.woff2")}")}
@font-face{font-family:"Serif";font-style:italic;src:url("${font("instrument-serif-latin-400-italic.woff2")}")}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#0e0e0c;color:#f2f0ea;font-family:"Geist",sans-serif;position:relative;overflow:hidden}
.grid{position:absolute;inset:0;background-image:linear-gradient(#1c1c18 1px,transparent 1px),linear-gradient(90deg,#1c1c18 1px,transparent 1px);background-size:60px 60px;opacity:.55;mask-image:radial-gradient(ellipse at 75% 60%,#000,transparent 70%)}
.brand{position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:16px;font-family:"Serif";font-size:36px}
h1{position:absolute;left:72px;top:172px;width:760px;font-family:"Serif";font-weight:400;font-size:88px;line-height:1;letter-spacing:-1.5px}
h1 em{color:#c6f135}
p{position:absolute;left:72px;top:474px;width:700px;font-size:26px;line-height:1.4;color:#9a988f}
.wave{position:absolute;right:72px;top:150px;width:290px;height:330px;display:flex;align-items:center;justify-content:space-between}
.wave i{display:block;width:26px;border-radius:13px;background:#c6f135}
</style></head><body><div class="grid"></div>
<div class="brand"><svg width="44" height="44" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#C6F135"/><rect x="7" y="13" width="3.5" height="6" rx="1.75" fill="#151512"/><rect x="14.25" y="8" width="3.5" height="16" rx="1.75" fill="#151512"/><rect x="21.5" y="11" width="3.5" height="10" rx="1.75" fill="#151512"/></svg>AI Interviewer</div>
<h1>The technical<br>interview that<br><em>talks back</em></h1>
<p>Practise out loud, solve problems in a live editor, and get a scored report with a study plan.</p>
<div class="wave">${[70, 130, 210, 300, 180, 250, 110, 190, 90].map((h) => `<i style="height:${h}px"></i>`).join("")}</div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(root, "public", "og.png") });
await browser.close();
console.log("wrote public/og.png");
