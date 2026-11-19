"""Key every flow/raw/<team>-<mood>.mp4 into a transparent assets/<team>/<mood>.webm, cropped to the area the character moves in."""
import glob, os, subprocess, tempfile
from PIL import Image, ImageChops

def motion_box(path):
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', 'fps=4', f'{d}/%03d.png'], check=True)
        x0 = y0 = 10**9; x1 = y1 = 0
        for f in glob.glob(d + '/*.png'):
            im = Image.open(f).convert('RGB'); w, h = im.size
            r, g, b = im.split()
            green = ImageChops.multiply(Image.eval(g, lambda v: 255 if v > 150 else 0), Image.eval(r, lambda v: 255 if v < 120 else 0))
            bb = ImageChops.invert(green).getbbox()  # character = not strong green
            if bb: x0, y0, x1, y1 = min(x0, bb[0]), min(y0, bb[1]), max(x1, bb[2]), max(y1, bb[3])
    p = 12
    x0, y0, x1, y1 = max(0, x0 - p), max(0, y0 - p), min(w, x1 + p), min(h, y1 + p)
    return x1 - x0 - (x1 - x0) % 2, y1 - y0 - (y1 - y0) % 2, x0, y0

# One crop per team (union of its clips) so the character keeps the same size across moods.
boxes = {}
for src in sorted(glob.glob('flow/raw/*.mp4')):
    team = os.path.basename(src)[:-4].split('-', 1)[0]
    cw, ch, cx, cy = motion_box(src)
    o = boxes.get(team, (10**9, 10**9, 0, 0))
    boxes[team] = (min(o[0], cx), min(o[1], cy), max(o[2], cx + cw), max(o[3], cy + ch))

for src in sorted(glob.glob('flow/raw/*.mp4')):
    team, mood = os.path.basename(src)[:-4].split('-', 1)
    x0, y0, x1, y1 = boxes[team]
    cw, ch, cx, cy = (x1 - x0) // 2 * 2, (y1 - y0) // 2 * 2, x0, y0
    out = f'assets/{team}/{mood}.webm'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-an', '-vf',
        f'crop={cw}:{ch}:{cx}:{cy},chromakey=0x00FF00:0.16:0.08,despill=type=green,scale=-2:520,format=yuva420p',
        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '32', '-row-mt', '1', '-auto-alt-ref', '0', out], check=True)
    print(f'{team}-{mood}', f'crop {cw}x{ch}+{cx}+{cy}', os.path.getsize(out) // 1024, 'KB')
