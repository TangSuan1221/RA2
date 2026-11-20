"""Create a paired art review sheet from player-camera captures and the supplied concepts."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
import json,sys
root=Path(__file__).resolve().parents[3]
refs=Path(sys.argv[1])
out=root/'shots/evac/inspection'
rows=json.loads((out/'metrics.json').read_text(encoding='utf-8'))
shots=[out/(row['id']+'-'+row['key']+'.jpg') for row in rows]
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',19)
small=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',15)
pages=[]
for offset in range(0,len(shots),7):
 page=Image.new('RGB',(1200,84+7*349),(31,36,35))
 draw=ImageDraw.Draw(page)
 draw.text((12,9),'西雅图撤离关卡  /  参考图与实机巡检',font=font,fill='#ebe8d9')
 draw.text((12,47),'提供的场景参考',font=small,fill='#b8c7b8')
 draw.text((608,47),'Three.js 实机固定镜位',font=small,fill='#b8c7b8')
 for i,shot in enumerate(shots[offset:offset+7]):
  number,key=shot.stem.split('-',1)
  grouped={'17':'17-radio-views','18':'18-power-states','19':'19-shop-fronts'}
  if number in grouped:
   shot=out/'southern'/(grouped[number]+'.jpg')
  ref=next(refs.glob(number+'*.png'));y=85+i*349
  draw.text((12,y),ref.stem+'   /   '+key,font=small,fill='#e3ddc8')
  for j,path in enumerate([ref,shot]):
   with Image.open(path) as f:
    if j==1 and f.convert('L').getextrema()[1]<8:
     raise ValueError(f'Empty rendered frame: {path}')
    thumb=ImageOps.contain(f.convert('RGB'),(584,314))
    page.paste(thumb,(12+j*596+(584-thumb.width)//2,y+24+(314-thumb.height)//2))
 page.save(out/('paired-'+str(len(pages)+1)+'.jpg'),quality=88)
 pages.append(page)
if len(pages)==2:
 preview=Image.new('RGB',(1200,1265))
 for i,page in enumerate(pages):
  preview.paste(page.resize((600,1265),Image.Resampling.LANCZOS),(600*i,0))
 preview.save(out/'overview.jpg',quality=89)
