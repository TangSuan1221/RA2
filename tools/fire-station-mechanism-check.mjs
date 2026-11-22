// Run with node tools/fire-station-mechanism-check.mjs [strict-JSON specification or - for stdin].
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const specUrl = process.argv[2] ? pathToFileURL(resolve(process.argv[2])) :
  new URL('../docs/fire-station-mechanics/level_fire_station.jsonc', import.meta.url);
const spec = JSON.parse(readFileSync(process.argv[2] === '-' ? 0 : specUrl, 'utf8'));
const rag = readFileSync(new URL('../docs/美术RAG-交互物清单与尺寸规范.md', import.meta.url), 'utf8');
const catalogue = new Set([...rag.matchAll(/^\| ([A-Z]+-\d{2}) \|/gm)].map(match => match[1]));
const { graph, mechanisms } = spec;
const check = (condition, message) => assert.ok(condition, message);
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const between = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
const inCoverBand = n => between(n, .9, 1.1) || between(n, 1.6, 1.85);
const pair = (a, b) => [a, b].sort().join('|');
const ids = new Set(graph.nodes.map(node => node.id));
const edges = new Map();
const adjacency = new Map([...ids].map(id => [id, []]));

for (const e of graph.edges) {
  check(ids.has(e.a) && ids.has(e.b) && e.a !== e.b, '图边端点无效 ' + JSON.stringify(e));
  check(Number.isFinite(e.lengthM) && e.lengthM > 0, '边长无效 ' + pair(e.a,e.b));
  const key = pair(e.a,e.b);
  check(!edges.has(key), '重复物理边 ' + key);
  edges.set(key,e);
  adjacency.get(e.a).push([e.b, e]);
  adjacency.get(e.b).push([e.a, e]);
}
check(ids.size === graph.nodes.length && ids.has(graph.entry) && ids.has(graph.focus) && graph.entry !== graph.focus, '图节点与端点');
function along(nodes) {
  check(Array.isArray(nodes) && nodes.length > 1 && new Set(nodes).size === nodes.length, '路线必须是简单路径 '+JSON.stringify(nodes));
  return nodes.slice(1).map((b,i) => {
    const e = edges.get(pair(nodes[i],b));
    check(e && (e.bidirectional || e.a === nodes[i]), '路径穿越不存在的边 '+nodes[i]+' → '+b);
    return e;
  });
}
// Shortest walk after removing one physical connection, including both of its directions.
function distances(start, removed) {
  const result = new Map([[start,0]]);
  const pending = new Set([start]);
  while (pending.size) {
    const current = [...pending].reduce((a,b) => result.get(a) <= result.get(b) ? a : b);
    pending.delete(current);
    for (const [next, e] of adjacency.get(current)) {
      if (e === removed || (!e.bidirectional && e.a !== current)) continue;
      const distance = result.get(current) + e.lengthM;
      if (distance >= (result.get(next) ?? Infinity)) continue;
      result.set(next, distance);
      pending.add(next);
    }
  }
  return result;
}
let failures = 0;
function run(label, fn) {
  try {
    const info = fn();
    console.log('PASS '+label+(info ? ' · '+info : ''));
  } catch (err) {
    failures++;
    console.error('FAIL '+label+' · '+err.message);
  }
}
const families = 'traversal cover sightline gate vertical stealth lure empty_threat frontline pacing extraction streaming'.split(' ');
const channels = 'height_band cover_density light sound silhouette texture_wear door_state'.split(' ');
run('§4.2/01 四要素及分幕', () => {
  check(between(mechanisms.length,6,12), '机制总数应为 6–12');
  check(new Set(mechanisms.map(m=>m.id)).size===mechanisms.length, '机制 ID 重复');
  for (const m of mechanisms) {
    check(hasText(m.id) && hasText(m.verb) && m.cost && m.read && Array.isArray(m.acceptance) && m.acceptance.length && m.acceptance.every(hasText), m.id+' 缺少四要素');
  }
});
run('§4.2/02 机制族', () => {
  for (const m of mechanisms) check(families.includes(m.family),m.id+' '+m.family);
  for(const family of families){
    const members=mechanisms.filter(m=>m.family===family);
    check(members.length <= (family==='empty_threat'?1:2),family+' 重复过多');
    if(members.length===2) check(JSON.stringify(members[0].params)!==JSON.stringify(members[1].params),family+' 重复使用同一组参数');
  }
});
run('§4.2/03 代价', () => {
  for(const m of mechanisms) check(['time','noise','exposure','resource','irreversibility'].includes(m.cost.type),m.id);
});
run('§4.2/04 可读性', () => {
  for(const m of mechanisms) check(channels.includes(m.read.channel) && typeof m.read.noUi==='boolean' &&
    hasText(m.read.noUi ? m.read.telegraph : m.read.uiReason),m.id);
});
run('§4.2/05 原型目录', () => {
  for(const m of mechanisms.filter(m=>['traversal','cover'].includes(m.family)))check(catalogue.has(m.space.prefab),m.id+' '+m.space.prefab);
});
run('§4.2/06 + A3 掩体高度', () => {
  check(spec.cover.length > 0,'掩体清单为空');
  for(const c of spec.cover)check(inCoverBand(c.heightM)&&catalogue.has(c.prefab),c.id+' '+c.heightM);
  for(const m of mechanisms.filter(m=>m.family==='cover'))check(inCoverBand(m.params.heightM),m.id);
});
run('§4.2/07 净宽与落点', () => {
  for(const m of mechanisms.filter(m=>m.family==='traversal')){
    check(Number.isFinite(m.params.clearW)&&m.params.clearW>=1.2&&Number.isFinite(m.params.landingDepth)&&m.params.landingDepth>=.8,m.id);
  }
});
run('§4.2/08 节奏', () => {
  for(const a of spec.arc)check(['setup','develop','turn','resolution'].includes(a.intent)&&between(a.tempo,0,1),'幕 '+a.act);
  const t=spec.arc.map(a=>a.tempo);
  check(Math.max(...t)>=.75&&Math.min(...t)<=.35,'节奏阈值');
  return t.join(' → ');
});
run('§4.2/09 + A2 三条边不相交路线', () => {
  const routes=graph.routes, shared=new Set();
  check(routes.length===3 && graph.edgeDisjointPaths>=3,'缺路线');
  for(const type of ['stealth','vertical','retreat']){
    const r=routes.find(r=>r.type===type);
    check(r && r.nodes[0]===graph.entry && r.nodes.at(-1)===graph.focus,type+' 端点');
    for(const e of along(r.nodes)){
      check(!shared.has(e),type+' 重叠 '+pair(e.a,e.b));
      shared.add(e);
    }
  }
});
run('A1 任一物理边失效后全图仍连通', () => {
  for(const e of edges.values())check(distances(graph.entry,e).size===ids.size,pair(e.a,e.b)+' 是桥');
  return ids.size+' 个节点 / '+edges.size+' 次逐边删除';
});
run('§4.2/10 + A5 双向通行与落差回程', () => {
  check(graph.hasBackgate===false,'存在 backgate');
  for(const e of edges.values()){
    if(e.kind==='drop'){
      check((distances(e.b,e).get(e.a)??Infinity)<=40,'下落缺少独立回程 '+pair(e.a,e.b));
    }else check(e.bidirectional===true,'单向边 '+pair(e.a,e.b));
  }
});
run('§4.2/11 观景点', () => {
  check(graph.vantages.length>=1,'缺少 vantage');
  for(const v of graph.vantages)check(ids.has(v.node)&&['overview','observe','plan','execute','reward'].every(k=>hasText(v[k])),v.node);
});
run('§4.2/12 + A6 规格预算', () => {
  const {tri,interactables,vehicles}=spec.budget;
  check(between(tri,0,350000)&&between(interactables,0,25)&&between(vehicles,0,6),'预算越界');
  return [tri,interactables,vehicles].join(' / ');
});
run('A4 主路径断点', () => {
  const s=spec.sightline, points=s.samplesM;
  const length=along(s.route).reduce((total,e)=>total+e.lengthM,0);
  check(points.length>=2&&points[0]===0&&Math.abs(points.at(-1)-length)<.01,'采样里程未覆盖整条路线');
  const gaps=points.slice(1).map((d,i)=>d-points[i]);
  check(gaps.every(d=>Number.isFinite(d)&&d>0),'里程须递增');
  const count=gaps.filter(d=>between(d,8,12)).length;
  check(count/gaps.length>=.8,'8–12 m 区间比例不足');
  return count+'/'+gaps.length+' 段，最长 '+Math.max(...gaps)+' m';
});
run('A7 区域撤离步行尾段', () => {
  check(spec.extraction.length>0,'缺撤离点');
  const results=[];
  for(const ex of spec.extraction){
    const route=along(ex.nodes);
    const distance=route.reduce((sum,e)=>sum+e.lengthM,0);
    check(ex.mode==='V0'&&route.every(e=>e.mode==='V0')&&between(distance,150,200),ex.id+' '+distance+' m');
    results.push(ex.id+' '+distance+' m');
  }
  return results.join(' / ');
});

