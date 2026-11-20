export function corridorSidewalks({box,tree,prop,sign,frontages}){
 const first=806,last=1090,step=2,crossing=943;
 for(const side of [-1,1]){
  const kerb=1280+side*8.14;
  for(let x=first+1;x<last;x+=step){
   const d=Math.abs(x-crossing);
   const top=.09+.15*Math.min(1,Math.max(0,(d-2)/4));
   const slope=d>2&&d<6?Math.sign(x-crossing)*.0375:0;
   box(x,top/2,kerb,step-.018,top,.28,'layers',0,0,slope);
   box(x,top/2,kerb+side*1.02,step-.012,top-.006,1.78,'layers',0,0,slope);
   box(x,.114,kerb+side*2.96,step-.015,.228,2.05,'layers');
  }
  // Tree beds sit beyond the walking strip and leave the curb ramps clear.
  for(const x of (side<0?[850,911,969,1025,1071]:[832,903,962,1039])){
   const z=kerb+side*5.03;
   box(x,.105,z,3.3,.21,1.96,'soil');
   for(const end of [-1,1])box(x+end*1.69,.14,z,.13,.28,2.18,'layers');
   for(const edge of [-1,1])box(x,.14,z+edge*1.04,3.5,.28,.13,'layers');
   tree(x,z,4.5+(x%5)*.62);
  }
 }
 for(const [x,z,w,d] of frontages){
  const face=z<1280?z+d/2:z-d/2,walkEdge=z<1280?1267.9:1292.1;
  const depth=Math.abs(face-walkEdge);
  if(depth>.35&&depth<24)box(x,.095,(face+walkEdge)/2,w-.16,.19,depth,'layers');
 }
 // Bay opening faces the roadway. Freestanding posts and bench leave a walk-through behind.
 const x=956,z=1266.8;
 box(x,.135,z,5.8,.27,2.65,'layers');
 for(const end of [-1,1])for(const edge of [-1,1])box(x+end*2.4,1.54,z+edge*.91,.09,2.66,.09,'iron');
 box(x,2.95,z,5.49,.16,2.39,'roof',.055);box(x,1.67,z-.93,4.72,1.95,.05,'glazing');
 box(x,.75,z-.38,3.9,.16,.57,'wood');for(const end of [-1,1])box(x+end*1.49,.42,z-.38,.11,.55,.39,'iron');
 box(x+2.62,1.6,z+1.17,.09,2.94,.09,'iron');sign(x+2.62,2.78,z+1.26,'BUS  21',.88,.49);
 prop('metal_trash_can',x-3.1,.16,z+1,.97,.2);
 for(let z=1272.8;z<=1287.4;z+=1.36)box(crossing,.111,z,4.2,.012,.59,'crosswalk');
}
