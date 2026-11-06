'use strict';
// Visual acceptance on actual Windows Chrome; the date is a fixed synthetic fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { renderClockImage } = require('../src/key-image.cjs');
assert.equal(process.platform, 'win32', 'Actual Windows rendering is required.');
const chrome = [process.env.CHROME_PATH, ...[process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean).map(root => path.join(root, 'Google/Chrome/Application/chrome.exe'))].find(file => file && fs.existsSync(file));
assert.ok(chrome, 'Windows Google Chrome is required.');
const svg = Buffer.from(renderClockImage(new Date(2026, 10, 5, 23, 59)).split(',')[1], 'base64').toString('utf8');
assert.match(svg, /fill="#000000"/); assert.match(svg, /aria-label="23:59"/); assert.match(svg, /aria-label="05\.11"/);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'digital-clock-render-'));
const output = path.join(__dirname, 'render-output'); fs.mkdirSync(output, { recursive: true });
try {
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:16px;background:#ddd;display:flex;gap:24px}svg{width:192px;height:192px}svg+svg{width:64px;height:64px}svg text{font-family:'Trebuchet MS',sans-serif!important}</style>${svg}${svg}<pre id="result">pending</pre><script>(async()=>{await document.fonts.ready;const rows=[...document.querySelectorAll('svg text,svg polygon,svg circle')].map(node=>{const a=node.getBoundingClientRect(),b=node.ownerSVGElement.getBoundingClientRect();return {x:(a.left-b.left)*64/b.width,right:(a.right-b.left)*64/b.width,y:(a.top-b.top)*64/b.height,bottom:(a.bottom-b.top)*64/b.height};});document.getElementById('result').textContent=JSON.stringify({ready:true,rows,days:document.querySelectorAll('svg text[data-weekday]').length,active:document.querySelectorAll('svg text[data-active="true"]').length});})();</script>`;
  const input = path.join(temporary, 'render.html'); fs.writeFileSync(input, html.replace('<style>', '<style>pre{display:none}'));
  const result = spawnSync(chrome, ['--headless', '--no-first-run', `--user-data-dir=${path.join(temporary, 'profile')}`, '--dump-dom', '--virtual-time-budget=10000', '--window-size=650,320', `--screenshot=${path.join(output, 'digital-clock-windows.png')}`, pathToFileURL(input).href], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
  assert.ifError(result.error); assert.equal(result.status, 0);
  const match = result.stdout.match(/<pre id="result">([^<]+)<\/pre>/); assert.ok(match);
  const data = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')); assert.equal(data.ready, true); assert.equal(data.days, 14); assert.equal(data.active, 2); assert.ok(data.rows.length > 100);
  for (const row of data.rows) for (const [key, value] of Object.entries(row)) assert.ok(Number.isFinite(value) && value >= -0.05 && value <= 64.05, 'Rendered ' + key + ' stays inside the key.');
  assert.ok(fs.statSync(path.join(output, 'digital-clock-windows.png')).size > 0);
  console.log(JSON.stringify({ platform: process.platform, syntheticDate: true, measuredGraphics: data.rows.length, blackBackground: true, allBoundsInside64: true, screenshot: 'digital-clock-windows.png' }));
} finally { fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
