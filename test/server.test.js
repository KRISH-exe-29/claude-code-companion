const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../src/state');
const { startServer } = require('../src/server');

async function withServer(fn, opts = {}) {
  const calls = [];
  const server = await startServer({ store: createStore(), onDisplay: (d) => calls.push(d), port: 0, ...opts });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base, calls, server);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const post = (base, body) => fetch(`${base}/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

test('post event updates state', () =>
  withServer(async (base, calls) => {
    const r = await post(base, JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's', team: 'drift' }));
    assert.equal(r.status, 204);
    const s = await (await fetch(`${base}/state`)).json();
    assert.equal(s.team, 'drift');
    assert.equal(s.mood, 'thinking');
    assert.equal(calls.length, 1);
  }));

test('unchanged display does not call onDisplay', () =>
  withServer(async (base, calls) => {
    await post(base, JSON.stringify({ hook_event_name: 'Notification', notification_type: 'idle_prompt' }));
    assert.equal(calls.length, 0);
  }));

test('bad json', () =>
  withServer(async (base) => {
    assert.equal((await post(base, '{not json')).status, 400);
    assert.equal((await fetch(`${base}/state`)).status, 200);
  }));

test('oversized body', () =>
  withServer(async (base) => {
    const r = await post(base, JSON.stringify({ x: 'a'.repeat(70 * 1024) }));
    assert.equal(r.status, 413);
    assert.equal((await fetch(`${base}/state`)).status, 200);
  }));

test('unknown route', () =>
  withServer(async (base) => {
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  }));

test('rejects on busy port', () =>
  withServer(async (base, calls, server) => {
    const port = server.address().port;
    await assert.rejects(startServer({ store: createStore(), onDisplay() {}, port }), (e) => e.code === 'EADDRINUSE');
  }));

test('rejects browser requests (Origin header)', () =>
  withServer(async (base, calls) => {
    const r = await fetch(`${base}/event`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{"hook_event_name":"Stop"}' });
    assert.equal(r.status, 403);
    assert.equal(calls.length, 0);
  }));

test('rejects non-JSON content type', () =>
  withServer(async (base, calls) => {
    const r = await fetch(`${base}/event`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"hook_event_name":"Stop"}' });
    assert.equal(r.status, 415);
    assert.equal(calls.length, 0);
  }));
