import * as T from 'three';

// Keep the individual wall objects for ray queries and collision while submitting
// stationary wall faces to the renderer once per finish.
export function batchWalls(scene, meshes) {
  const batches=new Map();
  scene.updateMatrixWorld(true);
  for(const [id,wall] of meshes){
    if(!id.startsWith('wall/') || !wall.visible)continue;
    const geometry=wall.geometry.clone().applyMatrix4(wall.matrixWorld);
    const spans=Array.isArray(wall.material)?geometry.groups:[{start:0,count:geometry.index?.count??geometry.attributes.position.count}];
    for(const span of spans){
      const material=Array.isArray(wall.material)?wall.material[span.materialIndex]:wall.material;
      if(!batches.has(material))batches.set(material,{position:[],normal:[],uv:[]});
      const batch=batches.get(material);
      for(let i=span.start;i<span.start+span.count;i++){
        const k=geometry.index?geometry.index.getX(i):i;
        for(const name of Object.keys(batch)){
          const a=geometry.attributes[name];
          batch[name].push(a.getX(k),a.getY(k));
          if(a.itemSize===3)batch[name].push(a.getZ(k));
        }
      }
    }
    geometry.dispose();
    wall.layers.set(2);
  }
  for(const [material,data] of batches){
    const geometry=new T.BufferGeometry();
    for(const [name,values] of Object.entries(data))geometry.setAttribute(name,new T.Float32BufferAttribute(values,name==='uv'?2:3));
    const mesh=new T.Mesh(geometry,material);
    mesh.name='Batched station masonry';mesh.castShadow=mesh.receiveShadow=true;
    scene.add(mesh);
  }
}
