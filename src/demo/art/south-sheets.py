"""Assemble the equivalent viewpoints, retaining the six independent shop fronts."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont

imdir=Path(__file__).resolve().parents[3]/'shots/evac/inspection/southern'
def image(name,size):
    with Image.open(imdir/(name+'.jpg')) as im:
        return ImageOps.fit(im.convert('RGB'),size)
def layout(name,size,slots):
    canvas=Image.new('RGB',size,(20,23,21))
    for id,coords in slots:
        x,y,w,h=coords
        canvas.paste(image(id,(w,h)),(x,y))
    canvas.save(imdir/(name+'.jpg'),quality=94)
layout('17-radio-views',(1200,675),[('17a',(0,0,596,334)),('17b',(0,340,596,335)),('17c',(603,0,597,675))])
layout('18-power-states',(1200,675),[('18a',(0,0,597,675)),('18b',(603,0,597,675))])
layout('19-shop-fronts',(1200,675),[('19'+c,((i%3)*401,(i//3)*339,397,335)) for i,c in enumerate('abcdef')])
refs=Path.home()/'Desktop'/'生存撤离参考图'
pairs=[('17','17-radio-views'),('18','18-power-states'),('19','19-shop-fronts'),('20','20'),('21','21')]
out=Image.new('RGB',(1200,5*362),(26,30,28))
d=ImageDraw.Draw(out)
for i,(key,name) in enumerate(pairs):
    for j,file in enumerate([next(refs.glob(key+'*.png')),imdir/(name+'.jpg')]):
        with Image.open(file) as im:
            view=ImageOps.contain(im.convert('RGB'),(592,332));x=600*j+(600-view.width)//2;y=i*362
            d.text((600*j+7,y+3),key+'  '+['REFERENCE','IN-GAME'][j],fill='white')
            out.paste(view,(x,y+23+(332-view.height)//2))
out.save(imdir/'17-21-comparison.jpg',quality=90)
