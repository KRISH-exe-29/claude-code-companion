// Claude Code hook: forwards the event to the companion. Must never slow or break Claude:
// silent, bounded to ~1 s, always exits 0.
const http = require('http');

function buildPayload(input, env) {
  const ti = input.tool_input || {};
  const toolInput = {};
  if (ti.file_path) toolInput.file_path = ti.file_path;
  if (ti.notebook_path) toolInput.notebook_path = ti.notebook_path;
  return {
    hook_event_name: input.hook_event_name,
    session_id: input.session_id,
    tool_name: input.tool_name,
    tool_input: toolInput,
    notification_type: input.notification_type,
    message: input.message,
    team: env.CLAUDE_TEAM,
  };
}

function main() {
  setTimeout(() => process.exit(0), 1200).unref();
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('error', () => process.exit(0));
  process.stdin.on('end', () => {
    let input;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      process.exit(0);
    }
    const body = JSON.stringify(buildPayload(input || {}, process.env));
    const req = http.request(
      {
        host: '127.0.0.1',
        port: Number(process.env.COMPANION_PORT) || 7777,
        path: '/event',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      },
      (res) => {
        res.resume();
        res.on('end', () => process.exit(0));
      },
    );
    req.setTimeout(1000, () => req.destroy());
    req.on('error', () => process.exit(0));
    req.end(body);
  });
}

if (require.main === module) main();

module.exports = { buildPayload };
