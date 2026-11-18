# 生成「可被视觉模型查看」的小图：图片传输上限约 30KB，超过会被丢弃（看到 Image omitted 就是超限）
# 用法：python -I tools/small.py <输入> <输出.jpg> [最大字节=28000] [宽=768]
import sys, io
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
limit = int(sys.argv[3]) if len(sys.argv) > 3 else 28000
width = int(sys.argv[4]) if len(sys.argv) > 4 else 768
im = Image.open(src).convert('RGB')
w = width
while True:
    t = im.copy(); t.thumbnail((w, w))
    for q in (82, 74, 66, 58, 50, 42):
        b = io.BytesIO(); t.save(b, 'JPEG', quality=q, optimize=True)
        if b.tell() <= limit:
            open(dst, 'wb').write(b.getvalue()); print(f'{dst} {t.size[0]}x{t.size[1]} q{q} {b.tell()}B'); sys.exit(0)
    w = int(w * 0.85)
