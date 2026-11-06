'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const action = 'com.weboff.digitalclock.clock';
function fixture() {
  class Element {
    constructor() { this.value = ''; this.textContent = ''; this.children = []; this.disabled = false; this.dataset = {}; this.listeners = {}; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    appendChild(value) { this.children.push(value); return value; }
    replaceChildren(...values) { this.children = values; }
    get options() { return this.children; }
    get selectedOptions() { return this.children.filter(value => value.value === this.value); }
    set innerHTML(value) { if (value !== '') throw new Error('Unsafe HTML insertion'); this.children = []; }
    async emit(type) { return this.listeners[type]?.({ target: this }); }
    async click() { return this.emit('click'); }
  }
  const ids = new Map(['calendar-application', 'save-application', 'refresh-applications', 'status'].map(id => [id, new Element()]));
  class Socket {
    static OPEN = 1; static instances = [];
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; Socket.instances.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    async emit(type, value) { return this['on' + type]?.(value); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  const timers = new Map(); let timerSequence = 0;
  const context = { document: { getElementById: id => ids.get(id), createElement: () => new Element() }, WebSocket: Socket, console,
    setTimeout: (fn, delay) => { const id = ++timerSequence; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
    fetch() { throw new Error('The inspector must use its native backend.'); } };
  context.window = context; vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../property-inspector/inspector.js'), 'utf8'), context);
  async function connect({ settings = {}, uuid = 'key-a', objectInfo = false, actionContext = uuid } = {}) {
    assert.equal(typeof context.connectElgatoStreamDeckSocket, 'function', 'the inspector exposes the native registration callback');
    const info = { action, ...(actionContext === null ? {} : { context: actionContext }), payload: { settings } };
    context.connectElgatoStreamDeckSocket('23599', uuid, 'registerPropertyInspector', '{}', objectInfo ? info : JSON.stringify(info));
    const socket = Socket.instances.at(-1); assert.ok(socket); await socket.emit('open'); return socket;
  }
  const request = socket => socket.sent.filter(message => message.event === 'sendToPlugin' && message.payload.command === 'applications').at(-1);
  async function receive(socket, payload, uuid = 'key-a') { await socket.emit('message', { data: JSON.stringify({ event: 'sendToPropertyInspector', action, context: uuid, payload }) }); }
  return { context, ids, connect, request, receive, timers, sockets: Socket.instances };
}

test('native inspector registration requests its application list through the backend without changing settings', async () => {
  const f = fixture(); const socket = await f.connect();
  assert.equal(typeof f.context.connectSocket, 'function');
  assert.equal(socket.url, 'ws://127.0.0.1:23599');
  assert.deepEqual(socket.sent[0], { event: 'registerPropertyInspector', uuid: 'key-a' });
  const request = f.request(socket); assert.ok(request);
  assert.equal(request.context, 'key-a'); assert.equal(request.action, action);
  assert.match(request.payload.requestId, /^[A-Za-z0-9_-]{1,128}$/);
  assert.equal(socket.sent.some(message => message.event === 'setSettings'), false);
});

test('application choices default to Apple Calendar and Save persists only the selected ID and display name', async () => {
  for (const objectInfo of [false, true]) {
    const f = fixture(); const socket = await f.connect({ objectInfo });
    await f.receive(socket, { type: 'applications', requestId: f.request(socket).payload.requestId, applications: [{ id: 'exampleapp', name: 'ExampleApp', path: '/tmp/Evil.app', bundleId: 'ignored' }, { id: 'unsafe-name', name: '<img src=x onerror=bad>' }], settings: { applicationId: 'apple-calendar', displayName: 'Apple Calendar' } });
    const select = f.ids.get('calendar-application'); assert.equal(select.value, 'apple-calendar');
    assert.ok(select.options.some(option => option.value === 'exampleapp' && option.textContent === 'ExampleApp'));
    assert.ok(select.options.some(option => option.textContent === '<img src=x onerror=bad>'));
    select.value = 'exampleapp'; await select.emit('change'); await f.ids.get('save-application').click();
    const saved = socket.sent.filter(message => message.event === 'setSettings');
    assert.equal(saved.length, 1); assert.equal(saved[0].context, 'key-a');
    assert.deepEqual(saved[0].payload, { applicationId: 'exampleapp', displayName: 'ExampleApp' });
    assert.equal(socket.sent.some(message => message.payload?.command === 'open'), false);
  }
});

test('an unavailable saved application is preserved until a valid replacement is explicitly selected', async () => {
  const f = fixture(); const socket = await f.connect({ settings: { applicationId: 'missing-app', displayName: 'My calendar' } });
  await f.receive(socket, { type: 'applications', requestId: f.request(socket).payload.requestId, applications: [{ id: 'exampleapp', name: 'ExampleApp' }], settings: { applicationId: 'missing-app', displayName: 'My calendar' } });
  assert.equal(f.ids.get('calendar-application').value, 'missing-app');
  assert.equal(f.ids.get('save-application').disabled, true);
  assert.match(f.ids.get('status').textContent, /unavailable|not installed|missing/i);
  await f.ids.get('save-application').click(); assert.equal(socket.sent.some(message => message.event === 'setSettings'), false);
  f.ids.get('calendar-application').value = 'exampleapp'; await f.ids.get('calendar-application').emit('change'); await f.ids.get('save-application').click();
  assert.ok(socket.sent.some(message => message.event === 'getSettings' && message.context === 'key-a'), 'SDK readback is explicitly requested after setSettings');
  assert.equal(socket.sent.filter(message => message.event === 'setSettings').at(-1).payload.applicationId, 'exampleapp');
});

test('older application lists and replies addressed to another key cannot overwrite current inspector choices', async () => {
  const f = fixture(); const socket = await f.connect(); const first = f.request(socket).payload.requestId;
  await f.ids.get('refresh-applications').click(); const second = f.request(socket).payload.requestId;
  assert.notEqual(second, first);
  await f.receive(socket, { type: 'applications', requestId: second, applications: [{ id: 'wrong-context', name: 'Wrong context' }] }, 'key-b');
  await f.receive(socket, { type: 'applications', requestId: first, applications: [{ id: 'old-list', name: 'Old list' }] });
  assert.equal(f.ids.get('calendar-application').options.some(option => ['wrong-context', 'old-list'].includes(option.value)), false);
  await f.receive(socket, { type: 'applications', requestId: second, applications: [{ id: 'exampleapp', name: 'ExampleApp' }], settings: { applicationId: 'apple-calendar', displayName: 'Apple Calendar' } });
  assert.ok(f.ids.get('calendar-application').options.some(option => option.value === 'exampleapp'));
});

test('catalog failure allows an explicit retry, while disconnected Save never claims a persisted selection', async () => {
  const f = fixture(); const socket = await f.connect(); const first = f.request(socket).payload.requestId;
  await f.receive(socket, { type: 'error', requestId: first, message: 'Installed applications are unavailable.' });
  assert.match(f.ids.get('status').textContent, /unavailable/i); assert.equal(f.ids.get('save-application').disabled, true);
  await f.ids.get('refresh-applications').click(); const second = f.request(socket).payload.requestId; assert.notEqual(second, first);
  await f.receive(socket, { type: 'applications', requestId: second, applications: [{ id: 'exampleapp', name: 'ExampleApp' }], settings: { applicationId: 'exampleapp', displayName: 'ExampleApp' } });
  socket.close(); await f.ids.get('save-application').click();
  assert.equal(socket.sent.some(message => message.event === 'setSettings'), false);
  assert.match(f.ids.get('status').textContent, /connect|reopen|closed/i);
});

test('an unsolicited launch failure is visible without wiping the loaded application choices', async () => {
  const f = fixture(); const socket = await f.connect({ settings: { applicationId: 'exampleapp', displayName: 'ExampleApp' } });
  await f.receive(socket, { type: 'applications', requestId: f.request(socket).payload.requestId, applications: [{ id: 'exampleapp', name: 'ExampleApp' }], settings: { applicationId: 'exampleapp', displayName: 'ExampleApp' } });
  const choices = f.ids.get('calendar-application').options.map(option => option.value);
  await f.receive(socket, { type: 'error', message: 'Could not open this application. Refresh the list and choose another application.' });
  assert.equal(f.ids.get('status').dataset.error, 'true');
  assert.match(f.ids.get('status').textContent, /could not open|choose another/i);
  assert.deepEqual(f.ids.get('calendar-application').options.map(option => option.value), choices);
  assert.equal(f.ids.get('calendar-application').value, 'exampleapp');
});

test('a settings update during a pending catalog requests a fresh correlated list and completes with the updated selection', async () => {
  const f = fixture(); const socket = await f.connect(); const first = f.request(socket).payload.requestId;
  await socket.emit('message', { data: JSON.stringify({ event: 'didReceiveSettings', action, context: 'key-a', payload: { settings: { applicationId: 'exampleapp', displayName: 'ExampleApp' } } }) });
  const second = f.request(socket).payload.requestId; assert.notEqual(second, first);
  await f.receive(socket, { type: 'applications', requestId: first, applications: [{ id: 'old', name: 'Old list' }], settings: { applicationId: 'apple-calendar', displayName: 'Apple Calendar' } });
  await f.receive(socket, { type: 'applications', requestId: second, applications: [{ id: 'exampleapp', name: 'ExampleApp' }], settings: { applicationId: 'exampleapp', displayName: 'ExampleApp' } });
  assert.equal(f.ids.get('calendar-application').value, 'exampleapp'); assert.equal(f.ids.get('save-application').disabled, false);
  assert.doesNotMatch(f.ids.get('status').textContent, /loading/i);
});

test('Save reports pending until AJAZZ confirms matching settings instead of treating socket send as persistence', async () => {
  const f = fixture(); const socket = await f.connect();
  await f.receive(socket, { type: 'applications', requestId: f.request(socket).payload.requestId, applications: [{ id: 'exampleapp', name: 'ExampleApp' }], settings: { applicationId: 'apple-calendar', displayName: 'Apple Calendar' } });
  f.ids.get('calendar-application').value = 'exampleapp'; await f.ids.get('calendar-application').emit('change'); await f.ids.get('save-application').click();
  assert.match(f.ids.get('status').textContent, /saving|waiting|pending/i);
  assert.doesNotMatch(f.ids.get('status').textContent, /\bsaved\b/i);
  await socket.emit('message', { data: JSON.stringify({ event: 'didReceiveSettings', action, context: 'key-a', payload: { settings: { applicationId: 'exampleapp', displayName: 'ExampleApp' } } }) });
  assert.match(f.ids.get('status').textContent, /\bsaved\b/i);
  assert.equal(socket.sent.filter(message => message.event === 'setSettings').length, 1);
});

test('a missing settings readback times out visibly without claiming Saved or automatically repeating the write', async () => {
  const f = fixture(); const socket = await f.connect();
  await f.receive(socket, { type: 'applications', requestId: f.request(socket).payload.requestId, applications: [{ id: 'exampleapp', name: 'ExampleApp' }], settings: { applicationId: 'apple-calendar', displayName: 'Apple Calendar' } });
  f.ids.get('calendar-application').value = 'exampleapp'; await f.ids.get('calendar-application').emit('change'); await f.ids.get('save-application').click();
  const deadline = [...f.timers.values()].find(timer => timer.delay === 5000); assert.ok(deadline, 'saving is bounded even if AJAZZ never returns settings');
  await f.ids.get('save-application').click(); assert.equal(socket.sent.filter(message => message.event === 'setSettings').length, 1);
  deadline.fn();
  assert.match(f.ids.get('status').textContent, /not confirm|timed out|timeout|retry|try again/i);
  assert.doesNotMatch(f.ids.get('status').textContent, /\bsaved\b/i);
  assert.equal(socket.sent.filter(message => message.event === 'setSettings').length, 1);
});

test('invalid native callback ports produce a visible local validation error before any socket is created', () => {
  for (const port of ['0', '65536', '23599evil', '-1', '1@remote.invalid']) {
    const f = fixture();
    assert.doesNotThrow(() => f.context.connectElgatoStreamDeckSocket(port, 'key-a', 'registerPropertyInspector', '{}', JSON.stringify({ action, payload: { settings: {} } })));
    assert.equal(f.sockets.length, 0);
    assert.match(f.ids.get('status').textContent, /invalid|port|connect|reopen/i);
  }
});

test('fresh Host settings replace an untouched callback default but do not overwrite a deliberate unsaved choice on Refresh', async () => {
  const f = fixture(); const socket = await f.connect();
  const payload = requestId => ({ type: 'applications', requestId, applications: [{ id: 'exampleapp', name: 'ExampleApp' }], settings: { applicationId: 'exampleapp', displayName: 'ExampleApp' } });
  await f.receive(socket, payload(f.request(socket).payload.requestId));
  assert.equal(f.ids.get('calendar-application').value, 'exampleapp', 'the current persisted Host settings win when the user has not edited the form');
  f.ids.get('calendar-application').value = 'apple-calendar'; await f.ids.get('calendar-application').emit('change');
  await f.ids.get('refresh-applications').click(); await f.receive(socket, payload(f.request(socket).payload.requestId));
  assert.equal(f.ids.get('calendar-application').value, 'apple-calendar', 'a deliberate unsaved choice survives a catalog refresh');
  assert.equal(socket.sent.some(message => message.event === 'setSettings'), false);
});

test('distinct inspector UUID and action context route catalog and settings readback without changing outbound inspector scope', async () => {
  for (const actionContext of [null, 'key-id']) {
    const f = fixture(); const socket = await f.connect({ uuid: 'pi-id', actionContext });
    const targetContext = actionContext || 'pi-id';
    assert.deepEqual(socket.sent[0], { event: 'registerPropertyInspector', uuid: 'pi-id' });
    const requestId = f.request(socket).payload.requestId; assert.equal(f.request(socket).context, 'pi-id');
    await f.receive(socket, { type: 'applications', requestId, applications: [{ id: 'exampleapp', name: 'ExampleApp' }], settings: { applicationId: 'exampleapp', displayName: 'ExampleApp' } }, targetContext);
    assert.equal(f.ids.get('calendar-application').value, 'exampleapp', 'valid forwarded frames target the action context, which may differ from the inspector UUID');
    await f.receive(socket, { type: 'applications', requestId, applications: [{ id: 'wrong', name: 'Wrong key' }], settings: { applicationId: 'wrong', displayName: 'Wrong key' } }, 'other-key');
    await socket.emit('message', { data: JSON.stringify({ event: 'sendToPropertyInspector', action: 'other.action', context: targetContext, payload: { type: 'applications', requestId, applications: [{ id: 'wrong-action', name: 'Wrong action' }] } }) });
    assert.equal(f.ids.get('calendar-application').value, 'exampleapp');
    await f.ids.get('save-application').click();
    const settingsMessages = socket.sent.filter(message => ['setSettings', 'getSettings'].includes(message.event));
    assert.deepEqual(settingsMessages, [{ event: 'setSettings', context: 'pi-id', payload: { applicationId: 'exampleapp', displayName: 'ExampleApp' } }, { event: 'getSettings', context: 'pi-id' }]);
    const ack = { event: 'didReceiveSettings', action, context: 'other-key', payload: { settings: { applicationId: 'exampleapp', displayName: 'ExampleApp' } } };
    await socket.emit('message', { data: JSON.stringify(ack) });
    await socket.emit('message', { data: JSON.stringify({ ...ack, context: targetContext, action: 'other.action' }) });
    assert.match(f.ids.get('status').textContent, /saving|waiting|pending/i);
    await socket.emit('message', { data: JSON.stringify({ ...ack, context: targetContext }) });
    assert.match(f.ids.get('status').textContent, /\bsaved\b/i);
  }
});


test('a Windows catalog requires an explicit installed application choice and never offers Apple Calendar as an available default', async () => {
  const f = fixture(); const socket = await f.connect();
  await f.receive(socket, { type: 'applications', platform: 'win32', requestId: f.request(socket).payload.requestId,
    applications: [{ id: 'example-app', name: 'Example App' }], settings: { applicationId: 'apple-calendar', displayName: 'Apple Calendar' } });
  const select = f.ids.get('calendar-application');
  assert.equal(select.value, '', 'the macOS default must not silently choose a Windows application');
  assert.ok(select.options.some(option => option.value === '' && /choose an application/i.test(option.textContent)));
  assert.equal(select.options.some(option => option.value === 'apple-calendar'), false);
  assert.equal(f.ids.get('save-application').disabled, true);
  select.value = 'example-app'; await select.emit('change'); await f.ids.get('save-application').click();
  assert.deepEqual(socket.sent.find(message => message.event === 'setSettings').payload, { applicationId: 'example-app', displayName: 'Example App' });
});
