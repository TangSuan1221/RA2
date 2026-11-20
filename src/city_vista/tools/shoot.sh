#!/bin/sh
# 用法：sh src/city_vista/tools/shoot.sh <前缀>   → 生成 hero/top 截图、小图与统计
cd "$(dirname "$0")/../../.."
P=${1:-r1}
cat > shots/city_vista/tmp/plan.json <<J
[{"url":"http://localhost:5173/?scene=city_vista&shot=hero","out":"shots/city_vista/${P}_hero.jpg"},
 {"url":"http://localhost:5173/?scene=city_vista&shot=top","out":"shots/city_vista/${P}_top.jpg"}]
J
node tools/shot.mjs --batch shots/city_vista/tmp/plan.json --w 1600 --h 900 --wait 4500 | python -I -c "import json,sys; [print(r['out'], r.get('failed'), r.get('error'), {k:round(v,2) for k,v in (r.get('stats') or {}).items() if k in ('gpu','drawCalls','triangles')}, r['logs'][:5]) for r in json.load(sys.stdin)]"
python -I tools/small.py shots/city_vista/${P}_hero.jpg shots/city_vista/${P}_hero_view.jpg
python -I tools/small.py shots/city_vista/${P}_top.jpg shots/city_vista/${P}_top_view.jpg
python -I src/city_vista/tools/stats.py shots/city_vista/${P}_hero.jpg
