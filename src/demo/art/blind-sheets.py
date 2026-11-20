"""Pair each recorded runtime camera with its matching supplied concept at a common size."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps
import json, random, sys

root=Path(__file__).resolve().parents[3]
out=root/'shots/evac/inspection'
refs=Path(sys.argv[1])
rng=random.SystemRandom()
rows=json.loads((out/'metrics.json').read_text(encoding='utf-8'))
answer={}
for offset in range(0,len(rows),4):
    subset=rows[offset:offset+4]
    sheet=Image.new('RGB',(960,293*len(subset)))
    draw=ImageDraw.Draw(sheet)
    for i,row in enumerate(subset):
        key=row['id']
        runtime=out/(key+'-'+row['key']+'.jpg')
        montage={'17':'17-radio-views','18':'18-power-states','19':'19-shop-fronts'}.get(key)
        if montage:
            runtime=out/'southern'/(montage+'.jpg')
        files=[next(refs.glob(key+'*.png')),runtime]
        rng.shuffle(files)
        answer[key]='AB'[files.index(runtime)]
        for j,p in enumerate(files):
            draw.text((j*480+8,i*293+4),key+'  '+'AB'[j],fill='white')
            with Image.open(p) as im:
                sheet.paste(ImageOps.fit(im.convert('RGB'),(478,269)),(480*j,293*i+22))
    sheet.save(out/f'final-pair-{offset//4+1}.jpg',quality=91)
(out/'final-answer.json').write_text(json.dumps(answer),encoding='utf-8')
