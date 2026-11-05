'use strict';
const { millisecondsToNextMinute } = require('./core.cjs');
const { renderClockImage } = require('./key-image.cjs');
const ACTION = 'com.weboff.digitalclock.clock';
function validId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
function settings(value = {}) {
  const applicationId = value.applicationId === undefined ? 'apple-calendar' : validId(value.applicationId) ? value.applicationId : '';
  const displayName = typeof value.displayName === 'string' && value.displayName.trim() && value.displayName.length <= 1024 && !/[\u0000-\u001f\u007f]/u.test(value.displayName) ? value.displayName : applicationId === 'apple-calendar' ? 'Apple Calendar' : 'Application';
  return { applicationId, displayName };
}
class HostPlugin {
  constructor({ uuid, send, launcher, now = () => new Date(), setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
    Object.assign(this, { uuid, sendMessage: send, launcher, now, setTimeoutImpl, clearTimeoutImpl });
    this.visible = new Map(); this.timer = null; this.timerToken = null; this.launchBusy = false; this.disposed = false;
  }
  send(value) { if (!this.disposed && typeof this.sendMessage === 'function') this.sendMessage(value); }
  pi(context, payload) { this.send({ event: 'sendToPropertyInspector', action: ACTION, context, payload }); }
  stopTimer() {
    if (this.timer !== null) this.clearTimeoutImpl(this.timer);
    this.timer = null; this.timerToken = null;
  }
  schedule() {
    if (this.disposed || !this.visible.size || this.timer !== null) return;
    const token = {}; this.timerToken = token;
    this.timer = this.setTimeoutImpl(() => {
      if (this.disposed || this.timerToken !== token || !this.visible.size) return;
      this.timer = null; this.timerToken = null; this.tick(); this.schedule();
    }, millisecondsToNextMinute(this.now()));
  }
  tick() {
    if (this.disposed || !this.visible.size) return;
    const image = renderClockImage(this.now());
    for (const [context, item] of this.visible) {
      if (item.lastImage === image) continue;
      this.send({ event: 'setTitle', context, payload: { title: '', target: 0 } });
      this.send({ event: 'setImage', context, payload: { image, target: 0 } });
      item.lastImage = image;
    }
  }
  async catalog(context, requestId) {
    if (!validId(requestId)) return;
    const item = this.visible.get(context), version = item?.version;
    if (!item) return;
    const current = () => !this.disposed && this.visible.get(context) === item && item.version === version;
    try {
      const applications = await this.launcher.list();
      if (!current()) return;
      this.pi(context, { type: 'applications', requestId, applications: applications.map(application => ({ id: application.id, name: application.name })), settings: { ...item.settings } });
    } catch {
      if (current()) this.pi(context, { type: 'error', requestId, message: 'Could not load installed applications. Refresh the list and try again.' });
    }
  }
  async open(context) {
    const item = this.visible.get(context);
    if (!item || this.disposed || this.launchBusy) return;
    if (!validId(item.settings.applicationId)) {
      this.send({ event: 'showAlert', context });
      this.pi(context, { type: 'error', message: 'Choose an installed application in this action’s settings.' });
      return;
    }
    this.launchBusy = true;
    const version = item.version;
    try { await this.launcher.open(item.settings.applicationId); }
    catch {
      if (!this.disposed && this.visible.get(context) === item && item.version === version) {
        this.send({ event: 'showAlert', context });
        this.pi(context, { type: 'error', message: 'Could not open this application. Refresh the list and choose another application.' });
      }
    } finally { this.launchBusy = false; }
  }
  async handle(message) {
    if (this.disposed || !message || typeof message !== 'object') return;
    if (message.event === 'connected') { this.send({ event: 'registerPlugin', uuid: this.uuid }); return; }
    if (message.event === 'systemDidWakeUp') { this.stopTimer(); this.tick(); this.schedule(); return; }
    if (message.action !== ACTION || typeof message.context !== 'string') return;
    const context = message.context;
    if (message.event === 'willAppear') {
      this.visible.set(context, { settings: settings(message.payload?.settings), controller: typeof message.payload?.controller === 'string' ? message.payload.controller : 'Keypad', version: 0 });
      this.tick(); this.schedule();
    } else if (message.event === 'willDisappear') {
      this.visible.delete(context); if (!this.visible.size) this.stopTimer();
    } else {
      const item = this.visible.get(context);
      if (!item) return;
      if (message.event === 'didReceiveSettings') { item.settings = settings(message.payload?.settings); item.version++; }
      else if (message.event === 'sendToPlugin' && message.payload?.command === 'applications') await this.catalog(context, message.payload.requestId);
      else if ((message.event === 'keyUp' && item.controller === 'Keypad') || (message.event === 'dialUp' && ['Knob', 'Encoder'].includes(item.controller))) await this.open(context);
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.stopTimer(); this.visible.clear(); this.launcher.dispose();
  }
}
module.exports = { HostPlugin };
