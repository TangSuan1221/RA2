# 全分辨率裁切（避免缩略图模糊）：python -I _crop3.py 输入 输出 x0 y0 x1 y1（0~1 归一化）
import sys, io
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
x0, y0, x1, y1 = map(float, sys.argv[3:7])
im = Image.open(src).convert('RGB'); W, H = im.size
c = im.crop((int(x0*W), int(y0*H), int(x1*W), int(y1*H)))
c.thumbnail((768, 768))
for q in (85, 75, 65, 55, 45):
    b = io.BytesIO(); c.save(b, 'JPEG', quality=q)
    if b.tell() < 27000: break
open(dst, 'wb').write(b.getvalue()); print(dst, c.size, b.tell())
