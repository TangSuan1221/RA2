from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, math, html, random, zipfile

ROOT=Path(__file__).parent
OUT=ROOT/'plates'; OUT.mkdir(exist_ok=True)
W,H=1800,1400
C={'bg':'#152124','land':'#33433e','water':'#203b49','grid':'#647671','text':'#e0e6dc','muted':'#9dafaa','red':'#d66f61','orange':'#d6a064','green':'#a2b18b','purple':'#b8a4d6','road':'#9baca6','yellow':'#e1c776','white':'#ecede4'}
FONT='C:/Windows/Fonts/msyh.ttc'
FONTS={}
def font(n):
    if n not in FONTS:FONTS[n]=ImageFont.truetype(FONT,n)
    return FONTS[n]
class Plate:
    def __init__(self,key,title,sub):
        self.key,self.title=key,title;self.im=Image.new('RGB',(W,H),C['bg']);self.d=ImageDraw.Draw(self.im);self.svg=[]
        self.rect(0,0,W,H,C['bg']);self.text(64,36,'THE LAST RULE  /  SEATTLE FIELD ATLAS',19,C['green']);self.text(64,73,title,38)
        self.text(64,128,sub,19,C['muted']);self.line([(64,168),(1736,168)],C['grid'],2)
        self.text(64,1353,'设计提案 v1.0  ·  2026.11.19  ·  坐标北上 / 西→东 X、北→南 Y  ·  非已实现关卡',17,C['muted'])
        self.text(1620,1352,key,18)
    def rect(self,x,y,w,h,fill,stroke=None,sw=1):
        self.d.rectangle((x,y,x+w,y+h),fill,stroke,sw)
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill or "none"}" stroke="{stroke or "none"}" stroke-width="{sw}"/>')
    def line(self,pts,col,width=2,dash=False):
        if dash:
            for a,b in zip(pts,pts[1:]):
                dist=math.dist(a,b);n=max(1,int(dist/9))
                for i in range(0,n,2):
                    p=lambda t:(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t)
                    self.d.line([p(i/n),p(min(i+1,n)/n)],fill=col,width=width)
        else:self.d.line(pts,fill=col,width=width,joint='curve')
        self.svg.append(f'<polyline points="{" ".join(f"{x},{y}" for x,y in pts)}" fill="none" stroke="{col}" stroke-width="{width}"'+(' stroke-dasharray="9 9"' if dash else '')+'/>')
    def poly(self,pts,col):
        self.d.polygon(pts,fill=col);self.svg.append(f'<polygon points="{" ".join(f"{x},{y}" for x,y in pts)}" fill="{col}"/>')
    def circle(self,x,y,r,col,stroke=None):
        self.d.ellipse((x-r,y-r,x+r,y+r),fill=col,outline=stroke,width=2)
        self.svg.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{col}" stroke="{stroke or "none"}" stroke-width="2"/>')
    def text(self,x,y,t,size=20,col=None):
        col=col or C['text'];self.d.text((x,y),t,font=font(size),fill=col)
        self.svg.append(f'<text x="{x}" y="{y+size}" font-family="Microsoft YaHei,sans-serif" font-size="{size}" fill="{col}">{html.escape(str(t))}</text>')
    def arrow(self,pts,col=C['yellow'],width=4,dash=False):
        self.line(pts,col,width,dash);a,b=pts[-2:];ang=math.atan2(b[1]-a[1],b[0]-a[0]);self.poly([b,(b[0]-15*math.cos(ang-.5),b[1]-15*math.sin(ang-.5)),(b[0]-15*math.cos(ang+.5),b[1]-15*math.sin(ang+.5))],col)
    def notes(self,blocks):
        y=206
        for title,lines in blocks:
            self.text(1270,y,title,25,C['green']);y+=42
            for t in lines:self.text(1270,y,t,19);y+=32
            y+=26
    def save(self):
        self.im.save(OUT/f'{self.key}.png');(OUT/f'{self.key}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1400" viewBox="0 0 1800 1400">'+''.join(self.svg)+'</svg>',encoding='utf8')
        thumb=self.im.copy();thumb.thumbnail((600,467));thumb.save(OUT/f'{self.key}.webp',quality=83)
        sheets.append({'id':self.key,'title':self.title,'png':f'plates/{self.key}.png','svg':f'plates/{self.key}.svg'})

