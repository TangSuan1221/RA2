from pathlib import Path
import json,math,zipfile
r=Path('docs/map-atlas'); d=json.loads((r/'map-layout.json').read_text('utf8')); points=[]
def add(k,i,n,x,y,info):points.append(dict(k=k,id=i,n=n,x=x,y=y,cell=chr(65+int(x))+str(1+int(y)),info=info))
def wet(x,y):
 for poly in d['waterPolygons']:
  inside=False
  for (a,b),(c,e) in zip(poly,poly[1:]+poly[:1]):
   if (b>y)!=(e>y) and x<(c-a)*(y-b)/(e-b)+a:inside=not inside
  if inside:return True
 return False
for k in ['c1','c2','c3']:
 for j,p in enumerate(d[k]):
  n=p.get('name') or (['消防站','学校','教堂','电台'][j%4]+'据点' if k=='c2' else '独栋民居')
  add(k.upper(),p['id'],n,p['x'],p['y'],{'c1':'150×150m · 10–30人 · 固定锚点 · 四车位','c2':'60×60m · 3–8人 · 固定建筑锚点 · 双车位','c3':'25×25m · 独狼或2–3人 · 民居本体'}[k])
for p,(n,v) in zip(d['nodes'],[('弗里蒙特开合桥控制室','控制弗里蒙特桥升降'),('巴拉德开合桥控制室','控制巴拉德桥升降'),('大学桥／蒙特雷克桥控制室','控制蒙特雷克桥升降，大学桥维持半开'),('志愿者公园水塔泵站','向附近营地供应净水'),('安妮女王山电台发射塔','全图广播，提前获知空投与尸潮'),('SODO变电站','区域供电，支持太空针塔电梯')]):add('N',p['id'],n,p['x'],p['y'],v)
land=[]
for y in range(8):
 for x in range(8):
  opts=[(x+a,y+b) for a in [.5,.25,.75,.1,.9] for b in [.3,.6,.8,.1] if not wet(x+a,y+b) and not any(math.dist((x+a,y+b),(p['x'],p['y']))<.49 for p in d['poi'][:4])]
  if opts and d['cells'][y][x] not in ['封锁边界','焚烧隔离带','华盛顿湖','埃利奥特湾','海湾','中立货轮','I-90浮桥','520浮桥','联合湖']:
   land.append(opts);j=len(land);add('食物','F%02d'%j,['便利店','超市','餐馆'][j%3],*opts[0],'本格日常食物补给')
for j,opts in enumerate(land[::2]):add('医疗','M%02d'%(j+1),['药店','诊所','兽医站'][j%3],*opts[-1],'每两格可布点陆区配置一处')
for j,(x,y) in enumerate([(2.2,2.4),(3.7,3.4),(4.2,4.4),(5.8,3.7),(3.3,5.5),(6.3,4.6),(2.2,1.7)]):add('武器','W%02d'%(j+1),['警局','猎具店','枪店'][j%3],x,y,'街区装备补给')
for j,road in enumerate(d['roads']):
 opts=[]
 for a,b in zip(road['points'],road['points'][1:]):
  for t in [.15,.45,.75]:
   x=a[0]+(b[0]-a[0])*t+.025;y=a[1]+(b[1]-a[1])*t
   if not wet(x,y):opts.append((x,y))
 for h,pos in enumerate([opts[0],opts[-1]]):add('载具','V%02d%s'%(j+1,'AB'[h]),['加油站','汽修厂'][h],*pos,road['grade']+' '+road['name'])
for j,(x,y) in enumerate([(2.4,.5),(1.4,1.4),(3.6,6.4)]):add('建材','B0'+str(j+1),'五金建材行',x,y,['巴拉德','因特湾','SODO'][j])
for p in points.copy():
 if p['k']=='C2':add('特殊','S'+p['id'][2:],p['n'],p['x'],p['y'],'与 '+p['id']+' 共用建筑')
