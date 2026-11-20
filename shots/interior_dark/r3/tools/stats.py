# 亮度/饱和度统计：python -I stats.py a.jpg [b.jpg ...]
import sys
from PIL import Image
import numpy as np
for f in sys.argv[1:]:
    a=np.asarray(Image.open(f).convert('RGB')).astype(float)
    L=0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]
    mx=a.max(-1); mn=a.min(-1); s=np.where(mx>0,(mx-mn)/np.maximum(mx,1),0)
    print(f.split('/')[-1], 'p10/50/90/99', [round(float(np.percentile(L,p)),1) for p in (10,50,90,99)], 'rgb', a.reshape(-1,3).mean(0).round(1).tolist(), 'sat', round(float(s.mean())*255,1))
    H,W=L.shape
    for j in range(4):
        print('   '+' '.join('%4.0f'%L[j*H//4:(j+1)*H//4, i*W//8:(i+1)*W//8].mean() for i in range(8)))