sheets=[]
names=[['海湾','巴拉德船闸','巴拉德老城','弗里蒙特','煤气厂公园','大学区','华大红场','华盛顿湖'],['发现公园','因特湾','安妮女王山北','联合湖西岸','联合湖','东湖','蒙特雷克','520浮桥'],['埃利奥特湾','谷物码头','安妮女王山','南联合湖','I-5走廊','国会山','志愿者公园','华盛顿湖'],['埃利奥特湾','雕塑公园','太空针塔','贝尔敦','I-5高架','派克派恩','中央区','华盛顿湖'],['中立货轮','水族馆','派克市场','市中心核心','高速公园','港湾医疗','中央区南','I-90浮桥'],['埃利奥特湾','渡轮码头','先锋广场','国际区','高速互通','灯塔山北','雷尼尔谷','华盛顿湖'],['港岛','集装箱码头','流明球场','SODO仓储','I-5南段','灯塔山','雷尼尔大道','封锁边界'],['西西雅图','杜瓦米什','乔治城','波音机场','I-5南出口','灯塔山南','焚烧隔离带','封锁边界']]
poi=[('T1-01','太空针塔',2.5,3.5),('T1-02','港湾医疗',5.5,4.5),('T1-03','流明球场',2.5,6.5),('T1-04','波音机场*',3.5,7.5),('T2-01','港口 / 港岛',.9,6.6),('T2-02','水族馆',1.55,4.5),('T2-03','派克市场',2.5,4.5),('T2-04','摩天楼群',3.5,4.5),('T2-05','先锋地下城',2.5,5.5),('T2-06','球体温室',3.5,2.5),('T2-07','因特湾铁路场',1.5,1.5),('T2-08','华大实验楼',6.8,.7),('T2-09','SODO仓储',3.5,6.5)]
camps=[('C1-01','煤气厂',4.35,.35),('C1-02','华大红场',6.5,.25),('C1-03','劳顿堡',.55,1.65),('C1-04','巴拉德船闸',1.5,.4),('C1-05','志愿者水塔',6.5,2.5)]
nodes=[('N-01',3.2,.9),('N-02',1.75,.9),('N-03',6.7,1.1),('N-04',6.65,2.7),('N-05',2.5,2.45),('N-06',3.9,6.7)]
waters=[[(0,0),(.7,0),(.75,.8),(.35,1.1),(.25,1.9),(1.1,2.2),(1.2,3.3),(1.25,5.8),(.25,6.1),(0,6.6)],[(7.35,0),(8,0),(8,6.8),(7.5,6.4),(7.2,4.5),(7.35,2.6),(7.1,1.5)],[(.55,.8),(2.7,.8),(3.8,.85),(4.2,.7),(4.8,.7),(5.1,.85),(6.4,.8),(7.4,1.1),(7.4,1.35),(6.3,1.05),(5.2,1.1),(5.15,1.8),(4.7,2.15),(4.05,1.95),(3.95,1.2),(3.6,1.05),(2.7,1.03),(.55,1.05)],[(.8,6.85),(1.8,6.9),(1.85,7.5),(1.65,8),(1.2,8),(1.4,7.35),(.8,7.15)]]
roads=[('L1','I-5',[(5.0,.15),(5,.8),(5,1.15),(5.35,2.25),(4.7,3),(4.7,5.3),(4.95,5.7),(4.7,7.9)]),('L1','SR-99',[(3.65,.15),(3.65,.8),(3.65,1.2),(3.15,2.3),(3.1,2.9)]),('L1','I-90',[(4.7,5.55),(5.9,5.5),(7.25,4.7),(7.95,4.7)]),('L2','15大道',[(1.75,.1),(1.75,1.1),(1.95,1.9),(2.0,2.9)]),('L2','北岸横贯',[(.9,.2),(2.7,.2),(3.2,.4),(4.7,.4),(5.75,.4),(6.95,.4)]),('L2','弗里蒙特支线',[(3.2,.4),(3.2,1.35),(3.1,2.2)]),('L2','蒙特雷克',[(6.7,.4),(6.7,1.4),(6.25,1.9),(6.3,3.1),(6.5,4),(6.5,5.6),(6.5,7.6)]),('L2','默瑟街',[(1.45,2.9),(3.1,2.9),(4.7,2.9),(6.3,2.9)]),('L2','丹尼路',[(1.4,4),(3.4,4),(4.7,4),(6.5,4)]),('L2','滨海大道',[(1.25,2.4),(1.4,3.6),(1.15,4.8),(1.35,5.6),(1.75,6.2),(1.85,6.9)]),('L2','SODO环线',[(1.85,6.9),(2.1,7.2),(3,7.1),(4.1,7.0),(4.7,6.9),(6.5,6.9)]),('L2','南部联络',[(.4,7.7),(.9,7.5),(1.95,7.5),(2.2,7.2)]),('L2','劳顿堡支路',[(.65,1.55),(.8,1.3),(1.75,1.3)])]
bridges=[('B01','巴拉德',1.75,.92,'电控 / 保底联锁'),('B02','弗里蒙特',3.2,.93,'电控'),('B03','极光桥',3.65,.96,'仅摩托 / 步行'),('B04','I-5运河桥',5,.96,'下层汽车永久通'),('B05','大学桥',5.75,.96,'攀爬步行'),('B06','蒙特雷克',6.7,1.1,'电控 / 保底联锁'),('B07','西西雅图高桥',1.4,7.1,'断裂 / 禁行'),('B08','西西雅图低桥',1.5,7.5,'清障后汽车'),('B09','I-90浮桥',7.55,4.7,'边界封锁'),('B10','520浮桥',7.55,1.5,'涉水止于边界')]
special=[('SR-99隧道',[(3.1,2.9),(2.95,4.1),(2.95,5.9),(3.3,6.9)]),('轻轨',[(5.8,2.7),(5.8,3.8),(4.2,4.7),(3.6,5.6)]),('单轨',[(2.5,3.5),(3.5,3.8),(3.5,4.5)]),('地下城',[(2.2,5.4),(2.8,5.4),(2.8,5.9),(3.5,5.7)]),('货运铁路',[(1.5,1.5),(1.55,2.7),(1.55,3.7),(1.75,5.7),(3.5,6.8)])]
def wet(x,y):
    inside=False
    for poly in waters:
        hit=False;j=len(poly)-1
        for i,(a,b) in enumerate(poly):
            c,d=poly[j]
            if (b>y)!=(d>y) and x<(c-a)*(y-b)/(d-b)+a:hit=not hit
            j=i
        inside|=hit
    return inside
def near_t1(x,y,dist=.6):return any(math.dist((x,y),(p[2],p[3]))<dist for p in poi[:4])
random.seed(19)
def scatter(n,kind,dist):
    arr=[]
    for _ in range(20000):
        x,y=random.uniform(.35,6.95),random.uniform(.15,7.85)
        if wet(x,y) or near_t1(x,y,dist):continue
        if any(math.dist((x,y),(p[2],p[3]))<.6 for p in camps):continue
        if any(math.dist((x,y),(a['x'],a['y']))<.24 for a in arr):continue
        arr.append({'id':f'{kind}-{len(arr)+1:02}','x':round(x,3),'y':round(y,3)})
        if len(arr)==n:return arr
    raise RuntimeError('scatter failed')
c2=scatter(12,'C2',1);c3=scatter(60,'C3',1)
# T3 is a service cluster: food + clinic + parts in one compound, avoiding the 30–50 count conflict.
t3=[]
for row in range(8):
    for col in range(7):
        for dx,dy in [( .7,.25),(.25,.25),(.8,.75),(.25,.8)]:
            x,y=col+dx,row+dy
            if not wet(x,y) and not near_t1(x,y,.55):
                t3.append({'id':f'T3-{len(t3)+1:02}','x':x,'y':y,'cell':f'{chr(65+col)}{row+1}','services':['食物','医疗','零件']});break
t4=scatter(240,'T4',.18)
spawn=[('S1',2.65,.2),('S2',.4,7.75),('S3',6.2,7.8)]

