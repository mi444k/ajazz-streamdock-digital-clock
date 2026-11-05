'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderClockImage } = require('../src/key-image.cjs');
function svg(date) {
  const image = renderClockImage(date);
  assert.ok(typeof image === 'string' && image.startsWith('data:image/svg+xml;base64,'), 'the clock renders an actual SVG key image');
  return Buffer.from(image.split(',')[1], 'base64').toString('utf8');
}
function digits(source) { return [...source.matchAll(/<g\b([^>]*data-role="digit"[^>]*)>([\s\S]*?)<\/g>/g)]; }

test('the 64px clock contains four geometric digits, accessible HH:MM and the requested date with no external dependencies', () => {
  const source = svg(new Date(2026, 10, 5, 14, 7));
  assert.match(source, /viewBox="0 0 64 64"/);
  assert.match(source, /data-role="time"[^>]*aria-label="14:07"/);
  assert.deepEqual(digits(source).map(match => /data-value="(\d)"/.exec(match[1])?.[1]), ['1', '4', '0', '7']);
  assert.match(source, /<g\b[^>]*data-role="date"[^>]*aria-label="05\.11"/);
  assert.doesNotMatch(source, /<script|<foreignObject|<image|https?:\/\/(?!www\.w3\.org)|weather|temperature|°/i);
});

test('each decimal digit activates the canonical seven-segment geometry rather than relying on a digital font', () => {
  const expected = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
  for (let value = 0; value <= 9; value++) {
    const last = digits(svg(new Date(2026, 10, 5, 0, value))).at(-1);
    assert.ok(last);
    const segments = [...last[2].matchAll(/<polygon\b([^>]*)/g)];
    assert.equal(segments.length, 7);
    const active = segments.filter(match => /data-active="true"/.test(match[1])).map(match => /data-segment="([a-g])"/.exec(match[1])?.[1]).sort().join('');
    assert.equal(active, expected[value], String(value));
  }
});

test('seven weekdays are shown in order and only the actual local weekday is highlighted', () => {
  for (const [day, active] of [[5, 3], [8, 6], [9, 0]]) {
    const source = svg(new Date(2026, 10, day, 12, 0));
    const weekdays = [...source.matchAll(/<text\b([^>]*data-weekday="[0-6]"[^>]*)>([^<]*)<\/text>/g)];
    assert.deepEqual(weekdays.map(match => match[2]), ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
    assert.deepEqual(weekdays.filter(match => /data-active="true"/.test(match[1])).map(match => Number(/data-weekday="([0-6])"/.exec(match[1])[1])), [active]);
  }
});
