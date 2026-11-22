// Additional prototype data. These values are not attributed to the original game.
export const CFG={
  navigation:{cell:.75,halfCells:22,maxExpansions:2500,expansionsPerTick:32,repathSteps:30},
  skin:0.005,wallFriction:0.92,postureSeconds:0.18,gravity:9.81,
  arenaHalf:18,health:100,playerSpawn:[0,0,-6],enemyCount:8,
  meleeRange:1.45,meleeHalfAngle:35,attackGapSteps:15,executionSteps:72,
  dodgeSpeed:4.2,proneHeight:0.55,proneSpeed:0.16,
  weapon:{damage:34,magazine:8,reserve:40,reloadSteps:90,reloadByWeapon:{rifle:108,sniper:150},intervalSteps:15,range:60},
  medkit:{heal:55,steps:150,count:2},throwable:{damage:65,radius:3.5,fuseSteps:90,count:3},
  obstacles:[
    {id:'west',min:[-18,0,-18],max:[-17,4,18]},
    {id:'east',min:[17,0,-18],max:[18,4,18]},
    {id:'north',min:[-18,0,17],max:[18,4,18]},
    {id:'south',min:[-18,0,-18],max:[18,4,-17]},
    {id:'table',min:[-5,0,0],max:[-2,0.9,1.2]},
    {id:'cover',min:[2,0,2],max:[6,1.15,3]},
    {id:'vault',min:[-1,0,7],max:[1,1.1,7.5]},
    {id:'wall',min:[-8,0,5],max:[-7,3,12]},
    {id:'step',min:[7,0,-3],max:[10,0.44,0]},
    {id:'climb',min:[9,0,4],max:[12,1.9,7]},
    {id:'ceiling',min:[-5,1.55,-8],max:[-1,2.1,-4]},
  ],
  moves:{
    light:{id:'atk_light_01',clip:'Punch_Jab',bone:'hand_l',sourceActive:[.17,.23],windupMs:260,activeMs:90,recoveryMs:300,damage:22,poiseDamage:20,hitstopMs:60},
    light2:{id:'atk_light_02',clip:'Punch_Cross',bone:'hand_r',sourceActive:[.27,.33],windupMs:260,activeMs:90,recoveryMs:300,damage:22,poiseDamage:20,hitstopMs:60},
    heavy:{id:'atk_heavy_01',clip:'Sword_Attack',bone:'hand_r',sourceActive:[.4,.47],windupMs:420,activeMs:110,recoveryMs:460,damage:38,poiseDamage:40,hitstopMs:100},
  }
};
