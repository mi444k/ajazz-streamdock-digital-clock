'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { parseLaunchArgs, startPlugin } = require('../src/plugin.js');
const args = ['-port', '23599', '-pluginUUID', 'digital-clock-instance', '-registerEvent', 'registerPlugin', '-info', '{}'];
const flush = () => new Promise(resolve => setImmediate(resolve));

test('strict AJAZZ flags parse independently of order and reject invalid ports or metadata', () => {
  assert.deepEqual(parseLaunchArgs(['-info', '{}', '-registerEvent', 'registerPlugin', '-pluginUUID', 'digital-clock-instance', '-port', '23599']), { port: 23599, uuid: 'digital-clock-instance', registerEvent: 'registerPlugin', info: {} });
  for (const port of ['0', '65536', '1.5', '23599evil', '-1']) { const invalid = [...args]; invalid[1] = port; assert.throws(() => parseLaunchArgs(invalid)); }
  for (const info of ['null', '[]', '{bad']) { const invalid = [...args]; invalid[7] = info; assert.throws(() => parseLaunchArgs(invalid)); }
  assert.throws(() => parseLaunchArgs(['-port', '23599']));
});

function fixture() {
  const sockets = [], launchers = [], timers = new Map(); let sequence = 0;
  class Socket extends EventEmitter {
    static OPEN = 1;
    constructor(url) { super(); this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; this.emit('close'); }
  }
  class Launcher {
    constructor(options) { this.options = options; this.calls = []; this.disposals = 0; launchers.push(this); }
    async list() { this.calls.push('list'); return [{ id: 'exampleapp', name: 'ExampleApp', path: '/Applications/ExampleApp.app', bundleId: 'com.example.calendar' }]; }
    async open() { throw new Error('Read-only entry test forbids opening an application.'); }
    dispose() { this.disposals++; }
  }
  const launch = () => startPlugin({ args, WebSocketImpl: Socket, LauncherImpl: Launcher, helperPath: '/fake/calendar-helper', now: () => new Date(2026, 10, 5, 14, 7), setTimeoutImpl: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, delay }); return id; }, clearTimeoutImpl: id => timers.delete(id) });
  return { sockets, launchers, timers, launch };
}

test('entry wires loopback registration, visible clock rendering and read-only inspector catalog requests', async () => {
  const f = fixture(); const session = f.launch();
  assert.ok(session?.socket && session.plugin && session.launcher, 'entry returns the actual wired plugin session');
  try {
    assert.equal(session.socket.url, 'ws://127.0.0.1:23599'); assert.equal(f.launchers[0].options.helperPath, '/fake/calendar-helper');
    session.socket.readyState = 1; session.socket.emit('open'); await flush();
    assert.deepEqual(session.socket.sent, [{ event: 'registerPlugin', uuid: 'digital-clock-instance' }]);
    session.socket.emit('message', Buffer.from('{bad')); await flush(); assert.deepEqual(f.launchers[0].calls, []);
    session.socket.emit('message', Buffer.from(JSON.stringify({ event: 'willAppear', action: 'com.weboff.digitalclock.clock', context: 'key', payload: { settings: {} } })));
    await flush(); assert.ok(session.socket.sent.some(value => value.event === 'setImage')); assert.equal(f.timers.size, 1);
    assert.deepEqual(f.launchers[0].calls, []);
    session.socket.emit('message', Buffer.from(JSON.stringify({ event: 'sendToPlugin', action: 'com.weboff.digitalclock.clock', context: 'key', payload: { command: 'applications', requestId: 'entry-request' } })));
    await flush();
    const reply = session.socket.sent.find(value => value.event === 'sendToPropertyInspector');
    assert.equal(reply.payload.requestId, 'entry-request'); assert.deepEqual(reply.payload.applications, [{ id: 'exampleapp', name: 'ExampleApp' }]);
  } finally { session.dispose(); }
  assert.equal(f.launchers[0].disposals, 1); assert.equal(f.timers.size, 0);
});

test('entry disposes launch resources and clock timers once after socket close or error', async () => {
  for (const event of ['close', 'error']) {
    const f = fixture(); const session = f.launch(); assert.ok(session?.socket);
    session.socket.readyState = 1; session.socket.emit('open');
    session.socket.emit('message', Buffer.from(JSON.stringify({ event: 'willAppear', action: 'com.weboff.digitalclock.clock', context: 'key', payload: { settings: {} } }))); await flush();
    assert.equal(f.timers.size, 1);
    assert.doesNotThrow(() => session.socket.emit(event, new Error('Fake socket failure'))); session.dispose();
    assert.equal(f.launchers[0].disposals, 1); assert.equal(f.timers.size, 0);
    const count = session.socket.sent.length;
    session.socket.emit('message', Buffer.from(JSON.stringify({ event: 'willAppear', action: 'com.weboff.digitalclock.clock', context: 'late', payload: { settings: {} } }))); await flush();
    assert.equal(session.socket.sent.length, count);
  }
});

test('manifest declares a separate Node20 macOS clock with both controllers and real inspector and icon assets', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
  assert.equal(manifest.Version, '0.1.3'); assert.equal(manifest.Actions.length, 1); assert.equal(manifest.Nodejs.Version, '20');
  assert.ok(manifest.OS.some(value => value.Platform === 'mac' && value.MinimumVersion === '13.0'));
  const action = manifest.Actions[0]; assert.equal(action.UUID, 'com.weboff.digitalclock.clock'); assert.deepEqual([...action.Controllers].sort(), ['Keypad', 'Knob']);
  assert.ok(action.States.length); assert.ok(action.States.every(value => value.ShowTitle === false));
  for (const file of [manifest.CodePath, manifest.Icon, manifest.CategoryIcon, action.Icon, action.PropertyInspectorPath, ...action.States.map(value => value.Image)]) assert.ok(typeof file === 'string' && fs.existsSync(path.join(__dirname, '..', file)), String(file));
});
