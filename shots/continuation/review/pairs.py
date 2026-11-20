from PIL import Image, ImageOps
from pathlib import Path
import json, random
root=Path.cwd(); out=root/'shots/continuation/review'
pairs=[('flooded_baseline','C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-3ee7fbca-1cf5-40cd-a77c-a29e859252f5.png','shots/flooded_atrium/r2_a_hero.jpg'),('hospital_baseline','C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-19b83700-fb99-4bd2-a63d-36e4f2522181.png','shots/interior_dark/critic_r4_hero.jpg'),('city_baseline','C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-977a7869-97be-4966-b55d-49e4081ac72e.png','shots/city_vista/critic_r1_hero.jpg'),('street_baseline','C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-809a70c0-81cf-44b8-b3a2-4e3cee5574d5.png','shots/street_tlou/r2_hero.jpg')]
answers={}
for name,ref,ren in pairs:
    ps=[ref,ren]; random.Random(name).shuffle(ps)
    canvas=Image.new('RGB',(1608,450),(30,30,30))
    for i,p in enumerate(ps):
        im=ImageOps.contain(Image.open(p).convert('RGB'),(800,450)); canvas.paste(im,(i*808+(800-im.width)//2,(450-im.height)//2))
    canvas.save(out/(name+'.jpg'),quality=90)
    answers[name]={'left':'reference' if ps[0]==ref else 'render','right':'reference' if ps[1]==ref else 'render'}
(out/'pair_sources.json').write_text(json.dumps(answers,indent=2))
