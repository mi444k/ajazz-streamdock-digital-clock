'use strict';
// Read-only real-Windows integration acceptance. Every launch identity is guaranteed invalid.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
assert.equal(process.platform, 'win32', 'Actual Windows is required.');
const helper = path.join(__dirname, '../native/calendar-app-helper.exe');
function run(args) {
  const result = spawnSync(helper, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true });
  assert.ifError(result.error); assert.equal(result.status, 0, 'Protocol errors do not crash the helper.');
  assert.equal(result.stderr, '', 'Native errors contain no raw OS details.');
  return JSON.parse(result.stdout);
}
const catalog = run(['--list']);
assert.equal(catalog.type, 'applications');
assert.ok(Array.isArray(catalog.applications) && catalog.applications.length > 0 && catalog.applications.length <= 1024);
const ids = new Set(), identities = new Set();
for (const app of catalog.applications) {
  assert.match(app.id, /^[a-f0-9]{64}$/); assert.equal(ids.has(app.id), false); ids.add(app.id);
  assert.ok(typeof app.name === 'string' && app.name.length > 0 && app.name.length <= 1024);
  assert.ok(typeof app.appUserModelId === 'string' && app.appUserModelId.length > 0 && app.appUserModelId.length <= 1024);
  assert.equal(identities.has(app.appUserModelId), false); identities.add(app.appUserModelId);
  assert.equal(Object.hasOwn(app, 'path'), false);
}
for (const args of [[], ['--open'], ['--open', '../never-a-catalog-id'], ['--open', 'https://invalid.example'], ['--open', 'C:\\never-a-catalog-command.exe']]) {
  const result = run(args); assert.equal(result.type, 'error');
  assert.ok(['invalid_request', 'invalid_command', 'missing_app'].includes(result.code));
}
console.log(JSON.stringify({ platform: process.platform, installedApplications: catalog.applications.length,
  boundedUniqueCatalog: true, invalidLaunchesRejected: 5, actualApplicationsOpened: 0 }));
