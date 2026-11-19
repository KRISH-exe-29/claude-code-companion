const test = require('node:test');
const assert = require('node:assert/strict');
const { TEAMS, normalizeTeam, describe, toMood, createStore } = require('../src/state');

const pre = (tool_name, tool_input = {}) => ({ hook_event_name: 'PreToolUse', tool_name, tool_input });

test('TEAMS', () => {
  assert.deepEqual(TEAMS, ['sentry', 'surfer', 'ultron', 'default']);
});

test('normalizeTeam', () => {
  assert.equal(normalizeTeam('surfer'), 'surfer');
  assert.equal(normalizeTeam('SURFER'), 'surfer');
  assert.equal(normalizeTeam(undefined), 'default');
  assert.equal(normalizeTeam('foo'), 'default');
});

test('describe never leaks', () => {
  for (const t of ['Edit', 'Write', 'MultiEdit']) {
    assert.equal(describe(pre(t, { file_path: 'C:\\x\\app.tsx' })), 'editing app.tsx');
  }
  assert.equal(describe(pre('Write', { file_path: '/home/u/src/main.js' })), 'editing main.js');
  for (const t of ['Read', 'Grep', 'Glob']) assert.equal(describe(pre(t, { file_path: 'C:\\secret.env' })), 'reading code');
  assert.equal(describe(pre('Bash', { command: 'curl -H "Authorization: secret123"' })), 'running a command');
  assert.equal(describe(pre('PowerShell', { command: '$env:TOKEN="abc"' })), 'running a command');
  assert.equal(describe(pre('mcp__github__create_pr', { body: 'secret' })), 'using github');
  assert.equal(describe(pre('WebSearch', { query: 'x' })), 'WebSearch');
});

test('toMood maps events', () => {
  const t = { team: 'surfer' };
  assert.deepEqual(toMood({ ...t, hook_event_name: 'SessionStart' }), { mood: 'idle', line: 'surfer online' });
  assert.deepEqual(toMood({ ...t, hook_event_name: 'UserPromptSubmit' }), { mood: 'thinking', line: 'thinking…' });
  assert.deepEqual(toMood({ ...t, ...pre('Bash', { command: 'ls' }) }), { mood: 'working', line: 'running a command' });
  assert.deepEqual(toMood({ ...t, ...pre('AskUserQuestion') }), { mood: 'needs-you', line: 'needs you' });
  assert.deepEqual(toMood({ ...t, hook_event_name: 'Notification', notification_type: 'permission_prompt' }), { mood: 'needs-you', line: 'needs you' });
  assert.deepEqual(toMood({ ...t, hook_event_name: 'Stop' }), { mood: 'done', line: 'done' });
  assert.deepEqual(toMood({ ...t, hook_event_name: 'SessionEnd' }), { mood: 'idle', line: 'surfer offline' });
  assert.deepEqual(toMood({ hook_event_name: 'SessionStart' }), { mood: 'idle', line: 'claude online' });
  assert.equal(toMood({ hook_event_name: 'SomethingNew' }), null);
});

test('only real prompts are needs-you', () => {
  for (const t of ['permission_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input']) {
    assert.deepEqual(toMood({ hook_event_name: 'Notification', notification_type: t }), { mood: 'needs-you', line: 'needs you' }, t);
  }
  for (const t of ['auth_success', 'agent_completed', 'quota_auto_resume_fired', 'plugin_notification', 'elicitation_complete']) {
    assert.equal(toMood({ hook_event_name: 'Notification', notification_type: t }), null, t);
  }
});

test('ignores idle prompt', () => {
  assert.equal(toMood({ hook_event_name: 'Notification', notification_type: 'idle_prompt' }), null);
  assert.equal(toMood({ hook_event_name: 'Notification', message: 'Claude is waiting for your input' }), null);
});

test('store initial display', () => {
  assert.deepEqual(createStore().display(), { team: 'default', mood: 'idle', line: '', dim: true, alert: false });
});

