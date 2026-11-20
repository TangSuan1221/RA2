from pathlib import Path
from math import dist
import json,heapq
from PIL import Image,ImageDraw,ImageFont
r=Path(__file__).parent
V={};E=[];S=[]
def node(x,y): 
 k=f'{x},{y}';V[k]=[x,y];return k
def edge(a,b,grade='L3',gap=5,state='',layer=0):
 E.append(dict(a=node(*a),b=node(*b),grade=grade,gap=gap,state=state,z=layer))
def site(name,x,y,typ):S.append(dict(name=name,x=x,y=y,typ=typ))
xs=[240,760,1680,1900];ys=[160,360,1280,1580,1890]
for y in ys:
 for a,b in zip(xs,xs[1:]):
  grade='L3' if y in [360,1580] else 'L2'
  edge((a,y),(b,y),grade,1.6 if y==360 and a==760 else 3 if y==1580 and a==760 else 5)
for x in xs:
 for a,b in zip(ys,ys[1:]):
  grade='L1' if x==1900 else 'L2' if x in [240,760] else 'L3'
  if a==360:
   # split the canal crossing into a bridge and approaches
   for u,v in [(360,440),(440,520),(520,1280)]:
    edge((x,u),(x,v),grade,5,'bridge' if u==440 and x==760 else 'clear' if u==440 and x==1680 else '',2 if x==1900 else 0)
  else:edge((x,a),(x,b),grade,5,'',2 if x==1900 else 0)
# ground collector skirts eastern boundary of exclusion; I-5 connectors climb at terminals
for e in E:
 if e['a'].startswith('1680,') and e['b'].startswith('1900,'):
  if e['a'].endswith((',360',',1580',',1280')):e['state']='closed'
  else:e['state']='ramp'
def path(pts,g='L3',gap=5,st=''):
 for a,b in zip(pts,pts[1:]):edge(a,b,g,gap,st)
# attach real subdivision points to existing segments
def split(x,y):
 for i,e in enumerate(E):
  a,b=V[e['a']],V[e['b']]
  if [x,y] in [a,b]:continue
  if abs(dist(a,(x,y))+dist(b,(x,y))-dist(a,b))<.001:
   E.pop(i);edge(a,(x,y),e['grade'],e['gap'],e['state'],e['z']);edge((x,y),b,e['grade'],e['gap'],e['state'],e['z']);return
camps=[('C1 劳顿堡',440,590,150),('C2 消防站',420,1220,60),('C3 出生民居',275,1810,25)]
pois=[('水族馆',150,930),('派克市场',720,1060),('先锋地下城',430,1330),('球体温室',640,285),('摩天楼群',870,1160)]
for n,x,y in pois:site(n,x,y,'T2')
for n,x,y,w in camps:
 site(n,x,y,'营地');split(240,y);path([(240,y),(x,y)],'L2')
 _,tx,ty=min(pois,key=lambda p:dist((x,y),p[1:]))
 path([(x,y),(x+20,y+24),(tx,ty)],'L4',.8)
 for j,(label,dx,dy) in enumerate([('食品',40,38),('诊所',30,-42),('零件',-65,35)]):site(label,x+dx,y+dy,'T3')
site('太空针隔离区',1220,816,'T1')
for a in [(760,816),(1220,1280)]:
 split(*a);path([a,(1220,816)],'L4',.8);site('停车场',*a,'停车')
for n,x,y in [('N01 桥控',760,440),('N02 备用桥控',240,440),('N03 联动台',1680,440),('N04 净水',440,590),('N05 广播',760,360),('N06 供电',1680,1280)]:site(n,x,y,'节点')
for n,x,y in [('交易渡口',240,930),('猎具店',800,1270),('五金店',680,1300),('T4 线索',980,1280),('空投场',1680,160),('码头',130,940)]:site(n,x,y,'设施')
split(240,930);path([(240,930),(150,930)],'L3',5,'tide')
path([(150,930),(130,940),(130,470),(240,470)],'L5',5,'boat')
path([(760,1580),(430,1330)],'L5',.8,'stairs')
path([(760,1280),(760,1580)],'L5',5,'tunnel')
path([(1220,816),(870,1160)],'L5',.8,'rail')
for y in [160,360,1280,1580,1890]:
 for x in [310,1610]:site('汽修',x,y+15,'T3')
for x in xs:
 for y in [180,1850]:site('油站',x+18,y,'T3')
for i in range(4):
 for j in range(4):
  site('街区食品',i*512+220,j*512+195,'T3')
  if i%2==0:site('街区药房',i*512+240,j*512+220,'T3')
