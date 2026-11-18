// 并排盲测拼图：把参考图和渲染图随机左右放置，统一尺寸，输出拼图 + 答案
// 用法：python -I tools/blind.py <参考图> <渲染图> <输出.jpg> <种子整数>
// 输出：拼图（左 A / 右 B，不含任何标注能泄露来源），以及在 stdout 打印 JSON {"A": "ref"|"render", ...}
import sys, json
from PIL import Image

ref, ren, out, seed = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
H = 720
def load(p):
    im = Image.open(p).convert('RGB')
    w, h = im.size
    # 统一裁成 16:9 再缩放，去掉边缘水印区域
    tw = int(h * 16 / 9)
    if tw <= w:
        x0 = (w - tw) // 2; im = im.crop((x0, 0, x0 + tw, h))
    else:
        th = int(w * 9 / 16); y0 = (h - th) // 2; im = im.crop((0, y0, w, y0 + th))
    return im.resize((1280, H), Image.Resampling.LANCZOS)

a, b = load(ref), load(ren)
swap = (seed * 2654435761) % 2 == 1
left, right = (b, a) if swap else (a, b)
canvas = Image.new('RGB', (1280 * 2 + 16, H), (0, 0, 0))
canvas.paste(left, (0, 0)); canvas.paste(right, (1296, 0))
canvas.save(out, quality=90)
print(json.dumps({'A': 'render' if swap else 'ref', 'B': 'ref' if swap else 'render'}))
