import bpy,json,math,os
from mathutils import Vector
root=r'C:\Users\Lenovo\Desktop\the last rule\shots\density'
data=json.load(open(os.path.join(root,'massing.json'),encoding='utf8'))
s=bpy.data.scenes.new('验证关卡_建筑密度灰模');bpy.context.window.scene=s
s.unit_settings.system='METRIC'
def mat(name,c):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);return m
white=mat('建筑_浅灰',(.69,.71,.73));ground=mat('陆地',(.31,.33,.34));roadmat=mat('道路',(.12,.14,.16));water=mat('水域',(.17,.24,.28));ink=mat('标注',(.9,.9,.9));poi=mat('地标',(.52,.56,.60))
def box(name,x,y,z,w,d,h,m):
 mesh=bpy.data.meshes.new(name);verts=[(a*w/2,b*d/2,c*h/2) for a,b,c in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]];mesh.from_pydata(verts,[],[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)]);mesh.update();o=bpy.data.objects.new(name,mesh);s.collection.objects.link(o);o.location=(x,y,z);o.data.materials.append(m);return o
def xy(x,z):return x-1100,1100-z
box('水域底板',0,0,-3,2450,2450,2,water)
# Existing test level coastline and ship canal, shown schematically.
box('北岸',50,905,-1.2,2100,490,2,ground)
box('南岸',50,-272.5,-1.2,2100,1695,2,ground)
for i,e in enumerate(data['roads']):
 if e['state'] in ['boat','closed']:continue
 a,b=e['A'],e['B'];x,y=xy((a[0]+b[0])/2,(a[1]+b[1])/2)
 length=math.dist(a,b);o=box('道路_%03d_%s'%(i,e['grade']),x,y,.1,length,e['width'],.3,roadmat);o.rotation_euler.z=math.atan2(-(b[1]-a[1]),b[0]-a[0])
for i,b in enumerate(data['boxes']):
 x,y=xy(b['x'],b['z']);o=box('建筑体量_%03d'%i,x,y,b['y'],b['w'],b['d'],b['h'],white);o.rotation_euler=(b['rx'],-b['rz'],-b['ry'])
# Envelope proxies for hollow structures omitted by the solid-box capture.
extra=[]
for i,(x,z,w,d) in enumerate(data['footprints']):
 if any(abs(b['x']-x)<w*.5 and abs(b['z']-z)<d*.5 for b in data['boxes']):continue
 xx,yy=xy(x,z);box('空心建筑占地代理_%03d'%i,xx,yy,4,w,d,8,poi);extra.append([x,z,w,d])
x,y=xy(1220,816);box('针塔_塔身代理',x,y,58,5.6,5.6,116,poi);box('针塔_观景层代理',x,y,121,32,32,8,white)
x,y=xy(745,336);box('电台_天线代理',x,y,13.5,2,2,27,poi)
font=None
for path in [r'C:\Windows\Fonts\msyh.ttc',r'C:\Windows\Fonts\simhei.ttf']:
 if os.path.exists(path):font=bpy.data.fonts.load(path);break
def text(label,x,z,size):
 cu=bpy.data.curves.new(label,'FONT');cu.body=label;cu.size=size;cu.align_x='CENTER';
 if font:cu.font=font
 o=bpy.data.objects.new(label,cu);s.collection.objects.link(o);o.location=(*xy(x,z),1);cu.materials.append(ink)
for label,x,z in [('出生民居',275,1870),('消防站',420,1150),('劳顿堡',440,680),('广播站',760,305),('变电站',1680,1330),('渡口',240,980),('太空针塔',1220,900),('街区走廊',960,1380)]:text(label,x,z,22)
text('滨海撤离 / 建筑密度灰模 / 1:1 米制',1100,20,34)
box('100m比例尺',-850,-990,1,100,4,1,ink);text('100 m',250,2130,18)
def camera(name,loc,target,scale):
 c=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,c);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();c.type='ORTHO';c.ortho_scale=scale;c.clip_end=10000;return o
cams=[camera('01_全局鸟瞰',(2300,-2900,3200),(0,0,0),3100),camera('02_街区密度',(70,-490,340),(-200,-165,0),820),camera('03_总平面',(0,0,3500),(0,0,0),2500)]
s.camera=cams[0]
try:s.render.engine='BLENDER_WORKBENCH'
except TypeError:pass
s.display.shading.light='STUDIO';s.display.shading.color_type='MATERIAL';s.display.shading.show_shadows=True;s.display.shading.show_cavity=True;s.display.shading.cavity_type='BOTH';s.display.shading.background_type='WORLD';s.world=bpy.data.worlds.new('灰模背景');s.world.color=(.09,.09,.09)
s.render.resolution_x=1600;s.render.resolution_y=1200;s.render.resolution_percentage=100
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.clip_end=10000
for c,filename in zip(cams,['overview.png','district.png','plan.png']):
 s.camera=c;s.render.filepath=os.path.join(root,filename);bpy.ops.render.render(write_still=True)
s.camera=cams[0]
bpy.data.libraries.write(os.path.join(root,'验证关卡_建筑密度灰模.blend'),{s},fake_user=True)
print(json.dumps({'solid_masses':len(data['boxes']),'footprint_proxies':len(extra),'saved':root},ensure_ascii=False))
