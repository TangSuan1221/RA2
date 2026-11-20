import json,math,random,heapq,itertools
from pathlib import Path
R=Path(__file__).resolve().parent
rng=random.Random(20261120)
xs=list(range(120,1081,120));ys=[100,220,380,500,620,740,860,980]
roads=[]
def road(a,b,w=10,kind='street',gap=5):roads.append(dict(a=a,b=b,width=w,kind=kind,gap=gap))
for y in ys:
 for a,b in zip(xs,xs[1:]):
  if y==500 and 600<=a<840:continue
  road([a,y],[b,y],16 if y in [220,620,860] else 10)
for x in xs:
 for a,b in zip(ys,ys[1:]):
  if a==220:
   if x not in [240,600,1080]:continue
   road([x,a],[x,b],28 if x==1080 else 16,'lift_bridge' if x==600 else 'fixed_bridge');continue
  if x==720 and a in [380,500]:continue
  road([x,a],[x,b],28 if x==1080 else 16 if x in [240,600] else 10)
# Small service quays remain connected to the western collector.
road([120,500],[70,500],8);road([70,500],[70,560],8);road([70,560],[120,560],8)
# Integrate dock node by splitting collector edge.
for e in list(roads):
 if e['a']==[120,500] and e['b']==[120,620]:
  roads.remove(e);road([120,500],[120,560],e['width']);road([120,560],[120,620],e['width'])
# Separate mobility tests: narrow lanes, not a restriction on the task route.
road([360,100],[480,100],3,'motorcycle_test',1.6)
road([840,980],[960,980],4,'car_test',3)
# Remove the duplicate wide edges at these test lanes.
for kind,a,b in [('motorcycle_test',[360,100],[480,100]),('car_test',[840,980],[960,980])]:
 roads[:]=[e for e in roads if not(e['a']==a and e['b']==b and e['kind']=='street')]
reserves=[('劳顿堡',120,360,100,220),('广播站',480,600,100,220),('消防站',240,360,620,740),('出生民居',240,360,860,980),('变电站',840,960,500,620),('水族馆',120,240,380,500),('派克市场',360,480,380,500),('太空针禁车广场',600,840,380,620),('渡口',70,240,500,620),('口袋公园',480,600,740,860)]
buildings=[]
def add(name,x,y,w,d,h,zone='地标'):
 buildings.append(dict(name=name,x=x,y=y,w=w,d=d,h=h,zone=zone))
def overlap(a,b,gap=0):return abs(a['x']-b['x'])<(a['w']+b['w'])/2+gap and abs(a['y']-b['y'])<(a['d']+b['d'])/2+gap
# Continuous urban blocks; each has an open central court and street-facing masses.
blocks=[]
for ya,yb in zip(ys,ys[1:]):
 if ya==220:continue
 for xa,xb in zip(xs,xs[1:]):
  if any(xa<r[2] and xb>r[1] and ya<r[4] and yb>r[3] for r in reserves):continue
  zone='住宅' if ya>=740 else '工业' if xa>=840 else '商业'
  if ya==100:zone='低层街区'
  positions=[(26,26),(60,26),(94,26),(26,94),(60,94),(94,94),(26,60),(94,60)]
  if zone=='工业':positions=[(32,32),(88,32),(32,88),(88,88)]
  for j,(dx,dy) in enumerate(positions):
   if zone=='住宅':w,d,h=rng.uniform(16,21),rng.uniform(18,23),rng.choice([7.2,10.8,14.4])
   elif zone=='工业':w,d,h=rng.uniform(34,40),rng.uniform(30,37),rng.choice([7,9,12])
   elif zone=='低层街区':w,d,h=rng.uniform(21,25),rng.uniform(20,25),rng.choice([7.2,10.8,14.4])
   else:w,d,h=rng.uniform(24,28),rng.uniform(23,28),rng.choice([14.4,18,21.6,28.8,36])
   add(f'{zone}_{xa}_{ya}_{j}',xa+dx-(6 if xa==960 and dx>60 else 0),ya+dy,w,d,h,zone)
  blocks.append(dict(x=xa,y=ya,w=120,d=120,zone=zone))
