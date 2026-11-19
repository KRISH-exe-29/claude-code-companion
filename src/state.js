// Turns Claude Code hook events into one Display for the companion window.
const TEAMS = ['sentry', 'surfer', 'ultron', 'default'];

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const QUESTION_TOOLS = new Set(['AskUserQuestion']);

function normalizeTeam(t) {
  const n = String(t || '').toLowerCase();
  return TEAMS.includes(n) ? n : 'default';
}

function teamLabel(evt) {
  const t = normalizeTeam(evt.team);
  return t === 'default' ? 'claude' : t;
}

// Last-action line. Never includes command text or file contents.
function describe(evt) {
  const tool = String(evt.tool_name || '');
  if (EDIT_TOOLS.has(tool)) {
    const p = String((evt.tool_input && (evt.tool_input.file_path || evt.tool_input.notebook_path)) || '');
    const name = p.split(/[\\/]/).pop();
    return name ? `editing ${name}` : 'editing a file';
  }
  if (READ_TOOLS.has(tool)) return 'reading code';
  if (SHELL_TOOLS.has(tool)) return 'running a command';
  if (tool.startsWith('mcp__')) return `using ${tool.split('__')[1] || 'a tool'}`;
  return tool || 'working';
}

// Notification types that mean Claude is blocked on the user. Everything else (idle reminder,
// auth, quota, plugin notices…) is ignored so the chime stays meaningful.
const NEEDS_YOU_TYPES = new Set(['permission_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input']);

function ignoreNotification(evt) {
  if (evt.notification_type) return !NEEDS_YOU_TYPES.has(evt.notification_type);
  return /waiting for your input/i.test(String(evt.message || ''));
}

function toMood(evt) {
  switch (evt.hook_event_name) {
    case 'SessionStart': return { mood: 'idle', line: `${teamLabel(evt)} online` };
    case 'UserPromptSubmit': return { mood: 'thinking', line: 'thinking…' };
    case 'PreToolUse':
      if (QUESTION_TOOLS.has(evt.tool_name)) return { mood: 'needs-you', line: 'needs you' };
      return { mood: 'working', line: describe(evt) };
    case 'PostToolUse': return { mood: 'working', line: describe(evt) };
    case 'Notification':
      return ignoreNotification(evt) ? null : { mood: 'needs-you', line: 'needs you' };
    case 'Stop': return { mood: 'done', line: 'done' };
    case 'SessionEnd': return { mood: 'idle', line: `${teamLabel(evt)} offline` };
    default: return null;
  }
}

// A session with no events for this long is treated as gone (closed terminal, crash), so its
// needs-you can't pin the window. A live session that comes back is simply re-added.
const STALE_MS = 10 * 60 * 1000;

function createStore() {
  const sessions = new Map(); // session_id -> { team, mood, line, at }
  let ended = { team: 'default', line: '' };
  let current = { team: 'default', mood: 'idle', line: '', dim: true, alert: false };

  function pick() {
    const all = [...sessions.values()];
    if (!all.length) return { team: ended.team, mood: 'idle', line: ended.line, dim: true, alert: false };
    const waiting = all.filter((s) => s.mood === 'needs-you');
    const pool = waiting.length ? waiting : all;
    const s = pool.reduce((a, b) => (b.at >= a.at ? b : a));
    return { team: s.team, mood: s.mood, line: s.line, dim: false, alert: s.mood === 'needs-you' };
  }

  return {
    apply(evt, now) {
      const m = toMood(evt);
      if (!m) return current;
      const id = String(evt.session_id || 'unknown');
      const team = normalizeTeam(evt.team);
      if (evt.hook_event_name === 'SessionEnd') {
        sessions.delete(id);
        ended = { team, line: m.line };
      } else {
        sessions.set(id, { team, mood: m.mood, line: m.line, at: now });
      }
      for (const [k, v] of sessions) if (now - v.at > STALE_MS) sessions.delete(k);
      current = pick();
      return current;
    },
    display() {
      return current;
    },
  };
}

module.exports = { TEAMS, normalizeTeam, describe, toMood, createStore };
