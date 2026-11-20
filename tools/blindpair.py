# 盲测配对：把参考图与渲染图统一裁成 16:9、压缩到可查看大小，随机命名为 A / B
# 用法：python -I tools/blindpair.py <参考图> <渲染图> <输出前缀> <种子整数>
# 产出 <前缀>_A.jpg、<前缀>_B.jpg（各 ≤28KB），答案写入 <前缀>.answer.json（评审不得读取）
import sys, json, io
from PIL import Image
ref, ren, pre, seed = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
def prep(p):
    im = Image.open(p).convert('RGB'); w, h = im.size; tw = int(h * 16 / 9)
    im = im.crop(((w - tw) // 2, 0, (w - tw) // 2 + tw, h)) if tw <= w else im.crop((0, (h - int(w * 9 / 16)) // 2, w, (h - int(w * 9 / 16)) // 2 + int(w * 9 / 16)))
    return im.resize((768, 432), Image.Resampling.LANCZOS)
def save(im, path):
    for q in (80, 72, 64, 56, 48, 40):
        b = io.BytesIO(); im.save(b, 'JPEG', quality=q, optimize=True)
        if b.tell() <= 28000: open(path, 'wb').write(b.getvalue()); return
    im.resize((640, 360)).save(path, quality=50)
swap = (seed * 2654435761) % 2 == 1
a, b = (prep(ren), prep(ref)) if swap else (prep(ref), prep(ren))
save(a, pre + '_A.jpg'); save(b, pre + '_B.jpg')
json.dump({'A': 'render' if swap else 'ref', 'B': 'ref' if swap else 'render'}, open(pre + '.answer.json', 'w'))
print(pre + '_A.jpg', pre + '_B.jpg')