def mapplate(key,title,mode='all',bounds=(0,0,8,8)):
    p=Plate(key,title,'4096 × 4096 m  /  8 × 8 Cells  /  1 Cell = 512 m  /  水系与地标遵循工程规范，线形与精确落点为提案')
    x0,y0,x1,y1=bounds;s=min(1080/(x1-x0),1080/(y1-y0));ox=100;oy=210+(1080-(y1-y0)*s)/2
    xy=lambda x,y:(ox+(x-x0)*s,oy+(y-y0)*s)
    # draw full map into temporary canvas then clip to viewport for regional maps
    start=len(p.svg);oldim=p.im.copy()
    p.rect(*xy(0,0),8*s,8*s,C['land'])
    if mode=='risk':
        for r in range(8):
            for c in range(8):
                d=min(math.dist((c+.5,r+.5),(a[2],a[3])) for a in poi[:4]);col='#69443c' if d<1.2 else '#514c3c' if d<2.3 else '#394b43'
                p.rect(*xy(c,r),s,s,col)
    for a,b,r in [(2.5,2.1,.7),(5.7,3.1,.7),(5.5,4.5,.6),(5.6,6.6,.6)]:
        for rr in [r,r*.7,r*.4]:
            # contour rings, no opaque land over water
            pts=[xy(a+rr*math.cos(t*math.pi/30),b+rr*.65*math.sin(t*math.pi/30)) for t in range(61)];p.line(pts,'#596251',1)
    for poly in waters:p.poly([xy(*v) for v in poly],C['water'])
    for kind,name,pts in roads:p.line([xy(*v) for v in pts],C['road'],7 if kind=='L1' else 4)
    if mode in ('all','roads','camp'):
        for r in range(8):
            for c in range(7):
                pts=[(c+.2,r+.65),(c+.65,r+.65),(c+.8,r+.8)]
                if all(not wet(*v) and not near_t1(*v,.62) for v in pts):p.line([xy(*v) for v in pts],'#748680',2)
    if mode in ('layers','roads'):
        for name,pts in special:p.line([xy(*v) for v in pts],C['purple'] if name!='单轨' else C['yellow'],4,True)
        for b in bridges:
            xx,yy=xy(b[2],b[3]);p.circle(xx,yy,13,C['bg'],C['yellow']);p.text(xx+15,yy-26,b[0],17,C['yellow'])
        p.line([xy(.3,4.5),xy(.5,2.5),xy(.5,.92),xy(4.5,.92),xy(4.5,1.8)],'#79a9bf',3,True)
    if mode in ('all','camp'):
        for arr,col,r in [(t4,'#64776c',1),(c3,C['green'],3),(c2,C['green'],6),(t3,C['yellow'],4)]:
            for a in arr:p.circle(*xy(a['x'],a['y']),r,col)
    for i in range(9):
        p.line([xy(i,0),xy(i,8)],'#62736a',1);p.line([xy(0,i),xy(8,i)],'#62736a',1)
    for r in range(8):
        for c in range(8):p.text(*xy(c+.05,r+.06),f'{chr(65+c)}{r+1} {names[r][c]}',max(12,min(23,int(s/9))),C['muted'])
    for a in poi:
        x,y=xy(a[2],a[3]);col=C['red'] if a[0].startswith('T1') else C['orange']
        if a[0].startswith('T1'):
            rad=.49*s;p.line([(x-rad,y-rad),(x+rad,y-rad),(x+rad,y+rad),(x-rad,y+rad),(x-rad,y-rad)],col,2,True)
        p.rect(x-8,y-8,16,16,col);p.text(x+13,y+5,a[0],17,col)
    for a in camps:
        x,y=xy(a[2],a[3]);p.poly([(x,y-13),(x-12,y+10),(x+12,y+10)],C['green']);p.text(x+15,y-18,a[0],17,C['green'])
    for a,x,y in nodes:
        xx,yy=xy(x,y);p.circle(xx,yy,5,C['purple'])
        if mode=='camp':p.text(xx+9,yy-15,a,16,C['purple'])
    for x,y in [(.45,4.65),(1.5,5.5)]:p.circle(*xy(x,y),10,C['white'],C['bg'])
    if mode in ('risk','camp'):
        for name,x,y in spawn:
            xx,yy=xy(x,y);p.circle(xx,yy,14,C['bg'],C['white']);p.text(xx-10,yy-12,name,16)
    if mode=='risk':
        for pts in [[(2.5,3.5),(3.6,3.1),(4.7,3.1),(4.7,5.8)],[(2.5,6.5),(1.8,6.2),(1.35,5.6),(1.15,4.9)],[(5.5,4.5),(5.7,5.3),(4.9,5.7),(4.7,7.5)]]:p.arrow([xy(*v) for v in pts],C['red'],5)
        p.line([xy(1.2,4.1),xy(1.15,5.8),xy(.6,6.6),xy(1.8,6.9)],'#6ca4b3',14,True)
    # clipping preserves headers and side notes on all sheets
    box=(int(ox),int(oy),int(ox+(x1-x0)*s),int(oy+(y1-y0)*s));crop=p.im.crop(box);p.im=oldim;p.im.paste(crop,box);p.d=ImageDraw.Draw(p.im)
    items=p.svg[start:];p.svg=p.svg[:start]+[f'<defs><clipPath id="map"><rect x="{box[0]}" y="{box[1]}" width="{box[2]-box[0]}" height="{box[3]-box[1]}"/></clipPath></defs><g clip-path="url(#map)">']+items+['</g>']
    p.rect(box[0],box[1],box[2]-box[0],box[3]-box[1],None,C['grid'],2)
    p.text(1135,181,'N ↑',20);p.line([(105,1315),(105+s,1315)],C['white'],4);p.text(105,1285,'512 m',18)
    if bounds!=(0,0,8,8):
        relevant=[f'{a[0]} {a[1]}' for a in poi+camps if x0<=a[2]<x1 and y0<=a[3]<y1]
        p.notes([('分区覆盖',[f'{chr(65+x0)}{y0+1}—{chr(64+x1)}{y1}',f'{(x1-x0)*512} × {(y1-y0)*512} m','与总图使用同一份坐标数据']),('核心目的地',relevant or ['边界 / 水域 / 住宅缓冲']),('街区设计读法',['黄点：T3 三功能补给组团','小绿点：C3 散人地块','大绿点：C2 小队据点','红虚框：T1 250m 核心禁车区','细灰线：L3 走向示意','内部房间详见后续专项图']),('落地前需验证',['坡度、路障净宽、潮汐水位','车道与步行入口连续性','营地 300m 服务覆盖','此图未替代 NavMesh 验证'])])
    else:
        blocks={
        'all':[('主地图图例',['红方块 T1 地标 / 4（含可选）','橙方块 T2 专业补给 / 9','绿三角 C1 要塞 / 5','绿点 C2 / 12，C3 / 60','黄点 T3 综合服务组团','细点 T4 探索引导 / 240','紫点 N 控制节点 / 6','白圆 中立货轮 / 渡轮码头']),('地理骨架',['西：埃利奥特湾 / 港口','北：船运运河与营地带','中北：联合湖 / 蒙特雷克水道','东：华盛顿湖 / 未来扩展口','南：杜瓦米什 / 西西雅图']),('读图说明',['全图北上；每格 512m','主路为走廊，不是最终碰撞线','T1-04 波音机场为可选内容','本册所有小图可单独下载 SVG'])],
        'roads':[('路网与交通',['粗灰 L1：I-5 / SR-99 / I-90','中灰 L2：主干连接与营地车道','细灰 L3：摩托通道走向','黄虚线：单轨高架步行线','紫虚线：地下 / 铁路特殊线','蓝虚线：可选船行航道']),('桥梁索引',[f'{b[0]} {b[1]}：{b[4]}' for b in bridges]),('交通修订提案',['B04 下层固定通车','B01 / B06 至少一座保持降下','联锁只保几何通路，不取消 PvP','B08 清障不计入南北保底'])],
        'risk':[('风险等级',['暗绿 1–2：外围与北岸','褐色 3：中心城区 / T2 外围','红褐 4：T1 缓冲区','红方块 5：核心巢穴','白圆 0：中立交易区','营地仅在占领后降为 0']),('动态事件',['红箭头：尸潮迁徙设计走廊','蓝虚带：潮汐淹没敏感岸线','球场停机坪：空投','桥梁升起可切断尸潮','雨天噪声半径 ×0.6']),('出生点修订',['S1 巴拉德北缘','S2 西西雅图西南缘','S3 灯塔山南部东缘','距 T1 中心均 ≥1024m','中央区保留 C3，取消出生点','是否按核心边界计距须确认'])],
        'camp':[('营地与资源',['C1-01 煤气厂：燃料','C1-02 华大红场：知识','C1-03 劳顿堡：海岸高地','C1-04 巴拉德：水路','C1-05 水塔：净水','C2 12 个 / C3 60 个示意落点']),('控制节点',['N-01 弗里蒙特开合桥','N-02 巴拉德开合桥','N-03 蒙特雷克开合桥','N-04 志愿者水塔泵站','N-05 安妮女王山电台','N-06 SODO 变电站']),('营地统一要求',['C1 150×150m / C2 60×60m','C3 25×25m；两条退出路径','车道接 L2；步行补给线接 T2','车库：C1 ≥4位 / C2 ≥2位','营地细线接口在详图定义','未占领灰绿，占领显示旗色'])],
        'layers':[('高度层 / 通道',['Z-2 紫虚线：地下城 / 隧道','Z-1：各 POI 地下储藏层','Z0：地面主路与室外院落','Z2 黄虚线：单轨高架步道','Z1+：屋顶 / 栈桥 / 楼层']),('五条特殊路线',[x[0] for x in special]),('跨层规则',['交叉不等于连接','只在明确楼梯 / 匝道处换层','地下层独立寻路与剖切显示','I-5 下层桥与上层断面分开','货运铁路不视为汽车道路','船行需通过巴拉德船闸']),('方案边界',['图为相对方位与拓扑设计','隧道纵坡 / 埋深留待白盒','屋顶搭板须验证跳距与落点'])]}
        p.notes(blocks[mode])
    p.save()

