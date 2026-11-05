'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { clockParts, millisecondsToNextMinute } = require('../src/core.cjs');

test('clock fields use local 24-hour time, DD.MM and a Monday-first weekday', () => {
  assert.deepEqual(clockParts(new Date(2026, 10, 5, 14, 7)), { hours: '14', minutes: '07', time: '14:07', date: '05.11', weekday: 3 });
  assert.deepEqual(clockParts(new Date(2026, 0, 1, 0, 0)), { hours: '00', minutes: '00', time: '00:00', date: '01.01', weekday: 3 });
});

test('midnight and year rollover refresh both the date and weekday without a synthetic 24-hour timer', () => {
  assert.deepEqual(clockParts(new Date(2026, 11, 31, 23, 59)), { hours: '23', minutes: '59', time: '23:59', date: '31.12', weekday: 3 });
  assert.deepEqual(clockParts(new Date(2027, 0, 1, 0, 0)), { hours: '00', minutes: '00', time: '00:00', date: '01.01', weekday: 4 });
  assert.equal(clockParts(new Date(2026, 10, 8, 12, 0)).weekday, 6);
  assert.equal(clockParts(new Date(2026, 10, 9, 12, 0)).weekday, 0);
});

test('minute scheduling aligns to the next real boundary with a positive delay of at most one minute', () => {
  for (const [second, millisecond, expected] of [[0, 0, 60000], [30, 250, 29750], [59, 999, 1], [59, 0, 1000]]) {
    assert.equal(millisecondsToNextMinute(new Date(2026, 10, 5, 14, 7, second, millisecond)), expected);
  }
});

test('invalid dates fail explicitly rather than displaying invented clock fields or scheduling an invalid timer', () => {
  for (const value of [new Date(NaN), null, '2026-11-05', {}]) {
    assert.throws(() => clockParts(value)); assert.throws(() => millisecondsToNextMinute(value));
  }
});
