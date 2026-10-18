#!/usr/bin/env python3
"""Summary of a bomb-hit film (dev/test.sh film): fixed checks from film.jsonl + labelled contact sheets.
   python3 dev/film-report.py <film dir>      -> prints the checks, writes <dir>/sheets/sNN.png (every 4th frame, 10 per sheet)
Screen coords (scr) are normalised device coords: on screen = |x| <= 1 and |y| <= 1 (and z < 1, else behind the camera)."""
import glob, json, math, os, sys

d = sys.argv[1]
rows = [json.loads(l) for l in open(os.path.join(d, 'film.jsonl'))]
FPS = 30
hit = next((r['f'] for r in rows if r['hit'] == 0), None)
if hit is None:
    sys.exit('NO HIT: the bomb never hit the player (check the run)')
after = [r for r in rows if r['f'] >= hit]
sec = lambda n: f'{n / FPS:.2f}s'
off = lambda s: s is None or abs(s[0]) > 1 or abs(s[1]) > 1 or s[2] > 1

def span(key):
    fr = [r['f'] for r in after if r.get(key)]
    return (fr[0] - hit, fr[-1] - hit) if fr else None

print(f'hit at frame {hit}; film runs {sec(len(after))} after it (real/on-screen time, 30 fps)')
for key, name in [('eject', 'skeleton out of the seat'), ('eye2', 'eyeball 2 flying'), ('lens', 'eyeball on the lens')]:
    s = span(key)
    print(f'  {name:26s}: ' + (f'{sec(s[0])} -> {sec(s[1])}  ({sec(s[1] - s[0] + 1)})' if s else 'never'))
for key, name in [('gt', 'blast slow-mo'), ('gl', 'landing slow-mo')]:
    fr = [r['f'] - hit for r in after if r[key] >= 0]
    print(f'  {name:26s}: ' + (f'{sec(fr[0])} -> {sec(fr[-1])}' if fr else 'never'))

ej = [r for r in after if r['eject']]
if ej:
    xs = [r['eject']['scr'][0] for r in ej]; ys = [r['eject']['scr'][1] for r in ej]
    print('\nSKELETON')
    print(f'  off screen in {sum(off(r["eject"]["scr"]) for r in ej)}/{len(ej)} frames; screen x {min(xs):.2f}..{max(xs):.2f}, y {min(ys):.2f}..{max(ys):.2f} (moves on screen if the range is wide)')
    print(f'  distance to camera {min(r["eject"]["dist"] for r in ej):.1f}..{max(r["eject"]["dist"] for r in ej):.1f} m; peak height above the kart {max(r["eject"]["pos"][1] - r["kart"][1] for r in ej):.1f} m')
    land = next((r for r in ej if r['eject']['bounces'] >= 1), None)
    if land:
        p, k = land['eject']['pos'], land['kart']
        print(f'  first landing at {sec(land["f"] - hit)}, {math.hypot(p[0] - k[0], p[2] - k[2]):.1f} m from the kart, kart on screen then: see sheet')
e2 = [r for r in after if r['eye2']]
if e2:
    print('\nEYEBALL 2 (flight)')
    print(f'  off screen in {sum(off(r["eye2"]["scr"]) for r in e2)}/{len(e2)} frames (should be 0)')
    print('  path (time, screen x, y, distance to camera): ' + ' | '.join(f'{sec(r["f"] - hit)} {r["eye2"]["scr"][0]:.2f},{r["eye2"]["scr"][1]:.2f} {r["eye2"]["dist"]:.1f}m' for r in e2[::max(1, len(e2) // 8)]))
cam = [r['cam'] for r in after]
jumps = [math.dist(a, b) for a, b in zip(cam, cam[1:])]
print('\nCAMERA')
print(f'  max height above the kart {max(r["cam"][1] - r["kart"][1] for r in after):.1f} m; biggest move in one frame {max(jumps):.2f} m at {sec(jumps.index(max(jumps)) + 1)}')
print(f'  FOV range {min(r["fov"] for r in after):.0f}..{max(r["fov"] for r in after):.0f}')
print('\nBLOOD / OTHER')
print(f'  max flying drops {max(r["blood"] for r in after)}, max road decals {max(r["dots"] for r in after)} (cap 240), landing pools {max(r["splats"] for r in after)}')
back = next((r for r in after if r['f'] - hit > 10 and not r['eject'] and r['kmh'] >= 60), None)
print(f'  kart back to 60 km/h at {sec(back["f"] - hit) if back else "never"}')

# contact sheets: every 4th frame from 4 frames before the hit, 5 x 2 per sheet, each labelled with frame / time / slow-mo clocks
from PIL import Image, ImageDraw
files = {int(os.path.basename(f)[-8:-4]): f for f in glob.glob(os.path.join(d, '*film-[0-9]*.png'))}
by = {r['f']: r for r in rows}
sel = [f for f in sorted(files) if f >= hit - 4 and (f - hit) % 4 == 0]
os.makedirs(os.path.join(d, 'sheets'), exist_ok=True)
W, H = 260, 563
for s in range(0, len(sel), 10):
    sheet = Image.new('RGB', (W * 5, H * 2), 'black')
    for i, f in enumerate(sel[s:s + 10]):
        im = Image.open(files[f]).convert('RGB').resize((W, H)); dr = ImageDraw.Draw(im); r = by[f]
        dr.rectangle([0, 0, W, 16], fill='black'); dr.text((3, 2), f'f{f} t{(f - hit) / FPS:+.2f}s gt{r["gt"]} gl{r["gl"]}', fill='yellow')
        sheet.paste(im, ((i % 5) * W, (i // 5) * H))
    sheet.save(os.path.join(d, 'sheets', f's{s // 10:02d}.png'))
print(f'\n{len(sel)} frames on {math.ceil(len(sel) / 10)} contact sheets in {os.path.join(d, "sheets")}')
