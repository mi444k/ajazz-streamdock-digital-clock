'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AppLauncher } = require('../src/app-launcher.cjs');
const calendar = { id: 'calendar', name: 'Calendar', bundleId: 'com.apple.iCal', path: '/System/Applications/Calendar.app' };
const exampleapp = { id: 'exampleapp', name: 'ExampleApp', bundleId: 'com.example.calendar', path: '/Applications/ExampleApp.app' };
const textEdit = { id: 'textedit', name: 'TextEdit', bundleId: 'com.apple.TextEdit', path: '/System/Applications/TextEdit.app' };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const calls = [], timers = new Map(); let sequence = 0;
  const execFileImpl = (file, args, options, callback) => {
    const child = { kills: 0, kill() { this.kills++; } };
    calls.push({ file, args, options, callback, child }); return child;
  };
  const launcher = new AppLauncher({ platform: 'darwin', helperPath: '/fake/calendar-app-helper', execFileImpl, timeoutMs: 5000, setTimeoutImpl: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, delay }); return id; }, clearTimeoutImpl: id => timers.delete(id) });
  const replyList = (index = 0, applications = [calendar, exampleapp]) => calls[index].callback(null, JSON.stringify({ type: 'applications', applications }), '');
  return { launcher, calls, timers, replyList };
}

test('application listing invokes a bounded read-only helper and coalesces only concurrent listing requests', async () => {
  const f = fixture();
  try {
    const first = f.launcher.list(), second = f.launcher.list(); await flush();
    assert.equal(f.calls.length, 1, 'a catalog request actually invokes the native list operation');
    assert.equal(f.calls[0].file, '/fake/calendar-app-helper'); assert.deepEqual(f.calls[0].args, ['--list']);
    assert.notEqual(f.calls[0].options.shell, true); assert.equal(f.calls[0].options.maxBuffer, 1024 * 1024);
    assert.equal(f.calls[0].options.timeout, 5000);
    f.replyList();
    assert.deepEqual(await first, [calendar, exampleapp]); assert.deepEqual(await second, [calendar, exampleapp]);
    const refreshed = f.launcher.list(); await flush(); assert.equal(f.calls.length, 2);
    f.replyList(1); await refreshed;
  } finally { f.launcher.dispose(); }
});

test('opening an opaque application ID resolves a fresh catalog and launches only its validated path and bundle identity', async () => {
  for (const [id, expected] of [['apple-calendar', calendar], ['exampleapp', exampleapp], ['textedit', textEdit]]) {
    const f = fixture();
    try {
      const pending = f.launcher.open(id); await flush();
      assert.equal(f.calls.length, 1); assert.deepEqual(f.calls[0].args, ['--list']);
      f.replyList(0, [calendar, exampleapp, textEdit]); await flush();
      assert.equal(f.calls.length, 2);
      assert.deepEqual(f.calls[1].args, ['--open', expected.path, '--bundle-id', expected.bundleId]);
      assert.notEqual(f.calls[1].options.shell, true);
      f.calls[1].callback(null, JSON.stringify({ type: 'opened', applicationId: expected.id }), '');
      assert.deepEqual(await pending, { opened: true, applicationId: expected.id });
    } finally { f.launcher.dispose(); }
  }
});

test('an open never trusts an older pending inspector list when the application has disappeared', async () => {
  const f = fixture();
  try {
    const inspector = f.launcher.list();
    const pending = f.launcher.open('exampleapp'); const rejected = assert.rejects(pending, error => error.code === 'missing_app');
    await flush(); assert.equal(f.calls.length, 2, 'open owns a separate fresh list even while an earlier PI list is pending');
    f.replyList(1, [calendar]); await rejected;
    f.replyList(0); await inspector;
    assert.equal(f.calls.some(call => call.args[0] === '--open'), false);
  } finally { f.launcher.dispose(); }
});

test('malformed, duplicate, oversized or untrusted catalog records fail closed instead of becoming launch authority', async () => {
  const records = [
    null, [{ ...calendar, id: '../app' }], [calendar, { ...exampleapp, id: calendar.id }],
    [{ ...calendar, path: '/tmp/Calendar.app' }], [{ ...calendar, path: '/Applications/../tmp/Evil.app' }],
    [{ ...calendar, path: 'https://private.invalid/Calendar.app' }], [{ ...calendar, path: '/Applications/Calendar' }],
    [{ ...calendar, name: 'Bad\nname' }], [{ ...calendar, name: 'N'.repeat(1025) }],
    [{ ...calendar, bundleId: 'B'.repeat(257) }], Array.from({ length: 1025 }, (_, index) => ({ ...calendar, id: 'id-' + index })),
    Array.from({ length: 1024 }, (_, index) => ({ ...calendar, id: 'id-' + index, name: 'N'.repeat(1024) }))
  ];
  for (const applications of records) {
    const f = fixture();
    try {
      const pending = f.launcher.list(); const rejected = assert.rejects(pending, error => error.code === 'invalid_response');
      await flush(); f.replyList(0, applications); await rejected;
      assert.equal(f.calls.some(call => call.args[0] === '--open'), false);
    } finally { f.launcher.dispose(); }
  }
});

test('application settings cannot supply shell syntax, URLs or executable paths as an application ID', async () => {
  for (const id of ['/Applications/Calendar.app', 'https://private.invalid', '../calendar', '$(open Calendar)', '', 'x'.repeat(129), null]) {
    const f = fixture();
    try { await assert.rejects(() => f.launcher.open(id), error => error.code === 'invalid_request'); assert.equal(f.calls.length, 0); }
    finally { f.launcher.dispose(); }
  }
});

test('native launch acknowledgement must match the resolved application and failures never expose raw helper details', async () => {
  for (const response of [{ type: 'opened', applicationId: 'another-app' }, { type: 'opened' }, { type: 'error', code: 'open_failed', message: 'APP_PRIVATE_DETAIL' }]) {
    const f = fixture();
    try {
      const pending = f.launcher.open('exampleapp'); const rejected = assert.rejects(pending, error => { assert.doesNotMatch(error.message, /APP_PRIVATE_DETAIL|private\.invalid/); return true; });
      await flush(); f.replyList(); await flush();
      assert.equal(f.calls.length, 2); f.calls[1].callback(null, JSON.stringify(response), 'APP_PRIVATE_DETAIL');
      await rejected; assert.equal(f.calls.length, 2, 'ambiguous launch results are never retried');
    } finally { f.launcher.dispose(); }
  }
});

test('an unresponsive helper has a bounded timeout and a late catalog cannot trigger a launch', async () => {
  const f = fixture();
  try {
    const pending = f.launcher.list(); const rejected = assert.rejects(pending, error => error.code === 'timeout');
    await flush(); assert.equal(f.calls.length, 1);
    const deadline = [...f.timers.values()].find(timer => timer.delay === 5000); assert.ok(deadline);
    deadline.fn(); await rejected; assert.equal(f.calls[0].child.kills, 1);
    f.replyList(); await flush(); assert.equal(f.calls.length, 1);
  } finally { f.launcher.dispose(); }
});

test('dispose rejects pending catalog work and kills owned children once without later opening anything', async () => {
  const f = fixture();
  const pending = f.launcher.list(); const rejected = assert.rejects(pending, error => error.code === 'closed');
  await flush(); f.launcher.dispose(); f.launcher.dispose();
  assert.equal(f.calls[0].child.kills, 1); await rejected;
  f.replyList(); await flush(); assert.equal(f.calls.length, 1);
  await assert.rejects(() => f.launcher.list(), error => error.code === 'closed');
});
