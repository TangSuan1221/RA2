export const pedestrianHead=2.54;
export const publicEntranceHead=2.84;
export const isPedestrianHead=y=>y===pedestrianHead || y===publicEntranceHead;

export function stationWalls(emit){
function facade(axis,fixed,start,end,base,top,openings=[]){
  function piece(a,b,lo,hi){
    if(b<=a||hi<=lo)return;
    const mid=(a+b)/2,h=hi-lo;
    const x=axis==='x'?mid:fixed,z=axis==='x'?fixed:mid;
    const id=['wall',axis,fixed,a,b,lo,hi].join('/');
    emit(id,x,lo,z,b-a,h,axis==='x'?0:90);
  }
  let cursor=start;
  for(const [left,right,sill,head] of openings){
    piece(cursor,left,base,top);piece(left,right,base,sill);piece(left,right,head,top);cursor=right;
  }
  piece(cursor,end,base,top);
}
const door=(center,width=1.8,height=pedestrianHead)=>[center-width/2,center+width/2,0,height];
const X=(z,a,b,holes=[],h=3.5)=>facade('x',z,a,b,0,h,holes);
const Z=(x,a,b,holes=[],h=3.5)=>facade('z',x,a,b,0,h,holes);
const win=c=>[c-.8,c+.8,.75,2.6];
X(-10.5,-21,18.25,[win(-16),win(-7.5),door(.25,1.5),win(4),door(7.5),win(14)]);
Z(-21,-10.5,-3.75,[win(-7)]);
Z(-21,-3.75,10.5,[win(0),win(7)],6.2);
X(-3.75,-21,-6,[door(-19),door(-13,2.2)],6.2);
X(10.5,-21,-6,[door(-13,12,4.5)],6.2);
Z(-6,-10.5,-3.75);
Z(-6,-3.75,10.5,[door(3)],6.2);
Z(-1,-10.5,10.5,[door(-8.2),door(-5),door(2),door(7.6)]);
X(-6.25,-6,-1); X(.75,-6,-1);
X(10.5,-6,10,[win(-3.5),door(.25,1.5),win(5)]);
Z(1.5,-10.5,10.5,[door(-5),door(-1.7),door(3),door(6.4)]);
X(-3.75,1.5,18.25,[door(11.5)]);
Z(10,-10.5,-3.75,[[-8.6,-8.1,.65,2.2],[-8.1,-5.7,0,2.7],[-5.7,-5.2,.9,2.2]]);
Z(18.25,-10.5,-3.75,[win(-6.5)]);
X(-3.75,18.25,20.75);
Z(20.75,-3.75,8.5,[win(0),win(6)]);
Z(12.75,-3.75,1.4,[door(-2)]);
X(1.4,12.75,20.75);
X(.75,1.5,10); X(4.25,1.5,10);
Z(10,-3.75,10.5,[door(2.3),door(6.4)]);
X(8.5,10,20.75,[door(14,2.4,publicEntranceHead),win(18.8)]);
}