for args in [('00','全城战略布局','all'),('01','道路等级与桥梁通行','roads'),('02','风险梯度 / 尸潮 / 潮汐','risk'),('03','营地网络与控制节点','camp'),('04','地下—地面—高架分层','layers')]:mapplate(*args)
for i,(b,title) in enumerate([((0,0,4,2),'西北 / 巴拉德—因特湾'),((4,0,8,2),'东北 / 联合湖—华大'),((0,2,4,4),'中西 / 女王山—太空针'),((4,2,8,4),'中东 / 国会山—中央区'),((0,4,4,6),'滨海 / 市场—地下城'),((4,4,8,6),'第一山 / 医院—互通'),((0,6,4,8),'西南 / 港口—球场'),((4,6,8,8),'东南 / 灯塔山—封锁线')]):mapplate(f'{i+6:02}',title,'all',b)

# Each local plan uses metres via normalized site coordinates. Rectangles are occupiable
# design envelopes; door gaps and routes are separately drawn, never claimed as collision.
designs=[
('T1-01','太空针塔 · 军方隔离区',500,'C4','狙击武器 / 无线电 / 高级瞄具',
 [('隔离检疫',12,17,24,18),('军械仓',64,17,23,18),('塔基大厅',40,40,22,24),('营房',14,64,22,19),('通信中心',65,64,22,19),('发电机',66,42,18,13)],
 [(0,48),(28,48),(40,52),(61,52),(93,52),(100,52)],[(51,52),(51,30),(75,30),(75,0)],
 ['Z-1 维修库 → 电梯井','Z0 双门塔基 / 军方检疫','Z1 通信平台 / 侧翼观察','Zn 观景台：稀有物资','应急楼梯独立于电梯供电'],['N-06 区域供电 → 本地发电机','电梯失电可走 800+ 级楼梯','高架单轨接 D5；只能步行']),
('T1-02','港湾医疗中心 · 第一山',500,'F5','高级药品 / 手术工具 / 血包',
 [('急诊分诊',12,40,24,22),('手术部',40,16,26,20),('住院翼 A',12,15,23,20),('隔离病房',65,43,23,26),('药剂库',42,67,21,18),('住院翼 B',12,70,23,17),('后勤机房',70,16,18,20)],
 [(0,51),(36,51),(52,51),(52,67),(65,76),(95,76),(100,76)],[(52,51),(52,39),(77,39),(94,39),(100,39)],
 ['Z-1 后勤 / 药库回收口','Z0 急诊—内院—诊疗连廊','Z1 手术区 / 住院翼','Z2 隔离层：最深奖励','楼梯 A/B 分置两端'],['窗间冷光引导主走廊','隔离层门禁需备用电源','暗病房近战；湿区绕开配电室']),
('T1-03','流明球场 · 联邦撤离营',500,'C7','重火力 / 防弹装备 / 车辆蓝图',
 [('西侧看台',14,24,17,48),('东侧看台',72,24,16,48),('北侧看台',33,16,37,14),('南侧看台',33,73,37,14),('难民帐篷区',35,35,30,22),('军械指挥',37,60,27,11)],
 [(0,52),(31,52),(33,68),(67,68),(70,52),(100,52)],[(50,68),(50,88),(75,91),(100,91)],
 ['Z-1 后勤环廊 / 备用出口','Z0 球场：最大尸潮集群','Z1 看台环廊 / 狙击角','Z2 指挥台 / 停机坪','空投只在事件开放屋顶'],['看台环线与球场路线互通','尸潮巢穴设在场心帐篷','车辆蓝图位于指挥台深处']),
('T1-04','波音机场 · 可选地图扩展',500,'D8','航空燃料 / 军用载具零件',
 [('机库 A',12,15,26,23),('机库 B',65,15,23,23),('航站控制',12,67,26,20),('燃料库',67,69,21,18),('跑道 / 残机',13,44,74,17)],
 [(0,55),(10,55),(45,55),(60,55),(91,55),(100,55)],[(45,55),(45,25),(64,25),(64,0)],
 ['Z-1 油库检修坑','Z0 跑道 / 机库 / 停机坪','Z1 机库维修栈桥','Z2 塔台观察点','南端坍塌高架为硬边界'],['提案：T1 核心仍统一禁车','外围停机坪保留载具交火','若恢复跑道车战需单独改规则']),
('T2-01','西雅图港 · 港岛与集装箱',300,'A7—B7','机械师：发动机 / 焊接 / 燃料',
 [('西堆场',12,20,22,20),('北堆场',40,15,20,26),('东堆场',68,20,20,26),('零件仓',15,65,25,22),('维修工棚',68,63,22,22),('可移吊车',44,50,18,12)],
 [(0,53),(35,53),(35,45),(63,45),(63,75),(100,75)],[(35,53),(35,92),(70,92),(100,92)],
 ['Z0 集装箱夹道 / 干岸','Z1 吊车检修桥 / 箱顶','吊车移动只改变局部通路','低洼货道涨潮后不可步行'],['双地块合计 2×300m 原型','港岛与陆侧以低位栈桥衔接','干岸应有不依赖吊车的撤离线']),
('T2-02','水族馆 · 半淹没探索',240,'B5','潜行者：潜水装备 / 鱼叉 / 保险柜',
 [('售票大厅',12,42,22,25),('主展缸',41,25,28,35),('设备间',13,15,22,18),('深水展廊',44,70,28,18),('保管库',75,18,16,19),('后勤',76,65,15,20)],
 [(0,54),(34,54),(36,38),(72,38),(94,38),(100,38)],[(36,54),(36,79),(72,79),(94,79),(100,79)],
 ['Z-1 水下维护道 → 保险柜','Z0 售票厅与干燥展台','Z1 检修栈桥 / 高水位退路','涨潮不淹没所有退出路线'],['蓝带深水需潜水装备','浅水减速 / 枪械受潮','深水捷径收益高；干路更绕']),
('T2-03','派克市场 · 下沉式迷宫',240,'C5','生存者：食物 / 种子 / 烹饪',
 [('鲜食摊列',12,18,24,20),('香料摊列',43,18,18,20),('餐馆',70,18,19,20),('冷库',12,69,24,18),('种子商店',44,66,20,22),('杂货铺',72,65,17,22)],
 [(0,49),(38,49),(38,60),(67,60),(67,48),(100,48)],[(38,49),(38,90),(10,90),(0,90)],
 ['Z-2 货运旧廊接地下城支线','Z-1 下层市场 / 冷库','Z0 街面入口 / 主摊道','Z1 屋顶菜圃与维修走道'],['全区禁止车辆进入','靠海楼梯接水族馆方向','两条反向楼梯防止纵深死局']),
('T2-04','市中心 · 摩天楼立体群',300,'D5','侦察兵：电子 / 望远镜 / 绳索',
 [('A塔 / 办公',12,18,25,28),('B塔 / 倾斜楼',63,18,25,28),('C塔 / 商业',12,64,25,24),('D塔 / 数据',63,64,25,24),('坍塌庭院',43,44,15,17)],
 [(0,55),(39,55),(39,32),(60,32),(60,55),(100,55)],[(39,55),(39,77),(60,77),(60,97),(100,97)],
 ['Z0 断裂街道 / 双侧大堂','Z1 商业夹层 / 消防楼梯','Z4 A↔B 搭板 / 风险暴露','Z6 B↔D 钢梁 / 稀有设备','落点需栏杆与回收楼梯'],['搭板为 L5 步行；不可骑行','电梯故障时两栋楼仍可撤离','远端屋顶指向太空针地标']),
('T2-05','先锋广场 · 黑暗地下城',260,'C6','拾荒者：钥匙 / 古董 / 暗道图',
 [('旧旅馆',12,17,22,25),('旧商店',40,17,22,25),('档案库',70,17,18,25),('塌方区',15,65,20,22),('地下酒馆',43,65,21,22),('钥匙库',73,65,16,22)],
 [(0,52),(38,52),(67,52),(100,52)],[(38,52),(38,92),(91,92),(91,100)],
 ['本图平面为 Z-2 旧城街网','Z0 先锋广场入口 A/B','Z-1 旧门廊 / 下行楼梯','南端竖井通国际区边缘'],['黑暗主干加多条短回路','钥匙库不能藏在唯一出口后','塌方仅封支路，不封主退路']),
('T2-06','球体温室 · 植物迷宫',220,'D3','药剂师 / 农夫：草药 / 稀有种子',
 [('温室 A / 蕨类',13,20,30,27),('温室 B / 树冠',51,20,34,27),('育苗库',17,66,24,21),('种子库',65,67,22,21),('水泵房',45,60,14,17)],
 [(0,53),(45,53),(45,31),(48,31),(48,53),(100,53)],[(45,53),(45,90),(88,90),(100,90)],
 ['Z-1 储水 / 育苗设备','Z0 双球体植物丛林','Z1 环形养护桥','Z2 树冠观察台 / 稀有种子'],['草丛遮挡以短视距制造风险','养护桥提供高位确认路径','高处战利品可从不同球体回撤']),
('T2-07','因特湾铁路场 · 工程资源',280,'B2','工程师：钢材 / 建材 / 营地蓝图',
 [('编组线 A',14,15,13,60),('编组线 B',36,15,13,60),('编组线 C',58,15,13,60),('材料仓',77,16,13,24),('调度室',76,65,14,22)],
 [(0,84),(30,84),(30,48),(53,48),(53,84),(100,84)],[(53,48),(74,48),(74,6),(100,6)],
 ['Z0 列车 / 钢材 / 可推动轨车','Z1 调度桥 / 检修平台','Z-1 工具窖 / 地下管线','西端接沿海货运铁路'],['车厢断口形成横向换线点','轨车机关只影响奖励支路','蓝图在调度室；侧门防蹲守']),
('T2-08','华大实验楼 · 门禁研究',240,'G1外围','研究员：化学品 / 电子 / 蓝图',
 [('接待门禁',12,40,22,25),('试剂室',14,16,21,18),('教学实验',43,16,22,20),('高安实验',72,18,17,22),('洁净室',44,67,23,20),('废料回收',73,67,16,20)],
 [(0,53),(35,53),(68,53),(94,53),(100,53)],[(35,53),(35,93),(69,93),(100,93)],
 ['Z-1 危废储存 / 备用电源','Z0 接待与普通教学实验','Z1 高安实验 / 门卡奖励','Z2 屋顶通风检修出口'],['先教学区找门卡，再入高安区','破门替代路线引发警报','与红场营地间设置缓冲院落']),
('T2-09','SODO 仓储超市 · 批量搬运',280,'D7','囤积者：基础物资 / 背包 / 容器',
 [('食品货架',14,17,15,48),('日杂货架',38,17,15,48),('工具货架',62,17,15,48),('装卸月台',15,75,49,13),('办公仓管',80,17,12,25)],
 [(0,70),(32,70),(32,43),(56,43),(56,70),(100,70)],[(56,70),(78,70),(78,7),(100,7)],
 ['Z0 货架迷宫 / 装卸区','Z1 仓管办公室 / 防损走道','Z-1 冷藏储备室','叉车仅在平整装卸环线运行'],['外围停车，内部搬运强调负重','叉车噪声引尸；手推车更安静','N-06 配电站位于仓区外侧'])]