run('机制卡分幕与常量注册', () => {
  const assigned = new Set();
  for (const act of spec.arc) {
    check(between(act.mechanismIds.length,2,5),'每幕 2–5 卡：'+act.act);
    for(const id of act.mechanismIds){
      const card=mechanisms.find(m=>m.id===id);
      check(card && card.act===act.act && !assigned.has(id),'机制归属 '+id);
      assigned.add(id);
    }
    assert.deepEqual(spec.constants[act.tempoRef]?.value,act.tempo);
    assert.deepEqual(spec.constants[act.durationRef]?.value,act.durationS);
  }
  check(assigned.size===mechanisms.length,'有机制未进入分幕');
  for (const [id,c] of Object.entries(spec.constants)){
    check(['E1','E2','E3'].includes(c.evidence)&&hasText(c.source),'缺来源 '+id);
    if(c.evidence==='E3')check(hasText(c.calibration),'缺校准方法 '+id);
  }
  for(const m of mechanisms){
    assert.equal(spec.constants[m.cost.ref]?.value,m.cost.value,m.id+' 代价常量');
    check(ids.has(m.space.node),m.id+' 节点不存在');
  }
  for(const e of edges.values())assert.equal(spec.constants[e.lengthRef]?.value,e.lengthM,pair(e.a,e.b)+' 长度常量');
  for(const c of spec.cover){
    assert.equal(spec.constants[c.heightRef]?.value,c.heightM,c.id+' 高度常量');
    check(c.retreatNodes.length>0&&c.retreatNodes.every(n=>ids.has(n)),c.id+' 缺退路节点');
  }
  return mechanisms.length+' 张卡';
});
run('线索指向与 100 次乱序回程模型', () => {
  const {clues,rejoin}=spec.breadcrumbs, speed=spec.constants['LV-新增-FS-WALK-SPEED']?.value;
  check(ids.has(rejoin)&&between(clues.length,3,5)&&speed>0,'线索清单/合流点/步速');
  const byId=new Map(clues.map(c=>[c.id,c]));
  const seen=new Set(), targets=new Set(clues.map(c=>c.next));
  let clue=clues.find(c=>!targets.has(c.id));
  while(clue){
    check(!seen.has(clue.id) && ids.has(clue.node) && hasText(clue.spatial),'线索循环或缺少空间提示');
    seen.add(clue.id);
    if(clue.next===null){check(clue.target===rejoin,'末环脱离主路线');break;}
    const next=byId.get(clue.next);
    check(next && clue.target===next.node,'线索未指向下一环');
    clue=next;
  }
  check(seen.size===clues.length,'缺线索或指向断裂');
  let seed=1729, longest=0;
  const orders=new Set();
  for(let run=0;run<100;run++){
    const order=[...clues];
    for(let i=order.length-1;i>0;i--){
      seed=(Math.imul(1664525,seed)+1013904223)>>>0;
      const j=Math.floor(seed/0x100000000*(i+1));
      [order[i],order[j]]=[order[j],order[i]];
    }
    orders.add(order.map(c=>c.id).join('-'));
    let pos=graph.entry;
    for(const c of order){
      check(distances(pos).has(c.node),'乱序不可达 '+c.id);
      pos=c.node;
    }
    const seconds=distances(pos).get(rejoin)/speed;
    check(Number.isFinite(seconds)&&seconds<=90,'回程估计超时');
    longest=Math.max(longest,seconds);
  }
  return '100/100；'+orders.size+' 种顺序；理想步行最长 '+longest.toFixed(1)+' s';
});
if(failures)process.exitCode=1;


