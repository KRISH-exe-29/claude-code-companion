// Decides whether the user switched windows (or browser tabs) from foreground-window samples,
// and whether the window in front is a Claude Code terminal (where the chat effects may run).
const BROWSERS = new Set(['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'arc']);
const TERMINALS = new Set(['windowsterminal', 'cmd', 'powershell', 'pwsh', 'conhost', 'openconsole', 'wezterm-gui', 'alacritty']);

// One line from foreground.ps1: "<hwnd>\t<process>\t<left,top,right,bottom>\t<title>"
function parseLine(line) {
  const parts = line.split('\t');
  if (parts.length < 4) return null;
  const [hwnd, proc, r] = parts;
  const n = r.split(',').map(Number);
  const rect = n.length === 4 && n.every(Number.isFinite) ? { x: n[0], y: n[1], width: n[2] - n[0], height: n[3] - n[1] } : null;
  return { hwnd, proc, title: parts.slice(3).join('\t'), rect };
}

function isSwitch(prev, next) {
  if (!prev || !next) return false;
  if (prev.hwnd !== next.hwnd) return true;
  // Same window: only a browser's title change means a tab switch. Terminals and editors
  // rewrite their own titles while you work, which must not count.
  return BROWSERS.has(String(next.proc).toLowerCase()) && prev.title !== next.title;
}

// The foreground window is a terminal and its active tab is a Claude Code session: Claude
// titles the tab "<symbol> <summary>" (✳ when idle, a spinner glyph such as ⠂ or ◐ while working).
function isClaudeTerminal(fg) {
  if (!fg || !fg.rect || !TERMINALS.has(String(fg.proc).toLowerCase())) return false;
  return /^[\p{So}\p{Sm}] /u.test(fg.title) || /claude/i.test(fg.title);
}

module.exports = { parseLine, isSwitch, isClaudeTerminal };