for cid,name,x,y in camps:
    ident=int(cid[-2:]);anchors=['裂解塔 / 钢架','图书馆 / 钟楼','老军营 / 炮台','船闸控制塔','砖水塔 / 温室'];resource=['地下燃料罐','研究工作台','海岸瞭望台','船闸码头','净水泵房'];target=['T2-06 球体温室','T2-08 华大实验楼','T2-07 铁路场','T2-07 铁路场','T2-08 华大实验楼']
    designs.append((cid,name+' · 要塞营地',150,f'{chr(65+int(x))}{int(y)+1}',resource[ident-1],[(anchors[ident-1],38,17,28,27),('宿舍',12,18,20,25),('四车位车库',12,64,27,22),('加工 / 农圃',47,66,20,21),(resource[ident-1],74,21,16,26),('储藏入口',75,67,15,18)],[(0,53),(40,53),(70,53),(100,53)],[(51,53),(51,92),(100,92)],['Z-1 加固储藏室 / 紧急出口','Z0 150×150m 建造边界','Z1 锚点观察位 / 防守平台','车库净宽 >3.5m / 4车位'],['车道接最近 L2，接驳 ≤200m','步行 / 摩托补给线 → '+target[ident-1],'未占领丧尸 1–3；清场后占领']))

def detail(d):
    ident,title,size,cell,reward,rooms,main,alt,levels,mechanics=d
    key=ident;p=Plate(key,title,f'{ident}  /  {cell}  /  设计包络 {size} × {size} m  /  {reward}')
    ox,oy,s=110,235,10.5;xy=lambda x,y:(ox+x*s,oy+y*s)
    p.rect(ox,oy,1050,1050,'#2c3d37',C['grid'],2)
    for i in range(0,101,10):p.line([xy(i,0),xy(i,100)],'#40524a',1);p.line([xy(0,i),xy(100,i)],'#40524a',1)
    # circulation background
    p.line([xy(*v) for v in main],'#6c776b',30);p.line([xy(*v) for v in alt],'#53675a',20)
    if ident=='T2-02':p.rect(*xy(40,63),52*s,29*s,C['water']);p.line([xy(36,79),xy(72,79),xy(94,79)],'#709bad',30)
    if ident=='T2-01':p.rect(*xy(7,89),86*s,8*s,C['water'])
    if ident=='C1-04':
        p.rect(*xy(7,39),86*s,26*s,C['water'])
        p.line([xy(6,48),xy(94,48)],'#86998c',25)
        p.line([xy(6,60),xy(94,60)],'#86998c',18)
    if ident=='C1-03':p.rect(*xy(0,0),5*s,100*s,C['water'])
    if ident=='T1-03':p.rect(*xy(33,32),36*s,39*s,'#4a5140')
    if ident=='T1-04':
        p.rect(*xy(5,43),90*s,18*s,'#586158');p.line([xy(8,52),xy(90,52)],C['white'],2,True)
    for i,(name,x,y,w,h) in enumerate(rooms):
        p.rect(*xy(x,y),w*s,h*s,'#526052',C['muted'],2)
        xx,yy=xy(x+1,y+1);p.text(xx,yy,f'{i+1:02}',18,C['yellow'])
        maxchars=max(3,int(w*s/22));lines=[name[z:z+maxchars] for z in range(0,len(name),maxchars)]
        for j,t in enumerate(lines):p.text(xx,yy+30+j*28,t,21)
        p.text(xx,yy+h*s-35,f'{round(w*size/100)}×{round(h*size/100)}m',14,C['muted'])
        # open doorway on lower facade (conceptual threshold)
        cx,cy=xy(x+w*.5,y+h);p.line([(cx-13,cy),(cx+13,cy)],C['yellow'],5)
        # connect entrance to nearest point on primary or alternate route, explicitly schematic
        candidates=main+alt;dest=min(candidates,key=lambda a:math.dist((x+w*.5,y+h),a));p.line([(cx,cy),xy(*dest)],'#9aa788',2,True)
    p.arrow([xy(*v) for v in main],C['yellow'],5);p.arrow([xy(*v) for v in alt],C['green'],4,True)
    for label,pt,col in [('A',main[0],C['yellow']),('B',main[-1],C['yellow']),('C',alt[-1],C['green'])]:
        xx,yy=xy(*pt);p.circle(xx,yy,18,C['bg'],col);p.text(xx-7,yy-14,label,21,col)
    if ident.startswith('T1'):
        for q in [9,91]:p.line([xy(q,7),xy(q,93)],C['red'],5,True)
        p.text(*xy(3,3),'禁车核心 / 外圈防线见总图',18,C['red']);p.text(*xy(2,94),'P-A ← 外围停车缓冲点',17,C['yellow']);p.text(*xy(68,94),'外围停车 P-B →',17,C['yellow'])
    elif ident.startswith('C1'):
        p.line([xy(5,8),xy(95,8),xy(95,92),xy(5,92),xy(5,8)],C['green'],3,True)
        garage=next(r for r in rooms if '车库' in r[0]);_,gx,gy,gw,gh=garage
        for i in range(4):p.rect(*xy(gx+1+i*gw/4,gy+gh-10),gw*s/4-10,8*s,None,C['yellow'],2)
    else:p.text(*xy(1,94),'P-A 外围停车 / 核心步行',18,C['yellow'])
    p.text(1100,199,'N ↑',20);p.line([(110,1320),(320,1320)],C['white'],4);p.text(110,1290,f'{size//5} m  /  网格 {size//10}m',18)
    p.notes([('路线与入口',['A 主入口 / 黄色主探索线','B 主撤离口 / C 侧向撤离','绿虚线：备用通路','细虚线：房间接入意向','黄门槛：需在白盒开门洞','矩形是空间包络，非施工墙线']),('楼层与奖励纵深',levels),('独特机制',mechanics),('尺度与验收',['标注尺寸为建议包络尺寸','外部车路与防线不在室内层','门洞 / 台阶 / 高差待白盒验证','两条退出路径须做寻路复核'])]);p.save()