# POI building masses, apron/court left open.
for b in [('劳顿堡营房A',160,134,42,22,8),('劳顿堡营房B',210,134,36,22,8),('劳顿堡仓库',320,140,32,30,7),('劳顿堡指挥楼',170,185,42,24,11),('劳顿堡医务',318,188,32,22,7),('广播站主楼',530,145,36,27,10),('广播站配楼',570,140,22,18,7),('消防站车库',310,657,58,30,9),('消防站宿舍',326,700,26,36,14),('出生民居',284,912,18,22,7),('出生邻居A',329,894,18,22,7),('出生邻居B',330,946,18,22,7),('出生街角食品',270,950,24,18,7),('变电控制室',874,530,30,22,7),('变电仓库',928,530,28,22,7),('水族馆主楼',176,430,76,58,14),('市场北厅',420,409,76,23,11),('市场南厅',420,472,76,23,11),('市场西厅',385,440,18,30,11),('码头客运楼',169,541,52,26,8),('码头仓库',205,590,36,24,7),('塔区服务楼',635,408,30,22,8),('塔区后勤楼',804,590,30,22,8)]:add(*b)
# Courtyard objects are proxies, excluded from building density metrics.
landmarks=[dict(name='太空针塔',x=720,y=500,w=6,d=6,h=116),dict(name='观景层',x=720,y=500,w=32,d=32,h=8,z=120),dict(name='广播天线',x=530,y=185,w=3,d=3,h=27)]
stops=[('出生民居',[240,860]),('消防站',[240,620]),('劳顿堡',[240,220]),('广播站',[600,220]),('变电站',[960,620]),('交易渡口',[120,560])]
def shortest(edges,start,end,width=2.6,bridge_open=False):
 adj={}
 for e in edges:
  if e['gap']<width or bridge_open and e['kind']=='lift_bridge':continue
  a,b=tuple(e['a']),tuple(e['b']);d=math.dist(a,b)
  adj.setdefault(a,[]).append((b,d));adj.setdefault(b,[]).append((a,d))
 q=[(0,tuple(start))];seen=set()
 while q:
  d,u=heapq.heappop(q)
  if u==tuple(end):return round(d,2)
  if u in seen:continue
  seen.add(u)
  for v,w in adj.get(u,[]):heapq.heappush(q,(d+w,v))
 return None
# Geometry checks: no building intrudes into road carriageway + 2m sidewalk.
conflicts=[]
for b in buildings:
 for e in roads:
  x1,y1=e['a'];x2,y2=e['b'];r=dict(x=(x1+x2)/2,y=(y1+y2)/2,w=abs(x2-x1)+(e['width'] if x1==x2 else 0),d=abs(y2-y1)+(e['width'] if y1==y2 else 0))
  if overlap(b,r,2):conflicts.append([b['name'],e['a'],e['b']])
pairs=[(a['name'],b['name']) for a,b in itertools.combinations(buildings,2) if overlap(a,b)]
checks=[]
for width in [0.7,1.2,2.6,3.6]:
 for opened in [False,True]:
  for (an,a),(bn,b) in zip(stops,stops[1:]):checks.append(dict(mode_width=width,bridge_open=opened,leg=an+' → '+bn,distance=shortest(roads,a,b,width,opened)))
assert not conflicts,conflicts
assert not pairs,pairs
assert all(c['distance'] is not None for c in checks)
density={}
for zone in ['住宅','商业','工业','低层街区']:
 bs=[b for b in buildings if b['zone']==zone];area=sum(q['w']*q['d'] for q in blocks if q['zone']==zone)
 density[zone]=dict(buildings=len(bs),gross_block_coverage=round(sum(b['w']*b['d'] for b in bs)/area*100,1))
legs=[shortest(roads,a,b) for (_,a),(_,b) in zip(stops,stops[1:])]
old=json.loads((R.parent/'density/massing.json').read_text(encoding='utf8'))
oldedges=[dict(a=e['A'],b=e['B'],gap=e['gap'],kind=e['state']) for e in old['roads'] if e['state'] not in ['closed','boat','clear']]
oldstops=[[275,1810],[420,1220],[440,590],[760,360],[1680,1280],[240,930]]
oldlegs=[shortest(oldedges,a,b) for a,b in zip(oldstops,oldstops[1:])]
metrics=dict(buildings=len(buildings),district_density=density,old_route_legs=oldlegs,new_route_legs=legs,old_route_total=sum(oldlegs),new_route_total=sum(legs),building_road_conflicts=len(conflicts),building_overlap_pairs=len(pairs),route_checks_passed=len(checks),max_road_segment=max(math.dist(e['a'],e['b']) for e in roads),note='Coverage is building footprint / gross populated block area including half bordering roads; not floor-area ratio. Routes end at POI road access nodes, exclude internal walking.')
result=dict(size=[1200,1080],roads=roads,buildings=buildings,landmarks=landmarks,reserves=reserves,stops=stops,blocks=blocks,metrics=metrics,checks=checks)
(R/'layout-v2.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(metrics,ensure_ascii=False,indent=2))

