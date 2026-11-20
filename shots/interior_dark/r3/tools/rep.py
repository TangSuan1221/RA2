# 批量精确替换：python -I rep.py file patch.py   patch.py 定义 R = [(old, new), ...]
import sys
f, pf = sys.argv[1], sys.argv[2]
s = open(f, encoding='utf8').read()
ns = {}
exec(open(pf, encoding='utf8').read(), ns)
for a, b in ns['R']:
    c = s.count(a)
    if c != 1:
        print('FAIL count=%d :: %s' % (c, a[:80])); sys.exit(1)
    s = s.replace(a, b)
open(f, 'w', encoding='utf8').write(s)
print('ok', len(ns['R']))
