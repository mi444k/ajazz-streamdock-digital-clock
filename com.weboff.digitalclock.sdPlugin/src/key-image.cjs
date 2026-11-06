'use strict';
const { clockParts } = require('./core.cjs');
const SEGMENTS = {
  a: '2,0 8,0 10,2 8,3 2,3 0,2',
  b: '8,3 10,2 10,11 8,12 7,10 7,5',
  c: '8,12 10,13 10,22 8,24 7,21 7,14',
  d: '2,21 8,21 10,23 8,24 2,24 0,23',
  e: '0,13 2,12 3,14 3,21 2,24 0,22',
  f: '0,2 2,3 3,5 3,10 2,12 0,11',
  g: '2,10.5 8,10.5 10,12 8,13.5 2,13.5 0,12'
};
const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
function renderClockImage(date) {
  const parts = clockParts(date);
  const svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">',
    '<rect width="64" height="64" fill="#000000"/>'];
  ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].forEach((day, index) => {
    svg.push('<text data-weekday="' + index + '" data-active="' + (index === parts.weekday) + '" x="' + (6 + index * 8.6) + '" y="10" text-anchor="middle" font-family="Avenir Next, Trebuchet MS, sans-serif" font-size="4.8" textLength="6.5" lengthAdjust="spacingAndGlyphs" font-weight="700" fill="' + (index === parts.weekday ? '#ff941c' : '#62594f') + '">' + day + '</text>');
  });
  svg.push('<g data-role="time" aria-label="' + parts.time + '">');
  Array.from(parts.hours + parts.minutes).forEach((digit, position) => {
    svg.push('<g data-role="digit" data-value="' + digit + '" transform="translate(' + [3, 17, 37, 51][position] + ' 18) scale(1 1.1)">');
    for (const [name, points] of Object.entries(SEGMENTS)) {
      const active = DIGITS[Number(digit)].includes(name);
      svg.push('<polygon data-segment="' + name + '" data-active="' + active + '" points="' + points + '" fill="' + (active ? '#ff941c' : '#291b0e') + '"/>');
    }
    svg.push('</g>');
  });
  svg.push('<circle cx="32" cy="27" r="1.1" fill="#ff941c"/><circle cx="32" cy="37" r="1.1" fill="#ff941c"/></g>');
  svg.push('<g data-role="date" aria-label="' + parts.date + '">');
  Array.from(parts.date.replace('.', '')).forEach((digit, position) => {
    svg.push('<g data-role="date-digit" data-value="' + digit + '" transform="translate(' + [18, 25, 34, 41][position] + ' 49) scale(.5)">');
    for (const [name, points] of Object.entries(SEGMENTS)) {
      const active = DIGITS[Number(digit)].includes(name);
      svg.push('<polygon data-segment="' + name + '" data-active="' + active + '" points="' + points + '" fill="' + (active ? '#ffffff' : '#242728') + '"/>');
    }
    svg.push('</g>');
  });
  svg.push('<circle cx="32" cy="60" r=".6" fill="#ffffff"/></g></svg>');
  return 'data:image/svg+xml;base64,' + Buffer.from(svg.join(''), 'utf8').toString('base64');
}
module.exports = { renderClockImage };
