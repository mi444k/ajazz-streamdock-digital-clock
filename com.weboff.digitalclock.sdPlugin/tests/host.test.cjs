'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { HostPlugin } = require('../src/host.cjs');
const action = 'com.weboff.digitalclock.clock';
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(options = {}) {
  const calls = [], sent = [], timers = new Map(); let sequence = 0, now = new Date(2026, 10, 5, 14, 7, 30, 250);
  const launcher = {
    async list() { calls.push(['list']); return [{ id: 'exampleapp', name: 'ExampleApp', path: '/Applications/ExampleApp.app', bundleId: 'com.example.calendar' }]; },
    async open(id) { calls.push(['open', id]); return { opened: true, applicationId: id }; },
    dispose() { calls.push(['dispose']); }
  };
  const plugin = new HostPlugin({ platform: 'darwin', ...options, uuid: 'clock-instance', send: value => sent.push(value), launcher, now: () => now,
    setTimeoutImpl: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, delay }); return id; }, clearTimeoutImpl: id => timers.delete(id) });
  const appear = (context = 'a', settings = {}, controller = 'Keypad') => plugin.handle({ event: 'willAppear', action, context, payload: { settings, controller } });
  const press = (context = 'a', event = 'keyUp', suppliedAction = action) => plugin.handle({ event, action: suppliedAction, context });
  const applications = (context, requestId) => plugin.handle({ event: 'sendToPlugin', action, context, payload: { command: 'applications', requestId } });
  function time(context = 'a') {
    const image = sent.filter(value => value.event === 'setImage' && value.context === context).at(-1)?.payload.image;
    if (!image?.startsWith('data:image/svg+xml;base64,')) return null;
    return /data-role="time"[^>]*aria-label="([0-9:]+)"/.exec(Buffer.from(image.split(',')[1], 'base64').toString('utf8'))?.[1];
  }
  return { plugin, launcher, calls, sent, timers, appear, press, applications, time, setNow: value => { now = value; } };
}

test('connection registers only the separate clock plugin and clock rendering never reads application metadata', async () => {
  const f = fixture();
  try {
    await f.plugin.handle({ event: 'connected' }); assert.deepEqual(f.sent, [{ event: 'registerPlugin', uuid: 'clock-instance' }]);
    await f.appear(); assert.equal(f.time(), '14:07'); assert.deepEqual(f.calls, []);
    assert.ok(f.sent.filter(value => value.event === 'setTitle').every(value => value.payload.title === ''));
  } finally { f.plugin.dispose(); }
});

test('visible keys share one aligned timer, repaint fresh local time after wake and stop all scheduling when hidden', async () => {
  const f = fixture();
  try {
    await f.appear('a'); await f.appear('b'); assert.equal(f.timers.size, 1);
    const [id, timer] = [...f.timers.entries()][0]; assert.equal(timer.delay, 29750);
    f.timers.delete(id); f.setNow(new Date(2026, 10, 5, 14, 9, 0)); await timer.fn();
    assert.equal(f.time('a'), '14:09'); assert.equal(f.time('b'), '14:09'); assert.equal(f.timers.size, 1);
    f.setNow(new Date(2026, 10, 6, 0, 0, 0)); await f.plugin.handle({ event: 'systemDidWakeUp' });
    assert.equal(f.time('a'), '00:00'); assert.equal(f.timers.size, 1); assert.deepEqual(f.calls, []);
    await f.plugin.handle({ event: 'willDisappear', action, context: 'a' }); assert.equal(f.timers.size, 1);
    await f.plugin.handle({ event: 'willDisappear', action, context: 'b' }); assert.equal(f.timers.size, 0);
    const count = f.sent.length; await timer.fn(); assert.equal(f.sent.length, count); assert.equal(f.timers.size, 0);
  } finally { f.plugin.dispose(); }
});

test('each key opens its own persisted application while omitted settings default to Apple Calendar', async () => {
  const f = fixture();
  try {
    await f.appear('a', { applicationId: 'exampleapp', displayName: 'ExampleApp', path: '/tmp/Evil.app', command: 'ignored' }); await f.appear('b');
    await f.press('a'); await f.press('b');
    await f.plugin.handle({ event: 'didReceiveSettings', action, context: 'a', payload: { settings: { applicationId: 'another-app', displayName: 'Another app' } } });
    await f.press('a'); await f.press('b');
    assert.deepEqual(f.calls, [['open', 'exampleapp'], ['open', 'apple-calendar'], ['open', 'another-app'], ['open', 'apple-calendar']]);
  } finally { f.plugin.dispose(); }
});

test('controller release guards and a shared launch lock prevent duplicate or mismatched application opens', async () => {
  const f = fixture(); let release;
  try {
    await f.appear('a'); await f.appear('b', {}, 'Knob'); await f.appear('c', {}, 'Encoder');
    for (const [context, event, suppliedAction] of [['a', 'keyDown', action], ['a', 'dialUp', action], ['b', 'keyUp', action], ['b', 'dialDown', action], ['b', 'dialRotate', action], ['missing', 'keyUp', action], ['a', 'keyUp', 'other.action']]) await f.press(context, event, suppliedAction);
    assert.deepEqual(f.calls, []);
    f.launcher.open = async id => { f.calls.push(['open', id]); return new Promise(resolve => { release = resolve; }); };
    const first = f.press('a'); const duplicate = f.press('b', 'dialUp'); await flush(); assert.equal(f.calls.length, 1);
    release({ opened: true, applicationId: 'calendar' }); await Promise.all([first, duplicate]); await flush(); assert.equal(f.calls.length, 1);
    f.launcher.open = async id => { f.calls.push(['open', id]); return { opened: true, applicationId: 'calendar' }; };
    await f.press('b', 'dialUp'); await f.press('c', 'dialUp'); assert.equal(f.calls.length, 3);
  } finally { f.plugin.dispose(); }
});

