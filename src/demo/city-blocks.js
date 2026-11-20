// Infill is limited to the perimeter of the four documented streets.
export function addCityBlocks({box,prop,canGrow,sites,occupied}){
 const rows=[
  // firehouse rear/service street and its west-side neighbours
  [377,1183,5,14,1,2],[365,1205,3,13,1,1],
  // retail strip and its facing row, with breaks at the lane mouths
  [434,1244,5,14,1,1],[465,1270,5,14,-1,2],
  // side streets facing the monorail terminus
  [822,1120,8,16,1,4],[838,1181,7,15,-1,3],
  // south approach: second rank of flats and western end of the street
  [813,1221,17,16,1,4],[814,1312,17,16,-1,3],
  [810,1299,13,17,-1,3]
 ];
 const footprints=[...occupied];
 let placed=0;
 for(const [row,[x0,z0,count,pitch,face,baseFloors]] of rows.entries()){
  for(let i=0;i<count;i++){
   if((i+row)%8===6)continue;
   const seed=i*11+row*7,x=x0+i*pitch,z=z0+Math.sin(seed)*1.5;
   const w=pitch-2-(seed%3)*.65,d=8+(seed%4),h=(baseFloors+seed%3)*3.25;
   const radius=Math.hypot(w,d)*.5+1.6;
   if(!canGrow(x,z,radius)||sites.some(p=>Math.hypot(x-p.x,z-p.y)<radius+8))continue;
   if(footprints.some(([bx,bz,bw,bd])=>Math.abs(x-bx)<(w+bw)/2+1.2&&Math.abs(z-bz)<(d+bd)/2+1.2))continue;
   footprints.push([x,z,w,d]);placed++;
   const wall=['brick','wall','brick','layers'][seed%4],front=z+face*(d*.5+.07),angle=face>0?0:Math.PI;
   box(x,h/2,z,w,h,d,wall);
   box(x,h+.11,z,w+.46,.23,d+.46,'stone');
   box(x-w*.18,h+.5,z+.6,1.4,.8,1.05,'iron');
   const bays=Math.max(2,Math.floor(w/3.2));
   for(let floor=0;floor*3.25<h;floor++)for(let k=0;k<bays;k++){
    const xx=x-w*.5+(k+.5)*w/bays,y=floor*3.25;
    const door=floor===0&&k===seed%bays;
    box(xx,y+(door?1.25:1.9),front,door?1.55:1.63,door?2.5:1.72,.095,door?'doors':'glass');
    box(xx,y+(door?2.55:.98),front+face*.09,1.88,.12,.22,'stone');
    if((seed+k+floor)%7===0&&!door){
     box(xx,y+1.65,front+face*.13,1.64,.25,.1,'wood',0,0,.13);
    }else if(floor<2&&(door||(seed+k+floor)%3===0)){
     const part=door?'door_centered_small_01':seed%2?'window_centered_double_01':'window_centered_large_02';
     prop('modular_urban_apartments_facade:'+part,xx,y+.05,front+face*.115,.86,angle);
    }
   }
   // A few projecting shop canopies interrupt the street's continuous parapet.
   if(seed%3===0)box(x,2.73,front+face*.57,w*.72,.15,1.22,'roof',face*.12);
   if(seed%4===1)box(x+w*.36,h+.64,z-d*.26,.62,1.2,.75,'brick');
  }
 }
 return placed;
}
