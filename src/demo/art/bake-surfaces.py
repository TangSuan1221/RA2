"""Build original derivative surfaces from bundled Poly Haven CC0 photographs."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter
import numpy as np
root=Path(__file__).resolve().parents[3]
out=root/'public/assets/evac-art'
rng=np.random.default_rng(6924)
def src(name):
 p=next((root/'public/assets/textures'/name).glob('*diff*'))
 return Image.open(p).convert('RGB')
def sample(name,sz,tile):
 im=src(name).resize((tile,tile)); a=np.asarray(im).astype(float)/255
 h,w=sz;return np.tile(a,((h+tile-1)//tile,(w+tile-1)//tile,1))[:h,:w]
def noise(w,h,n):
 return np.array(Image.fromarray(rng.integers(0,255,(max(3,int(h*n/w)),n),dtype=np.uint8)).resize((w,h),Image.Resampling.BICUBIC)).astype(float)/255
w,h=1536,512
y,x=np.mgrid[0:h,0:w];y=y/h
n=noise(w,h,21);fine=noise(w,h,175);tiny=rng.random((h,w))
raw=sample('road_damaged',(h,w),280);raw=raw@[.30,.57,.13]
mud=sample('brown_mud_leaves_01',(h,w),256);mud=mud@[.30,.57,.13]
grass=sample('aerial_grass_rock',(h,w),280);grass=grass@[.30,.57,.13]
mask=np.clip((np.abs(y-.5)*2-.36+n*.38+fine*.18-.20)*4,0,1)
center=np.clip((.14-np.abs(y-.5)+.07*(n-.5)+.05*(fine-.5))*7,0,.88)
mask=np.maximum(mask,center)
mix=mud*.43+raw*.57
ground=np.stack([mix*1.03+.13,mix*1.01+.12,mix*.96+.11],-1)
plant=np.stack([grass*.59+.14,grass*.60+.13,grass*.48+.10],-1)
rgb=ground*(1-mask[:,:,None])+plant*mask[:,:,None]
standing_water=np.zeros((h,w))
for t in [0.35,0.65]:
 depression=np.abs(y-t-(n-.5)*.078)
 wet=np.clip((.085-depression)*20+(n-.6)*2+(fine-.5)*.9,0,1)
 rgb*=1-.28*wet[:,:,None]
 standing_water=np.maximum(standing_water,np.clip((wet-.46)*2.3,0,1))
rgb+=(tiny[:,:,None]-.5)*.06
def save(a,p):Image.fromarray(np.uint8(np.clip(a*255,0,255))).save(out/p,quality=92)
save(rgb,'garden-lane.jpg')
Image.fromarray(np.uint8(255*standing_water)).save(out/'wheel-ruts.jpg',quality=94)
Image.fromarray(np.uint8(216-201*standing_water)).save(out/'lane-roughness.jpg',quality=94)
edge=np.minimum(np.minimum(y,1-y)*5,np.minimum(x/w,1-x/w)*12)
alpha=np.clip((edge+(n-.53)*.35+(fine-.5)*.18)*1.9,0,1)
Image.fromarray(np.uint8(255*alpha)).save(out/'lane-mask.jpg',quality=93)
# Long weathered lap siding with weather-softened boards and fine exposed lower edges.
wood=src('weathered_brown_planks')
im=Image.new('RGB',(1024,1024))
for row in range(24):
 yy=round(row*1024/24); hh=round((row+1)*1024/24)-yy
 offset=int(rng.integers(0,1024))
 band=wood.crop((0,int(row*29),1024,int(row*29)+hh)).resize((1024,hh))
 lum=np.asarray(band).astype(float)@[.30,.57,.13]/255
 lum=np.roll(lum,offset,axis=1)*.46+.27+rng.uniform(-.016,.016)
 lum[:2]*=.69;lum[2:4]*=.86;lum[-1]*=1.12
 a=np.stack([lum*1.055,lum*1.02,lum*.93],-1)
 im.paste(Image.fromarray(np.uint8(np.clip(a*255,0,255))),(0,yy))
im.save(out/'cedar-shingles.jpg',quality=94)
# Soft banks and silt islands interrupt the mirror surface of shallow standing water.
size=512
py,px=np.mgrid[-1:1:complex(size),-1:1:complex(size)]
broad=noise(size,size,9)
grain=noise(size,size,74)
bank=.77-(px**2+py**2)**.5+(broad-.5)*.42+(grain-.5)*.12
water=np.clip(bank*10,0,1)*np.clip((broad+grain*.32-.32)*4,0,1)
Image.fromarray(np.uint8(water*255)).save(out/'yard-water-mask.jpg',quality=95)
Image.fromarray(np.uint8((.12+.65*(1-water)+.13*grain)*255)).save(out/'yard-water-rough.jpg',quality=95)
