"""Download finished Flow clips into flow/raw/<team>-<mood>.mp4, matched by the prompt text (img alt) in the Flow chat."""
import json, subprocess, sys, time, base64, os, re
B = os.path.expanduser(r'~/.claude/skills/gstack/browse/dist/browse.exe')
SP = sys.argv[1]
TEAM = {'The golden guardian.': 'halo', 'The robot.': 'redline', 'The hoverboard rider.': 'drift'}
MOOD = {'Calm idle': 'idle', 'Thinking': 'thinking', 'Working hard': 'working', 'Needs attention': 'needs-you', 'Task complete': 'done'}

def b(*a, out=None):
    args = [B, *a] + (['--raw', '--out', out] if out else [])
    return subprocess.run(args, capture_output=True, text=True, timeout=120).stdout

def clips():
    b('js', "JSON.stringify(Array.from(document.querySelectorAll('img')).map(i=>[i.alt,i.src]))", out=SP + '/alts.json')
    raw = open(SP + '/alts.json', encoding='utf-8').read().strip()
    data = json.loads(json.loads(raw) if raw.startswith('"') else raw)
    found = {}
    for alt, src in data:
        t = next((v for k, v in TEAM.items() if alt.startswith(k)), None)
        m = next((v for k, v in MOOD.items() if k in alt[:80]), None)
        if t and m and 'asb/' in src:
            found[f'{t}-{m}'] = src.split('=')[0] + '=mm,22,15'
    return found

want = int(sys.argv[2]) if len(sys.argv) > 2 else 14
for _ in range(60):
    f = clips()
    todo = {k: v for k, v in f.items() if not os.path.exists(f'flow/raw/{k}.mp4')}
    for name, url in todo.items():
        b('newtab', url); time.sleep(4)
        b('js', "window.__b64=null;fetch(location.href).then(r=>r.blob()).then(b=>b.arrayBuffer()).then(ab=>{const a=new Uint8Array(ab);let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode.apply(null,a.subarray(i,i+32768));window.__b64=btoa(s);}).catch(e=>window.__b64='ERR'+e.message);'go'")
        for _ in range(20):
            time.sleep(2)
            b('js', 'window.__b64', out=SP + '/c.b64')
            d = open(SP + '/c.b64').read().strip().strip('"')
            if len(d) > 1000 or d.startswith('ERR'): break
        b('closetab')
        if d.startswith('ERR') or len(d) < 1000:
            print(name, 'not ready'); continue
        open(f'flow/raw/{name}.mp4', 'wb').write(base64.b64decode(d)); print(name, 'saved')
    have = len([x for x in os.listdir('flow/raw') if x.endswith('.mp4')])
    if have >= want: break
    time.sleep(20)
os.remove(SP + '/c.b64') if os.path.exists(SP + '/c.b64') else None
print('have', sorted(os.listdir('flow/raw')))