def shortest(start,end,width,flags):
 q=[(0,start)];seen=set()
 while q:
  d,u=heapq.heappop(q)
  if u==end:return round(d)
  if u in seen:continue
  seen.add(u)
  for e in E:
   if e['gap']<width or e['state'] in flags or u not in [e['a'],e['b']]:continue
   v=e['b'] if u==e['a'] else e['a'];heapq.heappush(q,(d+dist(V[u],V[v]),v))
flags={'closed','boat','bridge','clear','tide','stairs','rail'}
tests={}
for y in [360,1580]:
 for w in [1.2,2.6,3.6]:
  tests[f'{y} / {w}']=shortest(f'760,{y}',f'1680,{y}',w,flags)
assert all(tests.values()) and tests['360 / 1.2']<tests['360 / 2.6'] and tests['1580 / 2.6']<tests['1580 / 3.6']
assert all(256<=dist((440,590),(x,y))<=768 for _,x,y in pois)
# physical envelopes, not just centres
for _,x,y,w in camps:
 assert dist((0,0),(max(0,abs(x-1220)-150-w/2),max(0,abs(y-816)-150-w/2)))>=512
assert dist((275,1810),(1220,816))>1024
D=dict(nodes=V,edges=E,sites=S,camps=camps,tests=tests)
(r/'layout.json').write_text(json.dumps(D,ensure_ascii=False,indent=2),'utf8')
im=Image.new('RGB',(1500,1160),'#172928');g=ImageDraw.Draw(im)
def txt(x,y,s,n=16,c='#f3f0d9'):g.text((x,y),s,font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',n),fill=c,stroke_width=1,stroke_fill='#24342e')
def px(x,y):return(32+x*.49,82+y*.49)
def box(x,y,w,h,c):g.rectangle([px(x,y),px(x+w,y+h)],fill=c)
txt(32,18,'08 × 10    驾驶与生存测试场',34);box(0,0,2048,2048,'#44584b');box(0,440,2048,80,'#2b5366');box(0,520,100,1528,'#2b5366')
for i in range(5):
 for a,b in [((512*i,0),(512*i,2048)),((0,512*i),(2048,512*i))]:g.line([px(*a),px(*b)],fill='#68786b')
box(1070,666,300,300,'#855b4e')
for e in E:
 if e['state']=='closed':continue
 g.line([px(*V[e['a']]),px(*V[e['b']])],fill={'L1':'#ddb077','L2':'#c4cbbb','L3':'#96aaa2','L4':'#ddce89','L5':'#ba9cbf'}[e['grade']],width={'L1':10,'L2':6,'L3':3,'L4':2,'L5':2}[e['grade']])
for n,x,y,w in camps:box(x-w/2,y-w/2,w,w,'#8da177')
for s in S:
 x,y=px(s['x'],s['y']);g.ellipse((x-3,y-3,x+3,y+3),fill='#e5c577')
 if s['typ'] in ['营地','T1','T2','停车'] or s['name'] in ['N06 供电','N05 广播','交易渡口']:txt(x+5,y+2,s['name'],15)
for i,(h,lines) in enumerate([('01  车辆分流',['北支路净宽 1.6m：摩托捷径','南支路净宽 3.0m：轿车捷径','东侧地面街连通南北，仅两端上高速']),('02  运河状态',['西岸固定桥与东侧高速下层常通','中桥可升起；东侧低桥可清障','桥控台为北岸节点的微缩借位']),('03  弃车与补给',['两处停车进入太空针，步行口 0.8m','三座营地设车道、步行补给线','近营三件套：食品、诊所、零件']),('04  事件与层级',['涨潮关闭水族馆低路，保留步行口','地下车道 Z−2；单轨步道 Z2','无线电预告空投，供电开启电梯']),('05  使用方式',['打开 test.html，选择载具和状态','点击起点与终点试算可行路线','金点为设施，完整清单见布局数据'])]):
 y=95+i*196;txt(1060,y,h,23,'#e4cc91')
 for j,l in enumerate(lines):txt(1060,y+45+32*j,l,17)
txt(32,1100,'北 ↑    2048 × 2048 m    每格 512 m    ｜    颜色按道路等级；图示为机制测试场，地标位置经过压缩与借位。',19)
im.save(r/'layout.png')
(r/'test.html').write_text((r/'test-template.html').read_text('utf-8-sig').replace('MAPDATA',json.dumps(D,ensure_ascii=False)),'utf8')
