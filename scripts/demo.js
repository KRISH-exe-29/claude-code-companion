// Plays a sample session into a running companion: node scripts/demo.js [team]
const team = process.argv[2] || 'drift';
const port = Number(process.env.COMPANION_PORT) || 7777;
const s = { session_id: `demo-${team}`, team };
const steps = [
  { hook_event_name: 'SessionStart' },
  { hook_event_name: 'UserPromptSubmit' },
  { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'C:\\demo\\app.tsx' } },
  { hook_event_name: 'Notification', notification_type: 'permission_prompt' },
  { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {} },
  { hook_event_name: 'Stop' },
];

(async () => {
  for (const step of steps) {
    await fetch(`http://127.0.0.1:${port}/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...s, ...step }) });
    console.log(step.hook_event_name, step.tool_name || '');
    await new Promise((r) => setTimeout(r, 2000));
  }
})();
