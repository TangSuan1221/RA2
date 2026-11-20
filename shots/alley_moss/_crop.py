# 把截图切成 2x2 四块分别压缩（全分辨率细节对照用）
import sys
from PIL import Image
src, pre = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB'); W, H = im.size
for i, (x, y) in enumerate([(0, 0), (W // 2, 0), (0, H // 2), (W // 2, H // 2)]):
    im.crop((x, y, x + W // 2, y + H // 2)).save(f'{pre}_q{i}.png')
