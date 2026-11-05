'use strict';
const path = require('node:path');
const os = require('node:os');
const MAX_BYTES = 1024 * 1024;
const MESSAGES = {
  unavailable: 'Installed applications are unavailable. Refresh the list and try again.',
  missing_app: 'This application is unavailable. Refresh the list and choose another application.',
  invalid_response: 'The application helper returned an invalid response.',
  timeout: 'The application helper timed out. Try again.',
  open_failed: 'This application could not be opened. Choose another application or try again.',
  invalid_request: 'Choose an application from the installed application list.',
  closed: 'The application helper is closed.'
};
function failure(code) {
  const known = typeof code === 'string' && Object.hasOwn(MESSAGES, code);
  const error = new Error(known ? MESSAGES[code] : MESSAGES.unavailable);
  error.code = known ? code : 'unavailable';
  return error;
}
function validId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
function text(value, maximum) { return typeof value === 'string' && Boolean(value.trim()) && value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value); }
function trustedPath(value) {
  if (!text(value, 4096) || !path.isAbsolute(value) || path.normalize(value) !== value || path.extname(value).toLowerCase() !== '.app') return false;
  return ['/Applications', '/System/Applications', path.join(os.homedir(), 'Applications')].some(root => value.startsWith(root + path.sep));
}
function catalog(value) {
  if (value?.type !== 'applications' || !Array.isArray(value.applications) || value.applications.length > 1024) throw failure('invalid_response');
  const result = [], ids = new Set();
  for (const application of value.applications) {
    if (!application || !validId(application.id) || ids.has(application.id) || !text(application.name, 1024) || !text(application.bundleId, 256) || !trustedPath(application.path)) throw failure('invalid_response');
    ids.add(application.id);
    result.push({ id: application.id, name: application.name, bundleId: application.bundleId, path: application.path });
  }
  return result;
}
class AppLauncher {
  constructor({ helperPath, execFileImpl = require('node:child_process').execFile, timeoutMs = 5000, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
    Object.assign(this, { helperPath, execFileImpl, setTimeoutImpl, clearTimeoutImpl });
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
    this.listPromise = null; this.pending = new Set(); this.disposed = false;
  }
  execute(args) {
    if (this.disposed) return Promise.reject(failure('closed'));
    return new Promise((resolve, reject) => {
      const operation = { child: null, done: false, timer: null, finish: null };
      operation.finish = (error, value, kill = false) => {
        if (operation.done) return;
        operation.done = true; this.clearTimeoutImpl(operation.timer); this.pending.delete(operation);
        if (kill) { try { operation.child?.kill(); } catch { /* The helper is already unavailable. */ } }
        if (error) reject(error); else resolve(value);
      };
      this.pending.add(operation);
      operation.timer = this.setTimeoutImpl(() => operation.finish(failure('timeout'), undefined, true), this.timeoutMs);
      try {
        operation.child = this.execFileImpl(this.helperPath, args, { encoding: 'utf8', shell: false, timeout: this.timeoutMs, maxBuffer: MAX_BYTES }, (error, stdout) => {
          if (operation.done) return;
          if (error) { operation.finish(failure(error.killed || error.code === 'ETIMEDOUT' ? 'timeout' : 'unavailable')); return; }
          if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > MAX_BYTES) { operation.finish(failure('invalid_response')); return; }
          let value;
          try { value = JSON.parse(stdout); } catch { operation.finish(failure('invalid_response')); return; }
          if (value?.type === 'error') { operation.finish(failure(value.code)); return; }
          operation.finish(null, value);
        });
      } catch { operation.finish(failure('unavailable'), undefined, true); }
    });
  }
  async freshCatalog() { return catalog(await this.execute(['--list'])); }
  async list() {
    if (this.disposed) throw failure('closed');
    if (!this.listPromise) {
      const promise = this.freshCatalog();
      this.listPromise = promise;
      promise.finally(() => { if (this.listPromise === promise) this.listPromise = null; }).catch(() => {});
    }
    return structuredClone(await this.listPromise);
  }
  async open(applicationId) {
    if (!validId(applicationId)) throw failure('invalid_request');
    if (this.disposed) throw failure('closed');
    const applications = await this.freshCatalog();
    const application = applicationId === 'apple-calendar' ? applications.find(item => item.bundleId === 'com.apple.iCal') : applications.find(item => item.id === applicationId);
    if (!application) throw failure('missing_app');
    const result = await this.execute(['--open', application.path, '--bundle-id', application.bundleId]);
    if (result?.type !== 'opened' || result.applicationId !== application.id) throw failure('invalid_response');
    return { opened: true, applicationId: application.id };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const operation of [...this.pending]) operation.finish(failure('closed'), undefined, true);
    this.listPromise = null;
  }
}
module.exports = { AppLauncher };
