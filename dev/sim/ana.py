import json, glob, collections, statistics as st, sys
rows=[]
for f in glob.glob(sys.argv[1]+'/*.jsonl'):
    for l in open(f):
        try: rows.append(json.loads(l))
        except: pass
by=collections.defaultdict(list)
for r in rows: by[(r['track'],r['persona'])].append(r)
def med(a): return round(st.median(a),1) if a else None
summary={}
for (t,p),rs in sorted(by.items()):
    N=rs[0]['N']; sp=rs[0]['spacing']
    n=len(rs); plap=[];alap=[];ptime=[];spread=[];places=[]
    pc=collections.Counter(); rails=collections.Counter(); railLoss=[]; resetP=collections.Counter(); resetA=collections.Counter(); resetIdx=collections.Counter(); hitsP=0; pcs=[];near=[];idle=[];sw=[];on=[];lifts=[];liftdur=[];liftbins=collections.Counter()
    airP=[];airA=[];airbins=collections.Counter(); stall=collections.Counter(); hitsAll=[]; uses=[]; boxes=[]; dnf=0; simT=[]
    spd=collections.defaultdict(float);cnt=collections.defaultdict(int)
    for r in rs:
        last={}
        for e in r['events']:
            ty=e['type'];k=e.get('kart')
            if ty=='lap':
                if k in last: (plap if k==0 else alap).append(e['t']-last[k])
                last[k]=e['t']
            if ty=='rail' and k==0:
                rails[e['idx']//50*50]+=1; railLoss.append(e.get('loss',0))
            if ty=='reset':
                why=str(e.get('why')).split(' ')[0]
                (resetP if k==0 else resetA)[why]+=1
                resetIdx[e.get('idx',0)//50*50]+=1
            if ty=='hit' and k==0: hitsP+=1
            if ty=='lift' and e.get('on'): lifts.append(1); liftbins[e['idx']//50*50]+=1
            if ty=='lift' and not e.get('on'): liftdur.append(e.get('dur',0))
        fin=r['finished']; tt=[x['time'] for x in fin if x['time']]
        if fin[0]['time']: ptime.append(fin[0]['time'])
        else: dnf+=1
        places.append(fin[0]['place'])
        if len(tt)>1: spread.append(max(tt)-min(tt))
        tr=r['tr'];T=tr['ticks']/60
        simT.append(T);pcs.append(tr['placeCh']/max(T/60,.1));near.append(tr['near']/max(tr['ticks'],1));idle.append(tr['idleMax']);sw.append(tr['steerSw']/max(T/60,.1));on.append(100*tr['steerOn']/max(tr['ticks'],1))
        airP.append(tr['airKart'][0]);airA+=tr['airKart'][1:]
        for b,v in tr['air'].items(): airbins[int(b)]+=v
        for b,v in tr['speed'].items(): spd[int(b)]+=v;cnt[int(b)]+=tr['n'][b]
        pc['use']+=sum(1 for e in r['events'] if e['type']=='use' and e.get('kart')==0)
        pc['box']+=sum(1 for e in r['events'] if e['type']=='box' and e.get('kart')==0)
    prof=[(b,spd[b]/cnt[b]) for b in sorted(spd)]
    slow=[(b,round(v)) for b,v in prof if v<70]
    # merge slow bins
    segs=[]
    for b,v in slow:
        if segs and b-segs[-1][1]<=20: segs[-1][1]=b; segs[-1][2]=min(segs[-1][2],v)
        else: segs.append([b,b,v])
    summary[(t,p)]=dict(lapP=med(plap),lapBest=round(min(plap),1) if plap else None,lapA=med(alap),spread=med(spread),places=places,dnf=dnf,rail=round(sum(rails.values())/max(sum(simT)/60,.1),2),railL=med(railLoss),resetP=dict(resetP),resetA=dict(resetA),resetIdx=resetIdx.most_common(5),pcs=med(pcs),near=med(near),idle=med(idle),sw=med(sw),on=med(on),lifts=round(len(lifts)/n,1),liftS=round(sum(liftdur)/n,1),airP=med(airP),airA=med(airA),hits=round(hitsP/n,1),slow=segs,rails=rails.most_common(6),airb=[(b,round(v,1)) for b,v in airbins.most_common(4)],n=n,N=N)
for (t,p),s in summary.items():
    print(f"\n{t}/{p} n={s['n']} N={s['N']}: lapP med {s['lapP']} best {s['lapBest']} lapAI {s['lapA']} spread {s['spread']}s places {s['places']} dnf {s['dnf']}")
    print(f"  rail/min {s['rail']} lossMed {s['railL']} hits/race {s['hits']} resets P {s['resetP']} AI {s['resetA']} where {s['resetIdx']}")
    print(f"  placeChanges/min {s['pcs']} karts<20m {s['near']} maxIdle {s['idle']}s steerSwitch/min {s['sw']} steering% {s['on']} lifts/race {s['lifts']} liftSec/race {s['liftS']} airP {s['airP']}s airAI {s['airA']}s")
    print(f"  slow(<70km/h) {s['slow']}  railbins {s['rails']} airbins {s['airb']}")
