from PIL import Image, ImageOps, ImageDraw, ImageFont
from pathlib import Path
out=Path('shots/continuation/review/interiors_latest.jpg')
rows=[('Aquarium / r7','C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-c6cf6447-56c6-4ce2-9efa-ae74ac247209.png','shots/continuation/aquarium/r7.jpg'),('Hospital / r5','C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-19b83700-fb99-4bd2-a63d-36e4f2522181.png','shots/continuation/interiors/hospital_r5.jpg'),('Flooded atrium / r4','C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-3ee7fbca-1cf5-40cd-a77c-a29e859252f5.png','shots/continuation/interiors/flooded_r4.jpg')]
im=Image.new('RGB',(1608,1470),(19,23,24)); d=ImageDraw.Draw(im)
f=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22)
for r,(name,ref,render) in enumerate(rows):
 y=r*490;d.text((10,y+8),name+' | Reference',font=f,fill=(235,235,235));d.text((818,y+8),'Three.js render',font=f,fill=(235,235,235))
 for col,p in enumerate([ref,render]):
  s=ImageOps.contain(Image.open(p).convert('RGB'),(800,450));im.paste(s,(col*808+(800-s.width)//2,y+40+(450-s.height)//2))
im.save(out,quality=90)


