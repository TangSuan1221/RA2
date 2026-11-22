export const toolNames={Knife:'短刀',Hands:'徒手',Axe:'斧头',Bat:'球棒'};
export function pairIds(tool='Knife'){
  const suffix=tool==='Knife'?'':'_'+tool;
  return ['Player_StealthKill'+suffix,'Enemy_StealthVictim'+suffix];
}
