const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine, isSwitch, isClaudeTerminal } = require('../src/switch');

const w = (hwnd, proc, title) => ({ hwnd, proc, title });

test('parseLine splits hwnd, process, window rect and title', () => {
  assert.deepEqual(parseLine('1234\tchrome\t-8,-8,1608,908\tInbox - Gmail\tmore'),
    { ...w('1234', 'chrome', 'Inbox - Gmail\tmore'), rect: { x: -8, y: -8, width: 1616, height: 916 } });
  assert.equal(parseLine(''), null);
  assert.equal(parseLine('garbage'), null);
});

test('first sample is not a switch', () => {
  assert.equal(isSwitch(null, w('1', 'Code', 'a.js')), false);
});

test('different window is a switch', () => {
  assert.equal(isSwitch(w('1', 'Code', 'a.js'), w('2', 'chrome', 'Gmail')), true);
});

test('browser tab change (same window, new title) is a switch', () => {
  for (const p of ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'Arc']) {
    assert.equal(isSwitch(w('5', p, 'Gmail'), w('5', p, 'GitHub')), true, p);
  }
});

test('title change in a non-browser window is not a switch', () => {
  // terminals and editors rewrite their titles while you work (e.g. Claude's spinner)
  assert.equal(isSwitch(w('7', 'WindowsTerminal', '✳ Claude'), w('7', 'WindowsTerminal', '⠂ Claude')), false);
  assert.equal(isSwitch(w('8', 'Code', 'a.js'), w('8', 'Code', '● a.js')), false);
});

test('same window and title is not a switch', () => {
  assert.equal(isSwitch(w('5', 'chrome', 'Gmail'), w('5', 'chrome', 'Gmail')), false);
});

test('isClaudeTerminal: a terminal whose active tab is a Claude Code session', () => {
  const t = (proc, title) => ({ hwnd: '1', proc, title, rect: { x: 0, y: 0, width: 800, height: 600 } });
  assert.equal(isClaudeTerminal(t('WindowsTerminal', '✳ Repo selection')), true);
  assert.equal(isClaudeTerminal(t('WindowsTerminal', '⠂ Building the menu')), true); // spinner while working
  assert.equal(isClaudeTerminal(t('WindowsTerminal', '◐ Repo selection')), true);
  assert.equal(isClaudeTerminal(t('cmd', 'Claude Code')), true);
  assert.equal(isClaudeTerminal(t('WindowsTerminal', 'PowerShell')), false); // another tab in front
  assert.equal(isClaudeTerminal(t('chrome', '✳ Claude')), false); // not a terminal
  assert.equal(isClaudeTerminal({ ...t('WindowsTerminal', '✳ x'), rect: null }), false); // no bounds
  assert.equal(isClaudeTerminal(null), false);
});
