from PIL import Image, ImageOps
from pathlib import Path
import sys,random
ref,ren,out=sys.argv[1:]; ps=[ref,ren]; random.Random(out).shuffle(ps)
im=Image.new('RGB',(1608,450),(24,24,24))
for i,p in enumerate(ps):
 s=ImageOps.contain(Image.open(p).convert('RGB'),(800,450)); im.paste(s,(i*808+(800-s.width)//2,(450-s.height)//2))
im.save(out,quality=90)
