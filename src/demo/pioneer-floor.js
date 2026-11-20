export const pioneerBounds={left:412,right:453,north:1285,south:1357};
export function pioneerFloor(x,z){
 const {left,right,north,south}=pioneerBounds;
 const depth=Math.min((x-left)/12,(right-x)/12,(z-north)/18,(south-z)/18);
 return -3.65*Math.max(0,Math.min(1,depth));
}
export const courtSteps={x:430.25,width:3.58,z:1330.4,run:.80,count:17};
export function courtTreadHeight(index){
 const z=courtSteps.z+index*courtSteps.run;
 const rise=index*.103;
 return Math.max(pioneerFloor(courtSteps.x,z)+.05,-3.60+rise);
}
export function stairLevel(x,z,fromHeight){
 const floor=pioneerFloor(x,z);
 const nearIndex=Math.round((z-courtSteps.z)/courtSteps.run);
 if(Math.abs(x-courtSteps.x)<=courtSteps.width/2&&nearIndex>=0&&nearIndex<courtSteps.count)return courtTreadHeight(nearIndex);
 if(Math.abs(x-courtSteps.x)<=courtSteps.width/2&&z>=1343.6&&z<=1347.7)return Math.max(floor,courtTreadHeight(courtSteps.count-1));
 const connected=(height)=>fromHeight===undefined||Math.abs(height-fromHeight)<.61;
 if(x>=435.75&&x<=437.75&&z>=1302.595&&z<=1310.43){
  const step=Math.max(0,Math.min(16,Math.round((1310.2-z)/.46))),h=-3.65+.17+step*.205;
  if(connected(h))return h;
 }
 if(x>=435.62&&x<=438.02&&z>=1298.2&&z<=1302.615&&connected(.055))return .055;
 if(x>=425.54&&x<=427.06&&z>=1338.18&&z<=1353.13){
  const k=Math.max(0,Math.min(17,Math.round((z-1338.6)/.83)));
  return pioneerFloor(426.3,1338.6+k*.83)+.18;
 }
 if(x>=431.28&&x<=433.33&&z>=1286.42&&z<=1303.44){
  const k=Math.max(0,Math.min(19,Math.round((1303-z)/.85)));
  return pioneerFloor(432.3,1303-k*.85)+.195;
 }
 return floor;
}
export function onPioneerWalk(x,z){
 return (x>=425.5&&x<=437.8&&z>=1328&&z<=1353.2)||(x>=431.2&&x<=433.4&&z>=1286&&z<=1328)||(x>=435.61&&x<=438.04&&z>=1298.2&&z<=1328.4);
}

