const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { buildPayload } = require('../hook/send');
const { createStore } = require('../src/state');
const { startServer } = require('../src/server');

const SEND = path.join(__dirname, '..', 'hook', 'send.js');

function run(stdin, env) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [SEND], { env: { ...process.env, ...env } });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve({ code, out, err, ms: Date.now() - t0 }));
    p.stdin.end(stdin);
  });
}

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

test('buildPayload adds team and strips tool input', () => {
  const p = buildPayload(
    { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'a.js', command: 'x', content: 'secret', new_string: 'y' } },
    { CLAUDE_TEAM: 'halo' },
  );
  assert.equal(p.team, 'halo');
  assert.deepEqual(p.tool_input, { file_path: 'a.js' });
  assert.equal(p.tool_name, 'Edit');
});

test('buildPayload drops prompt text and transcript path', () => {
  const p = buildPayload({ hook_event_name: 'UserPromptSubmit', prompt: 'my secret', transcript_path: 'C:\\t.jsonl' }, {});
  assert.equal(p.prompt, undefined);
  assert.equal(p.transcript_path, undefined);
});

test('exits fast when server is down', async () => {
  const port = await freePort();
  const r = await run('{"hook_event_name":"Stop","session_id":"s"}', { COMPANION_PORT: String(port) });
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
  assert.equal(r.err, '');
  assert.ok(r.ms < 1500, `took ${r.ms} ms`);
});

test('garbage stdin', async () => {
  const r = await run('not json at all', { COMPANION_PORT: String(await freePort()) });
  assert.equal(r.code, 0);
  assert.equal(r.out + r.err, '');
});

test('delivers to server', async () => {
  const server = await startServer({ store: createStore(), onDisplay() {}, port: 0 });
  const port = server.address().port;
  try {
    const r = await run('{"hook_event_name":"UserPromptSubmit","session_id":"s"}', { CLAUDE_TEAM: 'redline', COMPANION_PORT: String(port) });
    assert.equal(r.code, 0);
    const s = await (await fetch(`http://127.0.0.1:${port}/state`)).json();
    assert.equal(s.team, 'redline');
    assert.equal(s.mood, 'thinking');
  } finally {
    await new Promise((r) => server.close(r));
  }
});
