import * as T from 'three';

export function addVerges(group){
 let seed=826;
 const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 const positions=[],colors=[];
 for(let i=0;i<24;i++){
  const a=rand()*Math.PI*2,r=.16*Math.sqrt(rand()),x=Math.cos(a)*r,z=Math.sin(a)*r;
  const width=.009+.017*rand(),height=.12+.33*rand(),bend=.06+rand()*.16;
  const u=Math.cos(a)*width,v=Math.sin(a)*width,dx=-Math.sin(a)*bend,dz=Math.cos(a)*bend;
  positions.push(x-u,0,z-v,x+u,0,z+v,x+dx*.4+u*.6,height*.62,z+dz*.4+v*.6,
   x-u,0,z-v,x+dx*.4+u*.6,height*.62,z+dz*.4+v*.6,x+dx*.4-u*.6,height*.62,z+dz*.4-v*.6,
   x+dx*.4-u*.6,height*.62,z+dz*.4-v*.6,x+dx*.4+u*.6,height*.62,z+dz*.4+v*.6,x+dx,height,z+dz);
  const base=new T.Color(i%6?0x59613b:0x87734e),tip=new T.Color(i%6?0x9b9b63:0xc1a773);
  for(const t of [0,0,.62,0,.62,.62,.62,.62,1])colors.push(...base.clone().lerp(tip,t).toArray());
 }
 const grass=new T.BufferGeometry();grass.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 grass.setAttribute('color',new T.Float32BufferAttribute(colors,3));grass.computeVertexNormals();
 const stone=new T.IcosahedronGeometry(1,0);
 const materials=[new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:1}),new T.MeshStandardMaterial({color:0x736f60,roughness:.96})];
 const cells=new Map(),dummy=new T.Object3D();
 function scatter(x,z,y,s,kind){
  const cx=Math.floor(x/12)*12+6,cz=Math.floor(z/12)*12+6,key=[cx,cz,kind].join(',');
  if(!cells.has(key))cells.set(key,{cx,cz,kind,items:[]});
  dummy.position.set(x,y,z);dummy.rotation.set(0,rand()*6.28,0);
  dummy.scale.set(s*(.8+rand()*.5),s*(kind?.34:.7+rand()*.85),s*(.75+rand()*.5));dummy.updateMatrix();cells.get(key).items.push(dummy.matrix.clone());
 }
 function strip(x,z,length,angle,base,scale=1){
  const dx=Math.cos(angle),dz=Math.sin(angle);
  for(let along=0;along<length;along+=.65+rand()*1.7){
   if(rand()<.16)continue;
   const n=4+Math.floor(rand()*12),spread=.23+rand()*.52;
   for(let i=0;i<n;i++){
    const u=along+(rand()-.5)*1.65,v=(rand()-.5)*spread;
    const px=x+u*dx-v*dz,pz=z+u*dz+v*dx;
    if(rand()<.12)scatter(px,pz,base,.035+rand()*.11,1);
    else scatter(px,pz,base,(.3+rand()*.84)*scale,0);
   }
  }
 }
 strip(241,1804.9,41,0,.146);strip(241,1815.1,43,0,.146);
 strip(268.1,1802.7,9.5,0,.06,.84);strip(251.4,1801.4,9,0,.05,.76);
 strip(248.5,1816.65,28,0,.06,1.16);
 strip(409,1205.6,5.3,0,.09,.67);strip(429,1205.6,4.3,0,.09,.68);
 strip(434,1254.2,16,0,.055,.72);strip(899,1267,28,0,.08,.88);
 const batches=[];
 for(const {cx,cz,kind,items} of cells.values()){
  const mesh=new T.InstancedMesh(kind?stone:grass,materials[kind],items.length);
  items.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.computeBoundingSphere();mesh.receiveShadow=true;
  group.add(mesh);batches.push({cx,cz,mesh});
 }
 return position=>{for(const {cx,cz,mesh} of batches)mesh.visible=(cx-position.x)**2+(cz-position.z)**2+position.y**2<85**2;};
}
