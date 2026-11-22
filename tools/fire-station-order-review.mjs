/* A single fictional contract evaluated as design data, independent of the game. */
import assert from 'node:assert/strict';

const initial = () => ({
  status: 'active', intel: false, protectedIntel: false, scouted: false,
  selected: null, running: false, verified: null, noiseEvents: 0, cart: 'empty',
  owner: null, gate: 'half', position: 'bay', bridge: false, delivery: 'none', installed: false,
  inventory: 0, engineeringCredit: 0, scoutCredit: 0,
});
function act(s, verb, arg) {
  if (verb === 'install') {
    if (arg === 'materials' && s.delivery === 'settled' && !s.installed && s.inventory === 1) {
      s.inventory--; s.installed = true; s.engineeringCredit++;
    }
    return;
  }
  if (s.status !== 'active') return;
  switch (verb) {
    case 'document': s.intel = true; s.scouted = true; break;
    case 'secure': if (arg === 'ordinaryIntel' && s.intel) s.protectedIntel = true; break;
    case 'select':
      if (s.cart === 'empty' && s.delivery === 'none') {
        s.selected = arg; s.running = false; s.verified = null;
      }
      break;
    case 'test': if (s.selected && !s.running && s.cart === 'empty') { s.running = true; s.noiseEvents++; } break;
    case 'abort': s.running = false; break;
    case 'finish':
      if (s.running && s.selected === 'working') s.verified = s.selected;
      s.running = false; break;
    case 'load':
      if (s.verified && s.cart === 'empty' && s.owner === null && s.delivery === 'none') s.cart = 'loaded';
      break;
    case 'push': if (s.cart === 'loaded' && s.owner === null) s.owner = arg; break;
    case 'release': if (s.owner === arg) s.owner = null; break;
    case 'open': s.gate = 'full'; break;
    case 'close': if (s.position !== 'threshold' && !s.bridge) s.gate = 'half'; break;
    case 'cross': if (s.gate === 'full' && s.owner === arg) s.position = 'threshold'; break;
    case 'clear': if (s.owner === arg && s.position === 'threshold') s.position = 'apron'; break;
    case 'detour': if (s.owner === arg && s.position === 'bay') s.position = 'apron'; break;
    case 'dock': if (s.gate === 'full' && s.position === 'apron') s.bridge = true; break;
    case 'handover':
      if (s.position === 'apron' && s.bridge && s.owner === arg && s.delivery === 'none') {
        s.delivery = 'pending'; s.cart = 'empty'; s.owner = null; s.bridge = false;
      }
      break;
    case 'extract':
      if (s.delivery === 'pending') { s.delivery = 'settled'; s.inventory++; }
      if (s.scouted) s.scoutCredit++;
      s.status = 'extracted'; break;
    case 'die':
      s.intel = s.protectedIntel; s.delivery = 'failed'; s.status = 'lost'; break;
    default: throw Error('未知动作 ' + verb);
  }
}
const run = (actions, s=initial()) => {
  for (const step of actions) act(s, ...step.split(':'));
  return s;
};
const load = ['select:working','test','finish','load'];
const handoff = [...load,'push:A','open','cross:A','clear:A','dock','handover:A'];
const tests = [
  ['普通情报可保；调查收益仅在撤离后入账', () => {
    const s=run(['document','secure:ordinaryIntel','die','extract']);
    assert.equal(s.intel,true); assert.equal(s.scoutCredit,0);
    assert.equal(run(['document','extract','extract']).scoutCredit,1);
  }],
  ['关键货物不能存安全箱', () => assert.equal(run([...load,'secure:pump','die']).protectedIntel,false)],
  ['坏泵和中断都不能装货；重试产生新的噪声', () => {
    const s=run(['select:damaged','test','finish','load','select:working','test','abort','finish','load']);
    assert.equal(s.cart,'empty'); run(['test','finish','load'],s);
    assert.equal(s.cart,'loaded'); assert.equal(s.noiseEvents,3);
  }],
  ['推车独占、松手可接管；半开门不能交货', () => {
    const s=run([...load,'push:A','push:B','release:B','cross:B','handover:B']);
    assert.equal(s.owner,'A'); assert.equal(s.delivery,'none');
    run(['release:A','push:B','cross:B','handover:B'],s); assert.equal(s.owner,'B'); assert.equal(s.delivery,'none');
  }],
  ['占门时禁止下降，重复交接只发一次', () => {
    const s=run([...load,'push:A','open','cross:A','close']); assert.equal(s.gate,'full');
    run(['clear:A','dock','handover:A','handover:A','install:materials'],s); assert.equal(s.inventory,0); assert.equal(s.engineeringCredit,0);
    run(['extract','extract'],s); assert.equal(s.inventory,1);
    run(['install:empty'],s); assert.equal(s.engineeringCredit,0);
    run(['install:materials','install:materials'],s); assert.equal(s.inventory,0); assert.equal(s.engineeringCredit,1);
  }],
  ['无人持车时门槛仍被占用，旁门绕行后仍需装载桥', () => {
    const s=run([...load,'push:A','open','cross:A','release:A','close']); assert.equal(s.gate,'full');
    const other=run([...load,'push:B','detour:B','dock','handover:B']); assert.equal(other.delivery,'none');
    run(['open','dock','handover:B'],other); assert.equal(other.delivery,'pending');
  }],
  ['交货后阵亡不算运输成功', () => {
    const s=run([...handoff,'die','extract','install:materials']);
    assert.equal(s.inventory,0); assert.equal(s.engineeringCredit,0);
  }],
];
for(const [name, check] of tests){check(); console.log('✓ '+name);}
