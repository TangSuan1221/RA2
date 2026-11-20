# 并排对比图：python -I cmp.py out.jpg a.jpg b.jpg [c.jpg d.jpg]  → 2 列网格，每格 640x360，压到 ≤28KB
import sys, io
from PIL import Image
out, fs = sys.argv[1], sys.argv[2:]
cw, ch = 640, 360
cols = 2; rows = (len(fs) + 1) // 2
im = Image.new('RGB', (cw * cols, ch * rows))
for i, f in enumerate(fs):
    t = Image.open(f).convert('RGB').resize((cw, ch), Image.LANCZOS)
    im.paste(t, ((i % 2) * cw, (i // 2) * ch))
w = im.size[0]
while True:
    t = im.copy(); t.thumbnail((w, w))
    for q in (80, 72, 64, 56, 48):
        b = io.BytesIO(); t.save(b, 'JPEG', quality=q)
        if b.tell() <= 28000:
            open(out, 'wb').write(b.getvalue()); print(out, t.size, q, b.tell()); sys.exit(0)
    w = int(w * 0.88)
