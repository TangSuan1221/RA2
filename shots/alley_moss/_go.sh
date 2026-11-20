#!/bin/sh
# 用法：_go.sh 标签
cd "/c/Users/Lenovo/Desktop/the last rule"
echo '[{"url":"http://localhost:5173/?scene=alley_moss&shot=hero","out":"shots/alley_moss/r1_'$1'_hero.jpg"},{"url":"http://localhost:5173/?scene=alley_moss&shot=top","out":"shots/alley_moss/r1_'$1'_top.jpg"}]' > shots/alley_moss/_plan.json
node tools/shot.mjs --batch shots/alley_moss/_plan.json --w 1600 --h 900 --wait 4000 | python -I -c "
import json,sys
for r in json.load(sys.stdin): print(r['out'], r.get('failed'), r.get('error'), {k:round(v,2) for k,v in (r.get('stats') or {}).items()}, r['logs'][:6])"
python -I tools/small.py shots/alley_moss/r1_$1_hero.jpg shots/alley_moss/r1_$1_hero_view.jpg
python -I tools/small.py shots/alley_moss/r1_$1_top.jpg shots/alley_moss/r1_$1_top_view.jpg
python -I shots/alley_moss/_stats.py shots/alley_moss/r1_$1_hero.jpg
