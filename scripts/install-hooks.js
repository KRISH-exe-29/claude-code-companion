// Adds (or with --uninstall removes) the companion hooks in ~/.claude/settings.json.
const fs = require('fs');
const os = require('os');
const path = require('path');

const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'];
const COMMAND = `node "${path.join(__dirname, '..', 'hook', 'send.js').replace(/\\/g, '/')}"`;

const isOurs = (entry, command) => (entry.hooks || []).some((h) => h.command === command);

function mergeHooks(settings, command) {
  const s = JSON.parse(JSON.stringify(settings));
  s.hooks = s.hooks || {};
  for (const e of EVENTS) {
    const list = s.hooks[e] || [];
    if (!list.some((x) => isOurs(x, command))) {
      const entry = { hooks: [{ type: 'command', command, timeout: 5, async: true }] };
      if (e === 'PreToolUse' || e === 'PostToolUse') entry.matcher = '*';
      list.push(entry);
    }
    s.hooks[e] = list;
  }
  return s;
}

function removeHooks(settings, command) {
  const s = JSON.parse(JSON.stringify(settings));
  for (const e of Object.keys(s.hooks || {})) {
    s.hooks[e] = s.hooks[e].filter((x) => !isOurs(x, command));
    if (!s.hooks[e].length) delete s.hooks[e];
  }
  return s;
}

if (require.main === module) {
  const file = path.join(os.homedir(), '.claude', 'settings.json');
  const before = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(`${file}.companion-bak`, JSON.stringify(before, null, 2));
  const after = process.argv.includes('--uninstall') ? removeHooks(before, COMMAND) : mergeHooks(before, COMMAND);
  fs.writeFileSync(file, JSON.stringify(after, null, 2));
  console.log(`${process.argv.includes('--uninstall') ? 'Removed' : 'Installed'} companion hooks: ${COMMAND}`);
}

module.exports = { EVENTS, COMMAND, mergeHooks, removeHooks };
