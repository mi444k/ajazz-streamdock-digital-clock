'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AppLauncher } = require('../src/app-launcher.cjs');
const app = { id: 'example-app-id', name: 'Example Application', appUserModelId: 'Example.Package_abc!App' };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const calls = [];
  const launcher = new AppLauncher({ platform: 'win32', helperPath: '/synthetic/helper.exe', execFileImpl(file, args, options, callback) {
    const child = { kill() {} }; calls.push({ file, args, options, callback }); return child;
  } });
  function reply(index, applications) { calls[index].callback(null, JSON.stringify({ type: 'applications', applications })); }
  return { launcher, calls, reply };
}

test('Windows installed applications use bounded AppsFolder identities without accepting macOS paths as authority', async () => {
  const f = fixture();
  try {
    const pending = f.launcher.list(); f.reply(0, [app]);
    assert.deepEqual(await pending, [app]);
    assert.equal(f.calls[0].file, '/synthetic/helper.exe');
    assert.deepEqual(f.calls[0].args, ['--list']); assert.equal(f.calls[0].options.shell, false);
    assert.equal(f.calls[0].options.windowsHide, true, 'the helper must not open a console window');
  } finally { f.launcher.dispose(); }
});

test('Windows open revalidates its own fresh catalog and launches only the opaque ID, with a matching acknowledgement', async () => {
  const f = fixture();
  try {
    const oldList = f.launcher.list(); oldList.catch(() => {});
    const opened = f.launcher.open(app.id); opened.catch(() => {}); await flush();
    assert.equal(f.calls.length, 2, 'opening cannot reuse a pending inspector catalog');
    f.reply(1, [app]); await flush();
    assert.equal(f.calls.length, 3);
    assert.deepEqual(f.calls[2].args, ['--open', app.id], 'neither a command nor an AUMID supplied by the inspector becomes an executable argument');
    assert.equal(f.calls[2].options.shell, false);
    f.calls[2].callback(null, JSON.stringify({ type: 'opened', applicationId: app.id }));
    assert.deepEqual(await opened, { opened: true, applicationId: app.id });
    f.reply(0, []); assert.deepEqual(await oldList, []);
  } finally { f.launcher.dispose(); }
});

test('Windows catalog provenance, identity uniqueness and bounds fail closed', async () => {
  const invalid = [
    [{ ...app, appUserModelId: '' }], [{ ...app, appUserModelId: 'bad\nidentity' }],
    [{ ...app, appUserModelId: 'x'.repeat(1025) }], [{ ...app, id: '../command' }],
    [app, { ...app, name: 'Duplicate ID' }], [app, { ...app, id: 'another-id' }],
    [{ ...app, name: 'bad\u0000name' }], [{ ...app, name: 'x'.repeat(1025) }],
    [{ id: app.id, name: app.name, path: 'C:\\arbitrary.exe', bundleId: 'com.example.app' }],
    [{ ...app, path: 'C:\\arbitrary.exe' }],
    Array.from({ length: 1025 }, (_, i) => ({ ...app, id: 'id-' + i, appUserModelId: 'Package!App' + i }))
  ];
  for (const applications of invalid) {
    const f = fixture();
    try {
      const pending = f.launcher.list(); const rejected = assert.rejects(pending, error => error.code === 'invalid_response');
      f.reply(0, applications); await rejected;
      assert.equal(f.calls.length, 1, 'an invalid catalog never launches an application');
    } finally { f.launcher.dispose(); }
  }
});

test('Windows does not silently remap a saved Apple Calendar default and rejects mismatched launch acknowledgements', async () => {
  for (const id of ['apple-calendar', app.id]) {
    const f = fixture();
    try {
      const pending = f.launcher.open(id);
      const rejected = assert.rejects(pending, error => error.code === (id === 'apple-calendar' ? 'missing_app' : 'invalid_response')); rejected.catch(() => {});
      f.reply(0, [app]); await flush();
      if (id === app.id) f.calls[1].callback(null, JSON.stringify({ type: 'opened', applicationId: 'different-id' }));
      await rejected;
      if (id === 'apple-calendar') assert.equal(f.calls.length, 1);
    } finally { f.launcher.dispose(); }
  }
});
