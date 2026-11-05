'use strict';
function validDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError('A valid clock date is required.');
  return date;
}
function clockParts(date) {
  validDate(date);
  const pad = value => String(value).padStart(2, '0');
  const hours = pad(date.getHours()), minutes = pad(date.getMinutes());
  return { hours, minutes, time: hours + ':' + minutes, date: pad(date.getDate()) + '.' + pad(date.getMonth() + 1), weekday: (date.getDay() + 6) % 7 };
}
function millisecondsToNextMinute(date) {
  validDate(date);
  return 60000 - date.getSeconds() * 1000 - date.getMilliseconds();
}
module.exports = { clockParts, millisecondsToNextMinute };
