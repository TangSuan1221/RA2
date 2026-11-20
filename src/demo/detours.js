const sites = [
  ['150,930', '渡口划船往返（低潮）', '上船试航', 'boat'],
  ['760,440', 'N01 中桥控制室', '切换中桥桥面', 'bridge'],
  ['1680,440', 'N03 低桥联动台', '切换低桥清障', 'clear'],
  ['1220,816', '太空针入口（步行）', '检查核心区供电', 'tower'],
  ['1680,160', '北端空投场', '接收广播补给', 'supply'],
  ['430,1330', '先锋地下城（步行）', '检查旧街入口', 'inspect'],
  ['870,1160', '摩天楼单轨终点', '检查换乘点', 'inspect']
];

export function detours(panel, nodes, onChange) {
  const label = document.createElement('label');
  const select = document.createElement('select');
  label.append('导航目的地 ', select);
  select.add(new Option('撤离任务', ''));
  for (const [id, title] of sites) {
    if (nodes[id]) select.add(new Option(title, id));
  }
  panel.append(label);
  select.onchange = onChange;
  return {
    lock(active){select.disabled=active;},
    resume(){select.value='';select.disabled=false;},
    get selected() {return sites.find(([id]) => id === select.value);},
    interact(phase, flags) {
      const site = this.selected;
      let message;
      switch (site[3]) {
        case 'bridge':
        case 'clear': {
          const input = flags.querySelector('[data-flag="' + site[3] + '"]');
          input.click();
          message = site[3] === 'bridge' ? (input.checked ? '中桥已升起。' : '中桥已放下。') : (input.checked ? '低桥已清障。' : '低桥已封闭。');
          break;
        }
        case 'tower': message = phase >= 5 ? '塔区已恢复供电。' : '塔区停电，变电站可以恢复供电。'; break;
        case 'supply': message = phase >= 4 ? '频率已核对，领取应急补给。' : '缺少空投频率，请先前往广播站。'; break;
        default: message = site[1] + '已抵达。';
      }
      select.value = '';
      return message;
    }
  };
}