# C1 shared requirements, but distinct spatial organizations around each anchor.
camp_variants={
 'C1-01':([('裂解塔 / 观察位',40,18,24,24),('旧厂房宿舍',12,17,20,26),('四车位车库',12,64,27,22),('改装车间',48,68,20,20),('残余储罐',73,18,16,25),('加固储藏室',74,67,17,19)],[(0,53),(40,53),(69,53),(100,53)],[(51,53),(51,93),(100,93)]),
 'C1-02':([('图书馆 / 研究',17,16,53,20),('钟楼观察位',77,16,14,24),('学生宿舍',15,67,22,20),('四车位车库',48,67,27,20),('阅览中庭',42,43,26,15),('地下书库入口',80,65,13,21)],[(0,53),(37,53),(37,61),(74,61),(100,61)],[(37,53),(37,40),(95,40),(100,40)]),
 'C1-03':([('海岸炮台',8,14,18,25),('老军营',39,16,24,25),('高地瞭望台',74,15,17,20),('四车位车库',64,67,27,20),('军需储藏',38,67,18,20),('山坡菜圃',10,65,20,22)],[(100,53),(65,53),(32,53),(0,53)],[(65,53),(65,91),(25,91),(0,91)]),
 'C1-04':([('船闸控制塔',39,15,23,20),('水岸宿舍',12,16,19,22),('四车位车库',65,15,27,22),('船坞修理棚',14,66,23,20),('净水 / 鱼获',67,65,23,20),('防水储藏',42,66,19,20)],[(0,48),(38,48),(65,48),(100,48)],[(38,48),(38,60),(92,60),(100,60)]),
 'C1-05':([('砖水塔观察位',40,19,23,23),('净水泵房',72,18,18,24),('玻璃温室',12,16,20,28),('四车位车库',12,67,27,20),('医疗宿舍',47,67,20,21),('种子储藏',74,67,17,20)],[(0,54),(36,54),(69,54),(100,54)],[(51,54),(51,45),(95,45),(100,45)])}
