#!/bin/sh
# 用法：shot.sh <标签>   → 生成 r3_<标签>_hero/top.jpg + 小图 + 统计
cd "/c/Users/Lenovo/Desktop/the last rule"
T=$1; D=shots/interior_dark
cat > $D/r3/plan.json <<J
[{"url":"http://localhost:5173/?scene=interior_dark&shot=hero","out":"$D/r3_${T}_hero.jpg"},{"url":"http://localhost:5173/?scene=interior_dark&shot=top","out":"$D/r3_${T}_top.jpg"}]
J
node tools/shot.mjs --batch $D/r3/plan.json --wait 4000 | python -I -c "import json,sys; r=json.load(sys.stdin); [print(x['out'], x.get('failed'), x.get('error'), {k:round(v,2) for k,v in (x.get('stats') or {}).items() if k!='mem'}, x.get('logs')) for x in r]"
python -I tools/small.py $D/r3_${T}_hero.jpg $D/r3_${T}_hero_view.jpg 28000 900 >/dev/null
python -I tools/small.py $D/r3_${T}_top.jpg $D/r3_${T}_top_view.jpg 26000 768 >/dev/null
python -I $D/r3/tools/stats.py $D/r3_${T}_hero.jpg $D/r3_${T}_top.jpg
