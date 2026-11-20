# 统计：亮度分位数、平均饱和度（HSV S，0-255）、分区亮度（3x3）
import sys
from PIL import Image
import numpy as np
for f in sys.argv[1:]:
    im = Image.open(f).convert('RGB').resize((800, 450))
    a = np.asarray(im).astype(float)
    L = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    S = np.asarray(im.convert('HSV'))[..., 1].astype(float)
    p = np.percentile(L, [10, 50, 90, 99])
    g = [[int(L[i*150:(i+1)*150, j*266:(j+1)*266].mean()) for j in range(3)] for i in range(3)]
    m = a.reshape(-1, 3).mean(0)
    print(f.split('/')[-1], 'L p10/50/90/99', [int(x) for x in p], 'sat', int(S.mean()), 'satLit', int(S[L > 60].mean()) if (L > 60).any() else 0, 'mean', [int(x) for x in m], 'grid', g)
