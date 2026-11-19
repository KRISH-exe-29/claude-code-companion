const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeHooks, removeHooks, EVENTS } = require('../scripts/install-hooks');

const CMD = 'node "D:/CLAUDE CODE PROJECTS/companion/hook/send.js"';
const ours = (entry) => entry.hooks.some((h) => h.command === CMD);

test('EVENTS', () => {
  assert.deepEqual(EVENTS, ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd']);
});

test('mergeHooks on empty settings adds every event', () => {
  const s = mergeHooks({}, CMD);
  for (const e of EVENTS) {
    assert.equal(s.hooks[e].length, 1, e);
    assert.deepEqual(s.hooks[e][0].hooks, [{ type: 'command', command: CMD, timeout: 5, async: true }]);
  }
  assert.equal(s.hooks.PreToolUse[0].matcher, '*');
  assert.equal(s.hooks.PostToolUse[0].matcher, '*');
  assert.equal(s.hooks.Stop[0].matcher, undefined);
});

test('mergeHooks keeps existing hooks and other settings', () => {
  const existing = { matcher: 'Bash', hooks: [{ type: 'command', command: 'guard.sh' }] };
  const s = mergeHooks({ model: 'opus', hooks: { PreToolUse: [existing] } }, CMD);
  assert.equal(s.model, 'opus');
  assert.equal(s.hooks.PreToolUse.length, 2);
  assert.deepEqual(s.hooks.PreToolUse[0], existing);
  assert.ok(ours(s.hooks.PreToolUse[1]));
});

test('mergeHooks is idempotent', () => {
  const once = mergeHooks({}, CMD);
  const twice = mergeHooks(JSON.parse(JSON.stringify(once)), CMD);
  assert.deepEqual(twice, once);
});

test('mergeHooks does not mutate its input', () => {
  const input = { hooks: { Stop: [] } };
  mergeHooks(input, CMD);
  assert.deepEqual(input, { hooks: { Stop: [] } });
});

test('removeHooks removes only ours', () => {
  const existing = { matcher: 'Bash', hooks: [{ type: 'command', command: 'guard.sh' }] };
  const s = removeHooks(mergeHooks({ hooks: { PreToolUse: [existing] } }, CMD), CMD);
  assert.deepEqual(s.hooks.PreToolUse, [existing]);
  assert.equal(s.hooks.Stop, undefined);
});
