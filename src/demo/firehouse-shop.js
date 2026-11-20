import {MeshStandardMaterial, PlaneGeometry} from 'three';

// The workshop shares a party wall with the white annex. Its open street bay
// uses full-depth shelves so its contents still read from the driver's seat.
export function firehouseShop({box,addGeo,prop,materials,texture}){
  const left=439.94,width=10.65,front=1206.25,center=left+width/2;
  for(const [name,file] of [['salvageWindow','salvage-sash'],['salvageTransom','salvage-shopfront']]){
    materials[name]=new MeshStandardMaterial({
      map:texture('evac-art/'+file+'.webp',true),roughness:.47,metalness:.12
    });
  }
  box(center,7.5,front-5.9,width,8.5,11.8,'brick');
  box(center,11.79,front-5.9,width+.14,.18,11.95,'annexRoof');
  for(const edge of [-1,1]){
    box(center+edge*(width/2-.24),1.72,front-.85,.48,3.44,1.7,'brick');
    box(center+edge*width/2,11.93,front-5.9,.10,.26,11.95,'layers');
  }
  box(center,1.67,front-1.12,width,3.34,.19,'shadow');
  box(center,3.32,front+.025,width,.28,.26,'iron');
  addGeo(new PlaneGeometry(width-.8,.48),'salvageTransom',center,3.67,front+.16);
  for(const y of [5.56,9.20]){
    for(let col=0;col<4;col++){
      const x=left+1.68+col*2.42;
      box(x,y,front+.01,1.57,2.4,.17,'iron');
      addGeo(new PlaneGeometry(1.38,2.20),'salvageWindow',x,y,front+.105);
      box(x,y-1.2,front+.12,1.74,.13,.34,'stone');
    }
  }
  for(let i=0;i<3;i++){
    const x=left+1.7+i*3.25;
    prop('painted_wooden_shelves',x,0,front-.36,1,0);
    prop(i===1?'metal_jerrycan':'wooden_crate_01',x+.54,.06,front+.51,.86,i*.27);
  }
  for(let i=0;i<5;i++)
    prop('plastic_crate_01',left-2.65+i*.61,.07,front+.35+(i%2)*.32,.97,.13*i);
}