for index,d in enumerate(designs):
    if d[0] in camp_variants:
        rooms,main,alt=camp_variants[d[0]];d=(*d[:5],rooms,main,alt,*d[8:]);designs[index]=d
    detail(d)

p=Plate('05','十座桥梁 · 状态与通行布局','桥位见图 01  /  本页为拓扑剖解，不按地理比例  /  各桥控制与桥面碰撞必须一致')
for i,b in enumerate(bridges):
    col=i%2;row=i//2;x=80+col*845;y=210+row*216
    p.text(x,y,f'{b[0]}  {b[1]}',24,C['green']);p.text(x+315,y,b[4],21,C['yellow'])
    p.rect(x,y+46,740,118,'#33433e');p.rect(x+280,y+46,155,118,C['water'])
    p.line([(x+30,y+105),(x+710,y+105)],C['road'],14)
    if b[0] in ['B07','B09']:p.line([(x+340,y+75),(x+380,y+135)],C['red'],6);p.line([(x+380,y+75),(x+340,y+135)],C['red'],6)
    elif b[0] in ['B03','B05','B10']:p.line([(x+295,y+105),(x+420,y+105)],C['yellow'],4,True)
    elif b[0] in ['B01','B02','B06']:p.rect(x+240,y+58,28,28,C['purple']);p.text(x+35,y+60,'控制室 → 桥面',16)
    elif b[0]=='B08':p.rect(x+340,y+90,30,30,C['orange']);p.text(x+35,y+60,'可清理路障',16)
    else:p.text(x+35,y+60,'下层通车 / 上层断裂',16)
p.save()