s='''<!doctype html><meta charset=utf-8><title>街区、营地与控制节点</title><style>body{background:#172824;color:#e0ebe0;font:16px Microsoft YaHei,sans-serif;margin:3vw}main{display:grid;grid-template-columns:minmax(460px,1.4fr) minmax(350px,1fr);gap:24px}svg{background:#42564b;width:100%}select,input,button{padding:8px;margin:4px}aside{max-height:70vh;overflow:auto}button{display:block;text-align:left;width:97%;background:#293f37;color:white;border:1px solid #60756a}strong{color:#eed19a}</style><h1>西雅图街区、营地与控制节点</h1><p>按类别查看分布，点击编号或清单条目定位。T3 分功能落点为本次修订提案，原 47 个组团仅供版本对照。</p><select id=k></select><input id=q placeholder="搜索编号、区格、设施或收益"><p id=count></p><main><svg viewBox="0 0 800 800" id=m></svg><aside id=list></aside></main><p>按可布点陆区计算食物与医疗覆盖。纯水域、封锁区及浮桥未纳入。精确落点、营地入口与补给路线仍待白盒验证。</p><script>const P=POINTS,D=DATA;let selected='';let groups=['食物','医疗','武器','载具','建材','特殊','C1','C2','C3','N'];k.innerHTML=groups.map(g=>'<option>'+g+'</option>').join('');function draw(){let arr=P.filter(p=>p.k===k.value&&Object.values(p).join(' ').toLowerCase().includes(q.value.toLowerCase()));count.textContent=k.value+' · '+arr.length+' 处';let base=D.waterPolygons.map(a=>'<polygon fill="#203d50" points="'+a.map(v=>v.map(n=>n*100).join(',')).join(' ')+'"/>').join('');for(let i=0;i<64;i++){let x=i%8,y=i>>3;base+='<rect x="'+100*x+'" y="'+100*y+'" width="100" height="100" stroke="#809487" fill="none"/><text x="'+(100*x+3)+'" y="'+(100*y+14)+'" fill="#ced9d2" font-size="11">'+String.fromCharCode(65+x)+(y+1)+' '+D.cells[y][x]+'</text>'}m.innerHTML=base+arr.map(p=>'<g data-id="'+p.id+'" transform="translate('+100*p.x+' '+100*p.y+')"><circle r="'+(selected===p.id?9:4)+'" fill="'+(p.k==='N'?'#c7a2ff':p.k.startsWith('C')?'#b8d59e':'#ffda78')+'"/><text y="-6" text-anchor="middle" fill="white" stroke="#182821" stroke-width="3" paint-order="stroke" font-size="10">'+p.id+'</text></g>').join('');list.innerHTML=arr.map(p=>'<button data-id="'+p.id+'"><strong>'+p.id+' · '+p.cell+' · '+p.n+'</strong><br>'+p.info+'</button>').join('');document.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>{selected=el.dataset.id;draw();let b=[...list.children].find(e=>e.dataset.id===selected);b.style.borderColor='gold';b.scrollIntoView({block:'nearest'})})}k.onchange=q.oninput=draw;draw()</script>'''.replace('POINTS',json.dumps(points,ensure_ascii=False)).replace('DATA',json.dumps(d,ensure_ascii=False))
(r/'districts.html').write_text(s,'utf8');(r/'district-points.json').write_text(json.dumps(points,ensure_ascii=False,indent=2),'utf8')
p=r/'index.html';p.write_text(p.read_text('utf8').replace('<h1>全部地图布局设计图</h1>','<h1>全部地图布局设计图</h1><p><a href="districts.html">打开修订专项地图 · T3 六类街区 / C1–C3 营地地块 / N-01 至 N-06 控制节点</a></p>'),'utf8')
with zipfile.ZipFile(r/'the-last-rule-map-atlas.zip','w',zipfile.ZIP_DEFLATED) as z:
 for f in r.rglob('*'):
  if f.is_file() and f.suffix not in ['.py','.zip']:z.write(f,f.relative_to(r))
from collections import Counter
print(Counter(p['k'] for p in points))
