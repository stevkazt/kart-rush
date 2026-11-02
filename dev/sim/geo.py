"""Geometry + 'what does the driver actually do' metrics per track. Same centripetal Catmull-Rom as the game."""
import json, math, sys
def cr_point(p0,p1,p2,p3,t):
    def d(a,b):
        v=math.dist(a,b)**0.5
        return v if v>1e-4 else 1.0
    dt0,dt1,dt2=d(p0,p1),d(p1,p2),d(p2,p3)
    out=[]
    for k in range(len(p1)):
        x0,x1,x2,x3=p0[k],p1[k],p2[k],p3[k]
        t1=(x1-x0)/dt0-(x2-x0)/(dt0+dt1)+(x2-x1)/dt1
        t2=(x2-x1)/dt1-(x3-x1)/(dt1+dt2)+(x3-x2)/dt2
        t1*=dt1;t2*=dt1
        out.append(x1+t1*t+(-3*x1+3*x2-2*t1-t2)*t*t+(2*x1-2*x2+t1+t2)*t*t*t)
    return out
def sample(points,spacing=0.93,dense=40):
    P=len(points);pts=[]
    pp=[(p[0],p[1],p[2] if len(p)>2 else 0) for p in points]
    for i in range(P):
        for s in range(dense):
            pts.append(cr_point(pp[(i-1)%P],pp[i],pp[(i+1)%P],pp[(i+2)%P],s/dense))
    seg=[math.dist(pts[i],pts[(i+1)%len(pts)]) for i in range(len(pts))]
    L=sum(seg);N=round(L/spacing);step=L/N
    out=[];acc=0;i=0
    for n in range(N):
        target=n*step
        while acc+seg[i]<target: acc+=seg[i];i+=1
        f=(target-acc)/seg[i];a,b=pts[i],pts[(i+1)%len(pts)]
        out.append(tuple(a[k]+(b[k]-a[k])*f for k in range(3)))
    return out,L
def analyse(name,t,vmax=26,alat=22,acc=7,brk=20):
    s,L=sample(t['points']);N=len(s);ds=L/N
    hd=[math.atan2(s[(i+1)%N][0]-s[i][0],s[(i+1)%N][1]-s[i][1]) for i in range(N)]
    wrap=lambda a:(a+math.pi)%(2*math.pi)-math.pi
    K=8
    sc=[wrap(hd[(i+K)%N]-hd[(i-K)%N])/(2*K*ds) for i in range(N)]  # signed curvature
    R=[1/abs(c) if abs(c)>1e-5 else 1e9 for c in sc]
    y=[p[2] for p in s]
    cls=lambda r:'straight' if r>=150 else 'fast' if r>=60 else 'medium' if r>=30 else 'tight' if r>=15 else 'hairpin'
    share={}
    for r in R: share[cls(r)]=share.get(cls(r),0)+ds/L*100
    # corners: contiguous stretches with R<100, same sign
    corners=[];i=0
    start=next((j for j in range(N) if R[j]>=100),0)
    idx=[(start+j)%N for j in range(N)]
    cur=None
    for j in idx:
        if R[j]<100:
            sg=1 if sc[j]>0 else -1
            if cur and cur['sg']==sg: cur['end']=j;cur['ang']+=abs(sc[j])*ds;cur['minR']=min(cur['minR'],R[j]);cur['len']+=ds
            else:
                if cur: corners.append(cur)
                cur={'start':j,'end':j,'sg':sg,'ang':abs(sc[j])*ds,'minR':R[j],'len':ds}
        else:
            if cur: corners.append(cur);cur=None
    if cur: corners.append(cur)
    corners=[c for c in corners if c['ang']>math.radians(15)]
    # straights: longest run with R>=150; flat-out share with a speed profile
    vc=[min(vmax,math.sqrt(alat*r)) for r in R]
    v=vc[:]
    for _ in range(2):
        for i in range(2*N):
            a=i%N;b=(i+1)%N
            v[b]=min(v[b],math.sqrt(v[a]**2+2*acc*ds*max(0,1-(v[a]/vmax)**2)+1e-6))
        for i in range(2*N,0,-1):
            a=i%N;b=(i-1)%N
            v[b]=min(v[b],math.sqrt(v[a]**2+2*brk*ds))
    lap=sum(ds/max(x,1) for x in v)
    flat=sum(ds for x in v if x>=vmax*0.97)/L*100
    # 'liftpoints': how many separate places you must slow to <90 %
    lifts=0;below=False
    lows=[]
    for i in range(N):
        if v[i]<vmax*0.9 and not below: lifts+=1;below=True
        if v[i]>=vmax*0.9: below=False
    best=0;run=0
    for j in idx+idx:
        run=run+ds if R[j]>=120 else 0
        best=max(best,min(run,L))
    gaps=sum(ds for r in R if r>0)
    climb=sum(max(0,y[(i+1)%N]-y[i]) for i in range(N))
    # direction changes: left-right transitions
    flips=sum(1 for a,b in zip(corners,corners[1:]+corners[:1]) if a['sg']!=b['sg'])
    # closest non adjacent same-level
    best_d=1e9
    for i in range(0,N,4):
        for j in range(i+1,N,4):
            al=min(j-i,N-(j-i))*ds
            if al<60 or abs(y[i]-y[j])>=6.5: continue
            d=math.hypot(s[i][0]-s[j][0],s[i][1]-s[j][1])
            if d<best_d: best_d=d
    xs=[p[0] for p in s];zs=[p[1] for p in s]
    return dict(name=name,title=t['name'],L=round(L),N=N,lap=round(lap,1),flat=round(flat),lifts=lifts,corners=len(corners),
      tightest=round(min(R),1),longest=round(best),climb=round(climb,1),hmin=round(min(y),1),hmax=round(max(y),1),flips=flips,
      share={k:round(v_) for k,v_ in share.items()},clear=round(best_d,1),bx=round(max(xs)-min(xs)),bz=round(max(zs)-min(zs)),
      nb=len(t.get('boxRows',[])),pads=len(t.get('pads',[])),bumps=len(t.get('bumps',[])),jumps=len(t.get('jumps',[])),banks=len(t.get('banks',[]))+len(t.get('bankRuns',[])),ice=len(t.get('ice',[])),gaps=len(t.get('gaps',[])),
      turnlist=[(c['start'],'L' if c['sg']>0 else 'R',round(math.degrees(c['ang'])),round(c['minR'])) for c in corners])
if __name__=='__main__':
    T=json.load(open(sys.argv[1]))
    for k,t in T.items():
        a=analyse(k,t)
        print(f"\n== {k} '{a['title']}' {a['L']} m, lap(ideal) {a['lap']} s, flat-out {a['flat']}%, sitios donde levantar {a['lifts']}, curvas {a['corners']}, tightest R{a['tightest']}, recta max {a['longest']} m, cambios L/R {a['flips']}, sube {a['climb']} m ({a['hmin']}..{a['hmax']}), clear {a['clear']} m, bbox {a['bx']}x{a['bz']}")
        print(f"   mix {a['share']}  rows {a['nb']} pads {a['pads']} bumps {a['bumps']} jumps {a['jumps']} banks {a['banks']} ice {a['ice']} gaps {a['gaps']}")
        print('   turns (idx,dir,deg,minR):',a['turnlist'])