p=Plate('32','T3 / T4 与 C2 / C3 · 通用地块库','街区级原型  /  具体落点见总图与八张分区图  /  每个原型均保留两条退出路径')
tiles=[('T3 综合服务组团 · 80×80m',['食品店','诊所','汽修 / 零件','后院装卸']),('C2 小队据点 · 60×60m',['不可毁锚点','宿舍','双车位车库','地下储藏']),('C3 散人地块 · 25×25m',['居住空间','工作台','储藏间','后门菜圃']),('T4 面包屑探索 · 40×40m',['遗弃车辆','尸体 / 纸条','路边箱','步行岔路'])]
for i,(title,labels) in enumerate(tiles):
    x=80+(i%2)*845;y=220+(i//2)*530;p.text(x,y,title,27,C['green']);p.rect(x,y+55,740,390,'#33433e',C['grid'],2)
    for j,label in enumerate(labels):
        xx=x+50+(j%2)*370;yy=y+85+(j//2)*210;p.rect(xx,yy,270,110,'#536053',C['muted'],2);p.text(xx+20,yy+35,label,24)
    p.arrow([(x,y+260),(x+740,y+260)],C['yellow'],5);p.arrow([(x+350,y+260),(x+350,y+445)],C['green'],4,True)
    p.text(x,y+460,'A 车行接入 → 主院 / B 后门步行出口 → 补给小路',19)
p.save()

data={'version':'1.0-design-proposal','worldSizeM':4096,'cellSizeM':512,'coordinateSystem':'X east,Y south; coordinates in cells, multiply by 512 for metres','cells':names,'waterPolygons':waters,'roads':[{'grade':a,'name':b,'points':c} for a,b,c in roads],'poi':[{'id':a,'name':b,'x':x,'y':y} for a,b,x,y in poi],'c1':[{'id':a,'name':b,'x':x,'y':y} for a,b,x,y in camps],'c2':c2,'c3':c3,'t3':t3,'t4':t4,'nodes':[{'id':a,'x':x,'y':y} for a,x,y in nodes],'bridges':[{'id':a,'name':b,'x':x,'y':y,'state':st} for a,b,x,y,st in bridges],'specialRoutes':[{'name':a,'points':b} for a,b in special],'spawnPoints':[{'id':a,'x':x,'y':y} for a,x,y in spawn],'localLayouts':[{'id':d[0],'title':d[1],'sizeM':d[2],'cell':d[3],'rooms':[{'name':n,'x':x*d[2]/100,'y':y*d[2]/100,'w':w*d[2]/100,'h':h*d[2]/100} for n,x,y,w,h in d[5]],'primaryRouteNormalized':d[6],'secondaryRouteNormalized':d[7],'floors':d[8],'mechanics':d[9]} for d in designs]}
(ROOT/'map-layout.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
sheets.sort(key=lambda a:a['id']);(ROOT/'manifest.json').write_text(json.dumps(sheets,ensure_ascii=False,indent=2),encoding='utf8')
cards=''.join(f'<article data-title="{s["title"]}"><a href="{s["svg"]}" target="_blank"><img loading="lazy" src="plates/{s["id"]}.webp" alt="{s["title"]}"></a><h2>{s["id"]} · {s["title"]}</h2><a href="{s["png"]}" download>PNG 高清图</a> <a href="{s["svg"]}" target="_blank">SVG 无限放大</a></article>' for s in sheets)
(ROOT/'index.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>The Last Rule · 全地图设计图册</title><style>body{margin:0;background:#152124;color:#e0e6dc;font:16px/1.7 "Microsoft YaHei",sans-serif}header,main{max-width:1480px;margin:auto;padding:32px}header{border-bottom:1px solid #52645c}h1{font-size:38px;margin:10px 0}p{max-width:1000px;color:#b2c1b7}.tag{color:#b5c59b;letter-spacing:3px}a{color:#e1c776;margin-right:20px}input{padding:14px;background:#263a34;color:#fff;border:1px solid #647671;font:inherit;width:min(480px,90%)}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:24px}article{background:#22312e;border:1px solid #41564d;padding:12px}article img{width:100%}h2{font-size:19px}article[hidden]{display:none}</style><header><div class="tag">THE LAST RULE / SEATTLE / DESIGN ATLAS 1.0</div><h1>全部地图布局设计图</h1><p>33 张图：5 张全城专项图、10 桥状态图、8 张分区图、4 张 T1（含可选机场）、9 张 T2、5 张 C1、1 张通用地块库。覆盖全部 64 区格。点击缩略图打开可无限放大的 SVG；PNG 可直接保存。</p><p>本册基于工程《西雅图地图设计规范》。精确位置、房间包络与路线为新增设计提案，尚未通过白盒碰撞与通行验证。布局图与世界美术分离，不代表全城 3D 已实现。</p><p><a href="DESIGN-NOTES.txt">设计说明 / 冲突修订 / 验证边界</a><a href="map-layout.json">布局源数据 JSON</a><a href="validation.json">结构校验报告</a></p><input id="search" aria-label="搜索图纸" placeholder="搜索：医院、T1、桥梁、营地…"></header><main>'''+cards+'''</main><script>document.querySelector('#search').addEventListener('input',e=>document.querySelectorAll('article').forEach(a=>a.hidden=!a.textContent.toLowerCase().includes(e.target.value.toLowerCase())));</script></html>''',encoding='utf8')

# Only checks supported by this data are claimed; connectivity is not inferred from ink.
checks={'sheetCount':len(sheets),'coveredCells':64,'t1':4,'t2':9,'c1':5,'c2':len(c2),'c3':len(c3),'t3ServiceClusters':len(t3),'t4':len(t4),'bridges':10,'nodes':6,'c1MinPairDistanceM':round(min(math.dist(a[2:],b[2:])*512 for i,a in enumerate(camps) for b in camps[i+1:])), 'c1MinT1CenterDistanceM':round(min(math.dist(a[2:],b[2:])*512 for a in camps for b in poi[:4])), 'spawnMinT1CenterDistanceM':round(min(math.dist(a[1:],b[2:])*512 for a in spawn for b in poi[:4])),'notValidated':['car / motorcycle connectivity','300m service coverage for every camp','door gaps and collision','road-water intersections except designed bridges','T1 full vehicle exclusion buffer','walk and drive travel times','tide and bridge dynamic states']}
assert len(sheets)==33
assert checks['c1MinPairDistanceM']>=768
assert checks['c1MinT1CenterDistanceM']>=512
assert checks['spawnMinT1CenterDistanceM']>=1024
(ROOT/'validation.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf8')
(ROOT/'DESIGN-NOTES.txt').write_text(f'''THE LAST RULE 全地图布局设计图册 v1.0
日期：2026-11-19

依据：docs/西雅图地图设计规范.md（全部章节）、docs/制作工序.md（P1 与 P2）、docs/视觉目标.md。
范围：一张 4096m 主地图，不存在已定义的多城市地图。33 张图覆盖 64 Cells；机场按可选内容纳入。贝尔维尤仅预留封锁口，不擅自增加新城。
交付：索引 HTML、33 张 1800×1400 PNG、33 张矢量 SVG、JSON 坐标与房间数据、可重建脚本。
设计图为扁平地图信息层。游戏中仍采用 3D 场景与固定 55° 俯视镜头。未生成概念渲染图，也未改变现有游戏场景。

完整图目
00 总览；01 交通；02 风险；03 营地；04 高度层；05 十桥状态；06—13 八个分区；T1-01—04；T2-01—09；C1-01—05；32 通用地块库。
局部图的房间矩形是占地包络，黄色门槛和细虚线代表门洞与连接意向，不是精确建筑施工图。楼层说明表达垂直关系，不等于每层已有独立平面施工图。
宏观几何经过游戏浓缩；不作为真实西雅图导航图。原文未给具体坐标、房间、路网线形，本册对此进行了设计补充。

原规范冲突与本次提案（均需后续设计审定）
1. 两条南北汽车通路：原桥表只有 I-5 下层恒通，其余可升降。提案 B01 巴拉德与 B06 蒙特雷克采用安全联锁，至少一座保持降下，结合 B04 形成两条几何通路。占点、伏击和临时车辆阻挡仍有玩法价值；若要允许两桥同时升起，必须新增可用跨水方案。
2. 出生点：中央区过近医院，不作为新手出生。出生改为巴拉德北缘、西西雅图西南缘、灯塔山南部东缘。本次按 T1 中心直线距离 ≥1024m 检查；若按 POI 边界计距则需重排，不能混用口径。
3. T2 与 C1 距离：原规范要求每个 T2 到 C1 为 256—768m，但所有 C1 集中北部，港口/球场周边无法满足；华大实验楼又与红场过近。本册保留指定地标与营地位置，将该项列为待修订，建议南部由 C2 承担补给链，而不是暗改 C1 名单。
4. T3 数量：30—50 个单体与每个陆地区格食物、每营地 300m 内三类服务冲突。本册放置 {len(t3)} 个食物/诊所/零件综合组团，强调服务类型；尚未证明所有营地 300m 覆盖，不能当作生产版通过。
5. 机场：原条目允许跑道载具战，但 T1 通用条款全部禁车。本册采用核心步行、外围停机坪载具交火的统一提案。若采用跑道车辆玩法，须明确机场是例外。
6. T1 缓冲圈：总图红虚框表示从 T1 中心约 250m 的禁车规划边界；原文“外围150—250m缓冲环”和“周边250m无直达道路”可能指从建筑外边界再向外扩，尺度不同。局部 500m 是整体设计包络，不宣称已满足另一口径。
7. 水域 Cell 不设置摩托穿越线或食物店。每格补给与 L3 贯通应明确适用于可玩陆地区格；需要渡水的连接必须交给指定桥梁/船路。

已做的结构校验
33 图齐全；64 Cells 被 8 张分区图无遗漏覆盖；4 T1（含可选）、9 T2、5 C1、12 C2、60 C3、240 T4、10 桥、6 节点。
C1 两两最小中心距离 {checks['c1MinPairDistanceM']}m（要求 ≥768m）。C1 到 T1 最小中心距离 {checks['c1MinT1CenterDistanceM']}m（要求 ≥512m）。出生点到 T1 最小中心距离 {checks['spawnMinT1CenterDistanceM']}m。

未声称通过的验证
道路图尚非完整寻路图，宏观 L3 为走向片段；C2/C3/T4 为可编辑候选点，不是最终程序生成结果。全图车行/摩托连通、所有营地服务半径、每个入口的真实碰撞、250m完整禁车圈、涨潮状态下可撤离、桥梁动态组合、行车3—5分钟/步行25—35分钟均须 P1/P2 白盒与游戏模拟验证。
本次只交付设计，不把 P0 的美术样板间审批门槛标为通过，不变更已有 P0 待审状态。

复现：在项目根目录运行 python docs/map-atlas/build_atlas.py。仅需现有 Pillow 与 Windows 微软雅黑。
''',encoding='utf8')
# Contact sheet for quick review.
thumbw,thumbh=360,280;contact=Image.new('RGB',(thumbw*6,thumbh*6),C['bg'])
for i,s in enumerate(sheets):
    im=Image.open(OUT/f'{s["id"]}.png');im.thumbnail((thumbw,thumbh));contact.paste(im,((i%6)*thumbw,(i//6)*thumbh))
contact.save(ROOT/'contact-sheet.jpg',quality=92)
with zipfile.ZipFile(ROOT/'the-last-rule-map-atlas.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in ROOT.rglob('*'):
        if f.is_file() and f.suffix not in ['.zip','.py'] and '__pycache__' not in str(f):z.write(f,f.relative_to(ROOT))
print(json.dumps(checks,ensure_ascii=False,indent=2))