test('invalid saved IDs and helper failures alert instead of launching a default or claiming success', async () => {
  const f = fixture();
  try {
    await f.appear('bad', { applicationId: '/tmp/Evil.app', displayName: 'Ignored' }); await f.press('bad');
    assert.equal(f.calls.length, 0); assert.ok(f.sent.some(value => value.event === 'showAlert' && value.context === 'bad'));
    await f.appear('a'); f.launcher.open = async id => { f.calls.push(['open', id]); throw new Error('PRIVATE_HELPER_DETAIL'); };
    await f.press(); assert.equal(f.calls.length, 1);
    assert.ok(f.sent.some(value => value.event === 'showAlert' && value.context === 'a'));
    assert.doesNotMatch(JSON.stringify(f.sent), /PRIVATE_HELPER_DETAIL|Evil\.app/);
  } finally { f.plugin.dispose(); }
});

test('inspector application catalogs return to the requesting context and expose only safe selection metadata', async () => {
  const f = fixture();
  try {
    await f.appear('a', { applicationId: 'exampleapp', displayName: 'ExampleApp' }); await f.appear('b');
    await f.applications('a', 'request-a'); await f.applications('b', 'request-b');
    const replies = f.sent.filter(value => value.event === 'sendToPropertyInspector');
    assert.equal(replies.length, 2);
    assert.equal(replies[0].context, 'a'); assert.equal(replies[0].payload.requestId, 'request-a');
    assert.deepEqual(replies[0].payload.applications, [{ id: 'exampleapp', name: 'ExampleApp' }]);
    assert.deepEqual(replies[0].payload.settings, { applicationId: 'exampleapp', displayName: 'ExampleApp' });
    assert.equal(replies[1].context, 'b'); assert.equal(replies[1].payload.settings.applicationId, 'apple-calendar');
    assert.doesNotMatch(JSON.stringify(replies), /\.app|bundleId|de\.weboff/);
    assert.equal(f.calls.some(call => call[0] === 'open'), false);
  } finally { f.plugin.dispose(); }
});

test('late catalogs and timer callbacks cannot repaint a replaced context or a disposed plugin', async () => {
  const f = fixture(); let release;
  await f.appear(); const timer = [...f.timers.values()][0];
  f.launcher.list = async () => new Promise(resolve => { release = resolve; });
  const pending = f.applications('a', 'old-request');
  assert.equal(typeof release, 'function', 'the inspector request reaches the application catalog');
  await f.plugin.handle({ event: 'willDisappear', action, context: 'a' }); await f.appear('a', { applicationId: 'new-app', displayName: 'New app' });
  release([{ id: 'exampleapp', name: 'ExampleApp', path: '/Applications/ExampleApp.app', bundleId: 'com.example.calendar' }]); await pending;
  assert.equal(f.sent.some(value => value.event === 'sendToPropertyInspector' && value.payload.requestId === 'old-request'), false);
  f.plugin.dispose(); f.plugin.dispose(); assert.equal(f.timers.size, 0);
  const count = f.sent.length; await timer.fn(); assert.equal(f.sent.length, count);
  assert.equal(f.calls.filter(call => call[0] === 'dispose').length, 1);
});

test('a late application-open failure cannot alert a replacement key selection', async () => {
  for (const replaced of [false, true]) {
    const f = fixture(); let reject;
    try {
      await f.appear('a', { applicationId: 'exampleapp', displayName: 'ExampleApp' });
      f.launcher.open = async () => new Promise((_resolve, fail) => { reject = fail; });
      const pending = f.press(); assert.equal(typeof reject, 'function');
      if (replaced) {
        await f.plugin.handle({ event: 'willDisappear', action, context: 'a' });
        await f.appear('a', { applicationId: 'another-app', displayName: 'Another app' });
      } else await f.plugin.handle({ event: 'didReceiveSettings', action, context: 'a', payload: { settings: { applicationId: 'another-app', displayName: 'Another app' } } });
      reject(new Error('Old launch failed')); await pending;
      assert.equal(f.sent.some(message => message.event === 'showAlert'), false);
      assert.equal(f.sent.some(message => message.event === 'sendToPropertyInspector' && message.payload.type === 'error'), false);
    } finally { f.plugin.dispose(); }
  }
});


test('Windows catalog replies identify the runtime platform without exposing launch identities to the inspector', async () => {
  const f = fixture({ platform: 'win32' });
  try {
    f.launcher.list = async () => [{ id: 'example-app', name: 'Example App', appUserModelId: 'Example.Package!App' }];
    await f.appear(); await f.applications('a', 'windows-catalog');
    const payload = f.sent.find(message => message.event === 'sendToPropertyInspector').payload;
    assert.equal(payload.platform, 'win32');
    assert.deepEqual(payload.applications, [{ id: 'example-app', name: 'Example App' }]);
    assert.equal(JSON.stringify(payload).includes('Example.Package!App'), false);
  } finally { f.plugin.dispose(); }
});
