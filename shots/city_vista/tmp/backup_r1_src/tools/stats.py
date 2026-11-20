# 亮度/饱和度统计：python -I stats.py 图1 [图2 ...]
import sys, numpy as np
from PIL import Image
for f in sys.argv[1:]:
    im=np.asarray(Image.open(f).convert('RGB').resize((640,360))).astype(float)/255
    L=(0.2126*im[...,0]+0.7152*im[...,1]+0.0722*im[...,2])*255
    mx=im.max(-1); mn=im.min(-1); s=np.where(mx>0,(mx-mn)/np.maximum(mx,1e-6),0)
    print(f.split('/')[-1], 'L', np.percentile(L,[10,50,90]).round(0), 'sat', s.mean().round(3))
    H=im.shape[0]
    for name,(a,b) in {'top':(0,0.25),'mid':(0.25,0.55),'grd':(0.55,0.8),'fg':(0.8,1)}.items():
        r=im[int(a*H):int(b*H)]; l=L[int(a*H):int(b*H)]; ss=s[int(a*H):int(b*H)]
        print('  ',name, np.percentile(l,[10,50,90]).round(0), 'sat',ss.mean().round(3),'rgb',(r.reshape(-1,3).mean(0)*255).round(0))
