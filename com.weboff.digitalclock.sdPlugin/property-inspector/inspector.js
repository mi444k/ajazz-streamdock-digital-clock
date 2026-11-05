(function () {
  'use strict';
  const select = document.getElementById('calendar-application');
  const save = document.getElementById('save-application');
  const refresh = document.getElementById('refresh-applications');
  const status = document.getElementById('status');
  let sequence = 0, connection = null;
  function validId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
  function object(value) { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } }
  function safeSettings(value = {}) {
    return { applicationId: value.applicationId === undefined ? 'apple-calendar' : validId(value.applicationId) ? value.applicationId : '',
      displayName: typeof value.displayName === 'string' ? value.displayName.slice(0, 1024) : 'Apple Calendar' };
  }
  function message(text, failed = false) { status.textContent = text; status.dataset.error = String(failed); }
  function send(value) {
    const state = connection;
    if (!state || state.socket.readyState !== WebSocket.OPEN) { save.disabled = true; message('AJAZZ connection closed. Reopen this action.', true); return false; }
    try { state.socket.send(JSON.stringify(value)); return true; }
    catch { save.disabled = true; message('Cannot connect to AJAZZ. Reopen this action.', true); return false; }
  }
  function option(id, name) {
    const element = document.createElement('option'); element.value = id; element.textContent = name; return element;
  }
  function stopSaving(state) {
    if (state.ackTimer !== null) window.clearTimeout(state.ackTimer);
    state.ackTimer = null; state.pendingSave = null; state.saving = false;
    select.disabled = false; refresh.disabled = false;
  }
  function choices(state, selected) {
    select.replaceChildren(option('apple-calendar', 'Apple Calendar (default)'));
    for (const application of state.applications) if (application.id !== 'apple-calendar') select.appendChild(option(application.id, application.name));
    const available = selected === 'apple-calendar' || state.applications.some(application => application.id === selected);
    if (!available) select.appendChild(option(selected, (state.saved.displayName || 'Saved application') + ' — unavailable'));
    select.value = selected;
    save.disabled = !available || !selected || state.pending || state.saving;
    return available;
  }
  function requestApplications() {
    const state = connection;
    if (!state || state.saving) return;
    state.pending = true;
    state.latest = 'applications-' + ++sequence;
    state.choice = state.dirty ? select.value : null;
    save.disabled = true; message('Loading installed applications…');
    if (!send({ event: 'sendToPlugin', action: state.action, context: state.uuid, payload: { command: 'applications', requestId: state.latest } })) state.pending = false;
  }
  function receive(state, event) {
    if (connection !== state) return;
    let value;
    try { value = JSON.parse(event.data); } catch { return; }
    if (value.context !== state.actionContext || value.action !== state.action) return;
    if (value.event === 'didReceiveSettings') {
      const confirmed = safeSettings(value.payload?.settings);
      const saving = state.pendingSave;
      if (saving) stopSaving(state);
      state.saved = confirmed;
      state.dirty = false;
      choices(state, state.saved.applicationId);
      if (state.pending) { state.latest = null; requestApplications(); }
      else if (saving && saving.applicationId === confirmed.applicationId && saving.displayName === confirmed.displayName) message('Application saved for this key.');
      else if (saving) message('This setting differs from your choice. Choose an application and try again.', true);
      return;
    }
    if (value.event !== 'sendToPropertyInspector' || !value.payload) return;
    const payload = value.payload;
    if (payload.type === 'error' && payload.requestId === undefined) { message('Could not open this application. Refresh the list and choose another application.', true); return; }
    if (payload.requestId !== state.latest) return;
    if (payload.type === 'error') {
      state.pending = false; save.disabled = true;
      message('Installed applications are unavailable. Refresh the list and try again.', true);
      return;
    }
    if (payload.type !== 'applications' || !Array.isArray(payload.applications)) return;
    state.pending = false;
    state.applications = payload.applications.filter(application => application && validId(application.id) && typeof application.name === 'string' && application.name.length <= 1024).map(application => ({ id: application.id, name: application.name }));
    if (payload.settings) state.saved = safeSettings(payload.settings);
    const selected = state.choice !== null ? state.choice : state.saved.applicationId;
    const available = choices(state, selected);
    message(available ? 'Press this clock key to open the selected application.' : 'Your saved application is unavailable. Choose an installed replacement.', !available);
  }
  function connectElgatoStreamDeckSocket(port, uuid, registerEvent, rawInfo, rawActionInfo) {
    const info = object(rawActionInfo);
    const previous = connection;
    if (!/^\d+$/.test(String(port)) || Number(port) < 1 || Number(port) > 65535) {
      connection = null;
      if (previous) { stopSaving(previous); try { previous.socket.close(); } catch {} }
      save.disabled = true; message('Invalid AJAZZ connection port. Reopen this action.', true); return;
    }
    const state = { uuid, actionContext: info.context === undefined ? uuid : typeof info.context === 'string' && info.context.trim() ? info.context : null, action: info.action || 'com.weboff.digitalclock.clock', saved: safeSettings(info.payload?.settings || info.settings), applications: [], pending: false, latest: null, choice: null, dirty: false, socket: null, saving: false, pendingSave: null, ackTimer: null };
    connection = state;
    if (previous) { stopSaving(previous); try { previous.socket.close(); } catch { /* A replaced connection cannot update this inspector. */ } }
    state.socket = new WebSocket('ws://127.0.0.1:' + port);
    choices(state, state.saved.applicationId); save.disabled = true;
    state.socket.onopen = () => {
      if (connection !== state) return;
      if (send({ event: registerEvent, uuid })) requestApplications();
    };
    state.socket.onmessage = event => receive(state, event);
    state.socket.onclose = () => { if (connection === state) { stopSaving(state); save.disabled = true; message('AJAZZ connection closed. Reopen this action.', true); } };
    state.socket.onerror = () => { if (connection === state) { save.disabled = true; message('Cannot connect to AJAZZ. Reopen this action.', true); } };
  }
  refresh.addEventListener('click', requestApplications);
  select.addEventListener('change', () => {
    const state = connection;
    if (!state) return;
    state.dirty = true;
    if (state.pending) state.choice = select.value;
    const available = select.value === 'apple-calendar' || state.applications.some(application => application.id === select.value);
    save.disabled = state.pending || state.saving || !available || state.socket.readyState !== WebSocket.OPEN;
    message(available ? 'Save this application for this clock key.' : 'Choose an installed application.', !available);
  });
  save.addEventListener('click', () => {
    const state = connection;
    if (!state || state.pending || state.saving) return;
    const selected = state.applications.find(application => application.id === select.value);
    if (select.value !== 'apple-calendar' && !selected) { message('Choose an installed application.', true); return; }
    const payload = { applicationId: select.value, displayName: select.value === 'apple-calendar' ? 'Apple Calendar' : selected.name };
    if (send({ event: 'setSettings', context: state.uuid, payload })) {
      state.saving = true; state.pendingSave = payload;
      save.disabled = true; select.disabled = true; refresh.disabled = true;
      message('Saving application…');
      state.ackTimer = window.setTimeout(() => {
        if (connection !== state || state.pendingSave !== payload) return;
        stopSaving(state); choices(state, select.value);
        message('Could not confirm this setting. Try again.', true);
      }, 5000);
      if (!send({ event: 'getSettings', context: state.uuid })) { stopSaving(state); save.disabled = true; }
    }
  });
  window.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;
  window.connectSocket = connectElgatoStreamDeckSocket;
})();
