import bpy,json,math,os
from mathutils import Vector
root=r'C:\Users\Lenovo\Desktop\the last rule\shots\density-v2'
data=json.load(open(os.path.join(root,'layout-v2.json'),encoding='utf8'))
s=bpy.data.scenes.new('验证关卡_V2_连续街区');bpy.context.window.scene=s;s.unit_settings.system='METRIC'
collections={}
for key in ['地形','道路','住宅','商业','工业','低层街区','地标','标注']:
 c=bpy.data.collections.new('V2_'+key);s.collection.children.link(c);collections[key]=c
def material(name,color):
 m=bpy.data.materials.new('V2_'+name);m.diffuse_color=(*color,1);return m
mats={k:material(k,v) for k,v in {'住宅':(.71,.73,.74),'商业':(.67,.69,.71),'工业':(.60,.63,.65),'低层街区':(.72,.74,.76),'地标':(.79,.81,.82),'地形':(.38,.40,.41),'道路':(.15,.17,.19),'水':(.20,.29,.34),'标注':(.95,.95,.92),'广场':(.48,.50,.50),'任务':(.85,.60,.28)}.items()}
mesh=bpy.data.meshes.new('UnitCube');mesh.from_pydata([(a,b,c) for a,b,c in [(-.5,-.5,-.5),(-.5,-.5,.5),(-.5,.5,-.5),(-.5,.5,.5),(.5,-.5,-.5),(.5,-.5,.5),(.5,.5,-.5),(.5,.5,.5)]],[],[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)]);mesh.update()
def box(name,x,y,w,d,h,z=None,mat='地标',collection=None):
 o=bpy.data.objects.new(name,mesh.copy());collections[collection or (mat if mat in collections else '地形')].objects.link(o);o.location=(x-600,540-y,h/2 if z is None else z);o.scale=(w,d,h);o.data.materials.append(mats[mat]);return o
box('水域',600,540,1240,1120,4,-5,'水')
box('北岸',600,140,1040,280,3,-2,'地形');box('南岸',600,710,1040,740,3,-2,'地形')
for e in data['roads']:
 a,b=e['a'],e['b'];length=math.dist(a,b);o=box(e['kind'],(a[0]+b[0])/2,(a[1]+b[1])/2,length,e['width'],.3,.1,'道路');o.rotation_euler.z=math.atan2(-(b[1]-a[1]),b[0]-a[0])
for name,x1,x2,y1,y2 in data['reserves']:
 box(name+'_地块',(x1+x2)/2,(y1+y2)/2,x2-x1-20,y2-y1-20,.15,-.1,'广场')
for b in data['buildings']:box(b['name'],b['x'],b['y'],b['w'],b['d'],b['h'],mat=b['zone'])
for b in data['landmarks']:box(b['name'],b['x'],b['y'],b['w'],b['d'],b['h'],b.get('z'),mat='地标')
# Small parking courts and pedestrian entry proxies at the tower perimeter.
for x,y in [(620,500),(820,500)]:
 box('塔区停车坪',x,y,20,50,.2,.25,'道路')
 for i in range(4):box('停车位车辆尺度',x,y-15+i*9,2,4.5,1.5,mat='低层街区')
for x,y in [(650,500),(790,500)]:box('步行入口引道',x,y,70,3,.15,.3,'道路')
# 1.8m reference person in local camera.
box('1.8米人物尺度',372,635,.6,.5,1.8,mat='任务',collection='标注')
font=bpy.data.fonts.load(r'C:\Windows\Fonts\msyh.ttc')
def label(body,x,y,size=15,mat='标注'):
 cu=bpy.data.curves.new(body,'FONT');cu.body=body;cu.font=font;cu.size=size;cu.align_x='CENTER';o=bpy.data.objects.new(body,cu);collections['标注'].objects.link(o);o.location=(x-600,540-y,1);cu.materials.append(mats[mat]);return o
for text,x,y in [('01 出生民居',300,966),('02 消防站',300,727),('03 劳顿堡',240,210),('04 广播站',540,210),('05 变电站',900,610),('06 交易渡口',170,608),('水族馆',180,487),('派克市场',420,490),('塔区 · 禁车广场',720,575),('口袋公园',540,810)]:label(text,x,y,13)
label('V2  /  连续街区验证关卡',600,40,25)
label('1200 × 1080 m  /  275 栋占位建筑',600,75,16)
label('居住区 21%',600,1040,16);label('工业区 35%',1030,710,13)
box('100m比例尺',170,1030,100,3,1,.6,'标注');label('100 m',170,1055,14)
# Task order is indicated by small colored pads, all geometry remains grey.
for i,(name,p) in enumerate(data['stops']):
 box('任务入口_'+name,p[0],p[1],7,7,.5,.5,'任务',collection='标注')
def cam(name,pos,target,scale):
 c=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,c);s.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();c.type='ORTHO';c.ortho_scale=scale;c.clip_end=10000;return o
cams=[cam('V2_01_全局',(1350,-1750,2200),(0,0,0),1640),cam('V2_02_总平面',(0,0,2500),(0,0,0),1320),cam('V2_03_街区',(320,-650,450),(-60,-120,0),630)]
s.render.engine='BLENDER_WORKBENCH';s.display.shading.light='STUDIO';s.display.shading.color_type='MATERIAL';s.display.shading.show_shadows=False;s.display.shading.show_cavity=True;s.display.shading.cavity_type='BOTH';s.display.shading.background_type='WORLD';s.world=bpy.data.worlds.new('V2背景');s.world.color=(.08,.09,.10);s.view_settings.view_transform='Standard';s.view_settings.exposure=.15
s.render.resolution_x=1800;s.render.resolution_y=1500;s.render.resolution_percentage=100
for c,filename in zip(cams,['overview.png','plan.png','district.png']):
 s.camera=c;s.render.filepath=os.path.join(root,filename);bpy.ops.render.render(write_still=True)
s.camera=cams[0]
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.clip_end=10000
bpy.data.libraries.write(os.path.join(root,'验证关卡_V2_连续街区.blend'),{s},fake_user=True)
print('V2 greybox saved: 275 buildings, 3 camera views')
