import sys
from PIL import Image
import numpy as np
for f in sys.argv[1:]:
    a=np.asarray(Image.open(f).convert('RGB').resize((400,225))).astype(float)
    l=a@[0.299,0.587,0.114]
    mx=a.max(2); mn=a.min(2); s=np.where(mx>0,(mx-mn)/np.maximum(mx,1),0)
    g=(a[...,1]>a[...,0])&(a[...,1]>a[...,2])
    print(f.split('/')[-1], 'p10/50/90', np.percentile(l,[10,50,90]).round(0), 'sat %.2f'%s.mean(), 'mean', a.reshape(-1,3).mean(0).round(0), 'green%% %.0f'%(g.mean()*100))
