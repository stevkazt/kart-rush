"""Track design checker (offline, no browser). Usage: python3 dev/track-check.py '[[x,z],...]' out.svg
min corner radius, clearance between non-adjacent parts, lap length. Also writes an SVG preview."""
import json, math, sys

def cr_point(p0, p1, p2, p3, t):
    # centripetal: alpha = 0.5, as THREE.CatmullRomCurve3 'centripetal'
    def d(a, b):
        v = math.dist(a, b) ** 0.5
        return v if v > 1e-4 else 1.0
    dt0, dt1, dt2 = d(p0, p1), d(p1, p2), d(p2, p3)
    if dt1 < 1e-4: dt1 = 1.0
    if dt0 < 1e-4: dt0 = dt1
    if dt2 < 1e-4: dt2 = dt1
    out = []
    for k in range(2):
        x0, x1, x2, x3 = p0[k], p1[k], p2[k], p3[k]
        t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1
        t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2
        t1 *= dt1; t2 *= dt1
        c0, c1 = x1, t1
        c2 = -3 * x1 + 3 * x2 - 2 * t1 - t2
        c3 = 2 * x1 - 2 * x2 + t1 + t2
        out.append(c0 + c1 * t + c2 * t * t + c3 * t * t * t)
    return out

def curve(points, dense=40):
    P = len(points); pts = []
    for i in range(P):
        p0, p1, p2, p3 = (points[(i - 1) % P], points[i], points[(i + 1) % P], points[(i + 2) % P])
        for s in range(dense):
            pts.append(cr_point(p0, p1, p2, p3, s / dense))
    return pts

def resample(pts, spacing=0.93):
    seg = [math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
    L = sum(seg); N = round(L / spacing); step = L / N
    out, acc, i, target = [], 0.0, 0, 0.0
    for n in range(N):
        target = n * step
        while acc + seg[i] < target: acc += seg[i]; i += 1
        f = (target - acc) / seg[i]; a, b = pts[i], pts[(i + 1) % len(pts)]
        out.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
    return out, L

points = json.loads(sys.argv[1])
s, L = resample(curve([p[:2] for p in points]))
N = len(s)
K = 6
rad = []
def hd(i): a, b = s[i % N], s[(i + 1) % N]; return math.atan2(b[0] - a[0], b[1] - a[1])
for i in range(N):
    # like the game: heading change over 6 samples (tangents at i-3 and i+3)
    ang = abs((hd(i + 3) - hd(i - 3) + math.pi) % (2 * math.pi) - math.pi)
    rad.append(6 * L / N / ang if ang > 1e-4 else 1e9)
mi = min(range(N), key=lambda i: rad[i])
# clearance: closest pair of samples more than 60 m apart along the track
best = (1e9, 0, 0)
for i in range(0, N, 3):
    for j in range(i + 1, N, 3):
        along = min(j - i, N - (j - i)) * L / N
        if along < 60: continue
        d = math.dist(s[i], s[j])
        if d < best[0]: best = (d, i, j)
corners = [(i, round(rad[i], 1), tuple(round(v) for v in s[i])) for i in range(N) if rad[i] < 35 and rad[i] == min(rad[(i + d) % N] for d in range(-20, 21))]
print(f"length {L:.0f} m, N {N}, min radius {rad[mi]:.1f} m at idx {mi}, corners<30m radii {corners}")
print(f"closest approach between different parts: {best[0]:.1f} m (idx {best[1]} / {best[2]}), need >= 26")
xs = [p[0] for p in s]; zs = [p[1] for p in s]
print(f"bounds x {min(xs):.0f}..{max(xs):.0f}  z {min(zs):.0f}..{max(zs):.0f}")
# start straight: heading change over the 30 m before idx 0 and 15 m after
def heading(i): a, b = s[i % N], s[(i + 1) % N]; return math.atan2(b[0] - a[0], b[1] - a[1])
pre = abs((heading(0) - heading(-40) + math.pi) % (2 * math.pi) - math.pi) * 57.3
print(f"start straight: heading change over the 37 m before the line {pre:.1f} deg")
# SVG
pad = 30; W = max(xs) - min(xs) + 2 * pad; H = max(zs) - min(zs) + 2 * pad
path = ' '.join(f"{'M' if i == 0 else 'L'}{p[0] - min(xs) + pad:.1f},{p[1] - min(zs) + pad:.1f}" for i, p in enumerate(s)) + ' Z'
lab = ''.join(f'<text x="{s[i][0]-min(xs)+pad:.0f}" y="{s[i][1]-min(zs)+pad:.0f}" font-size="9" fill="red">{i}</text>' for i in range(0, N, 50))
open(sys.argv[2], 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}" width="{W*2:.0f}"><rect width="100%" height="100%" fill="#6cc04a"/><path d="{path}" fill="none" stroke="#555" stroke-width="20" stroke-linejoin="round"/><path d="{path}" fill="none" stroke="#fff" stroke-width="1"/>{lab}<circle cx="{s[0][0]-min(xs)+pad}" cy="{s[0][1]-min(zs)+pad}" r="5" fill="yellow"/></svg>')

# ASCII plot, 4 m per column / 8 m per row
cols = int((max(xs) - min(xs)) / 4) + 3; rows = int((max(zs) - min(zs)) / 8) + 3
grid = [[' '] * cols for _ in range(rows)]
for i, p in enumerate(s):
    c = int((p[0] - min(xs)) / 4) + 1; r = int((p[1] - min(zs)) / 8) + 1
    grid[r][c] = '#' if rad[i] < 25 else '*'
for i in range(0, N, 100):
    p = s[i]; c = int((p[0] - min(xs)) / 4) + 1; r = int((p[1] - min(zs)) / 8) + 1
    for k, ch in enumerate(str(i)): 
        if c + k < cols: grid[r][c + k] = ch
p = s[0]; grid[int((p[1] - min(zs)) / 8) + 1][int((p[0] - min(xs)) / 4) + 1] = 'S'
print('\n'.join(''.join(r) for r in grid))
