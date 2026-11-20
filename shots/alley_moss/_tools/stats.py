# 统计亮度分位数与饱和度
import sys
from PIL import Image
import numpy as np
for f in sys.argv[1:]:
    a = np.asarray(Image.open(f).convert('RGB'), float) / 255
    l = (0.2126*a[...,0] + 0.7152*a[...,1] + 0.0722*a[...,2]) * 255
    mx = a.max(-1); mn = a.min(-1); s = np.where(mx > 0, (mx-mn)/np.maximum(mx,1e-6), 0)
    h, w = l.shape
    reg = lambda y0,y1,x0,x1: l[int(y0*h):int(y1*h), int(x0*w):int(x1*w)].mean()
    print(f, 'p10/50/90 %.0f/%.0f/%.0f sat %.2f | L %.0f C %.0f R %.0f bottom %.0f' % (np.percentile(l,10), np.percentile(l,50), np.percentile(l,90), s.mean(), reg(0.2,0.8,0,0.33), reg(0.2,0.8,0.33,0.66), reg(0.2,0.8,0.66,1), reg(0.75,1,0,1)))