test('alert only for needs-you', () => {
  const s = createStore();
  assert.equal(s.apply({ session_id: 'A', team: 'sentry', hook_event_name: 'UserPromptSubmit' }, 1).alert, false);
  const d = s.apply({ session_id: 'A', team: 'sentry', hook_event_name: 'Notification', notification_type: 'permission_prompt' }, 2);
  assert.deepEqual(d, { team: 'sentry', mood: 'needs-you', line: 'needs you', dim: false, alert: true });
});

test('needs-you clears', () => {
  const s = createStore();
  s.apply({ session_id: 'A', team: 'surfer', ...pre('AskUserQuestion') }, 1);
  const d = s.apply({ session_id: 'A', team: 'surfer', ...pre('Bash') }, 2);
  assert.equal(d.mood, 'working');
  assert.equal(d.alert, false);
});

test('needs-you wins over a busier session', () => {
  const s = createStore();
  s.apply({ session_id: 'A', team: 'surfer', hook_event_name: 'Notification', notification_type: 'permission_prompt' }, 1);
  const d = s.apply({ session_id: 'B', team: 'sentry', ...pre('Bash') }, 2);
  assert.equal(d.team, 'surfer');
  assert.equal(d.mood, 'needs-you');
});

test('most recent session wins otherwise', () => {
  const s = createStore();
  s.apply({ session_id: 'A', team: 'surfer', hook_event_name: 'UserPromptSubmit' }, 1);
  const d = s.apply({ session_id: 'B', team: 'ultron', hook_event_name: 'Stop' }, 2);
  assert.equal(d.team, 'ultron');
  assert.equal(d.mood, 'done');
});

test('done persists until the next event', () => {
  const s = createStore();
  s.apply({ session_id: 'A', team: 'surfer', hook_event_name: 'Stop' }, 1);
  assert.equal(s.display().mood, 'done');
});

test('last session end dims with that team', () => {
  const s = createStore();
  s.apply({ session_id: 'A', team: 'ultron', hook_event_name: 'SessionStart' }, 1);
  const d = s.apply({ session_id: 'A', team: 'ultron', hook_event_name: 'SessionEnd' }, 2);
  assert.deepEqual(d, { team: 'ultron', mood: 'idle', line: 'ultron offline', dim: true, alert: false });
});

test('session end falls back to remaining session', () => {
  const s = createStore();
  s.apply({ session_id: 'A', team: 'surfer', hook_event_name: 'UserPromptSubmit' }, 1);
  s.apply({ session_id: 'B', team: 'sentry', hook_event_name: 'SessionStart' }, 2);
  const d = s.apply({ session_id: 'B', team: 'sentry', hook_event_name: 'SessionEnd' }, 3);
  assert.equal(d.team, 'surfer');
  assert.equal(d.mood, 'thinking');
});

test('ignored events leave display unchanged', () => {
  const s = createStore();
  const before = s.apply({ session_id: 'A', team: 'surfer', hook_event_name: 'Stop' }, 1);
  const after = s.apply({ session_id: 'A', team: 'surfer', hook_event_name: 'Notification', notification_type: 'idle_prompt' }, 2);
  assert.deepEqual(after, before);
});

test('stale sessions are pruned so a dead needs-you cannot pin the window', () => {
  const s = createStore();
  s.apply({ session_id: 'A', team: 'surfer', hook_event_name: 'Notification', notification_type: 'permission_prompt' }, 0);
  const d = s.apply({ session_id: 'B', team: 'sentry', ...pre('Bash') }, 11 * 60 * 1000);
  assert.equal(d.team, 'sentry');
  assert.equal(d.alert, false);
});

test('PostToolUse clears needs-you after a permission is approved', () => {
  const s = createStore();
  s.apply({ session_id: 'A', team: 'surfer', hook_event_name: 'Notification', notification_type: 'permission_prompt' }, 1);
  const d = s.apply({ session_id: 'A', team: 'surfer', hook_event_name: 'PostToolUse', tool_name: 'Bash' }, 2);
  assert.deepEqual([d.mood, d.line, d.alert], ['working', 'running a command', false]);
});
