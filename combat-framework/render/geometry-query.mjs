import {Box3,Line3,Vector3,Ray,DoubleSide} from 'three';
import {MeshBVH} from 'three-mesh-bvh';

function closedSurface(geometry){
  const positions=geometry.attributes.position,index=geometry.index,edges=new Map(),key=i=>[positions.getX(i),positions.getY(i),positions.getZ(i)].map(v=>Math.round(v*1e6)).join(',');
  for(let i=0;i<(index?.count??positions.count);i+=3){const vertices=[0,1,2].map(j=>key(index?index.getX(i+j):i+j));for(let j=0;j<3;j++){const a=vertices[j],b=vertices[(j+1)%3],edge=a<b?a+'|'+b:b+'|'+a;edges.set(edge,(edges.get(edge)??0)+1);}}
  return edges.size>0&&[...edges.values()].every(n=>n===2);
}
/** Static mesh queries exposed to pure logic as arrays and numbers only. */
export class GeometryQueries {
  constructor(entries){this.entries=entries.map(({mesh,object})=>{mesh.updateMatrixWorld(true);const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);geometry.computeBoundingBox();return {object,geometry,solid:closedSurface(geometry),bvh:new MeshBVH(geometry)};});this.segment=new Line3();this.bounds=new Box3();this.trianglePoint=new Vector3();this.segmentPoint=new Vector3();this.ray=new Ray();}
  sweptBoundsClear(start,end,radius,height){
    const bounds=new Box3(new Vector3(Math.min(start[0],end[0])-radius,Math.min(start[1],end[1]),Math.min(start[2],end[2])-radius),new Vector3(Math.max(start[0],end[0])+radius,Math.max(start[1],end[1])+height,Math.max(start[2],end[2])+radius));
    return this.entries.every(entry=>!entry.geometry.boundingBox.intersectsBox(bounds));
  }
  overlap(entry,origin,end,radius){this.segment.start.fromArray(origin);this.segment.end.fromArray(end);this.bounds.makeEmpty().expandByPoint(this.segment.start).expandByPoint(this.segment.end).expandByScalar(radius);let hit=false;if(!entry.geometry.boundingBox.intersectsBox(this.bounds))return false;entry.bvh.shapecast({intersectsBounds:b=>b.intersectsBox(this.bounds),intersectsTriangle:triangle=>{if(triangle.closestPointToSegment(this.segment,this.trianglePoint,this.segmentPoint)<radius){hit=true;return true;}return false;}});return hit;}
  inside(entry,point){
    if(!entry.solid||!entry.geometry.boundingBox.containsPoint(point))return false;
    const ray=new Ray(point,new Vector3(.811,.331,.482).normalize()),hits=entry.bvh.raycast(ray,DoubleSide).map(h=>h.distance).filter(d=>d>1e-7).sort((a,b)=>a-b);
    return hits.filter((d,i)=>i===0||d-hits[i-1]>1e-6).length%2===1;
  }
  resolveCapsule(actor,position){
    const radius=Math.min(actor.radius,actor.height/2),prone=actor.posture==='prone',r=prone?actor.height/2:radius,si=Math.sin(actor.yaw),co=Math.cos(actor.yaw),offset=prone?[-.7*si,r,-.7*co]:[0,r,0],start=position.map((v,i)=>v+offset[i]),end=prone?[position[0]+.6*si,position[1]+r,position[2]+.6*co]:[position[0],position[1]+actor.height-r,position[2]],segment=new Line3(new Vector3(...start),new Vector3(...end)),normals=[],bounds=new Box3(),trianglePoint=new Vector3(),capsulePoint=new Vector3(),normal=new Vector3();
    // Deep recovery considers all solids together; nearest-face pushes can oscillate
    // between touching solids or push into an entry already visited.
    const center=segment.getCenter(new Vector3());
    if(this.entries.some(entry=>this.inside(entry,center))){
      const union=new Box3();for(const entry of this.entries)if(entry.solid)union.union(entry.geometry.boundingBox);
      const candidates=[];
      for(const box of [...this.entries.filter(e=>e.solid).map(e=>e.geometry.boundingBox),union])for(let axis=0;axis<3;axis++)for(const side of [-1,1]){
        const extent=Math.abs(segment.end.getComponent(axis)-segment.start.getComponent(axis))/2+r+.005;
        const shift=(side<0?box.min.getComponent(axis)-extent:box.max.getComponent(axis)+extent)-center.getComponent(axis);
        const delta=new Vector3().setComponent(axis,shift),a=segment.start.clone().add(delta),b=segment.end.clone().add(delta),mid=center.clone().add(delta);
        if(this.entries.every(entry=>!this.inside(entry,mid)&&!this.overlap(entry,a.toArray(),b.toArray(),r)))candidates.push({delta,distance:Math.abs(shift)});
      }
      candidates.sort((a,b)=>a.distance-b.distance);
      if(!candidates.length)return {position:[...position],normals:[],valid:false,reason:'deep-containment-no-exit'};
      if(candidates.length){const delta=candidates[0].delta;segment.start.add(delta);segment.end.add(delta);normals.push(delta.clone().normalize().toArray());}
    }
    for(let iteration=0;iteration<3;iteration++){
      let changed=false;
      for(const entry of this.entries){bounds.makeEmpty().expandByPoint(segment.start).expandByPoint(segment.end).expandByScalar(r+.005);if(!entry.geometry.boundingBox.intersectsBox(bounds))continue;entry.bvh.shapecast({intersectsBounds:b=>b.intersectsBox(bounds),intersectsTriangle:triangle=>{const distance=triangle.closestPointToSegment(segment,trianglePoint,capsulePoint);if(distance>r+.006)return false;normal.subVectors(capsulePoint,trianglePoint);if(normal.lengthSq()<1e-12)triangle.getNormal(normal);else normal.normalize();const depth=Math.max(0,r+.005-distance);segment.start.addScaledVector(normal,depth);segment.end.addScaledVector(normal,depth);if(!normals.some(n=>normal.dot(new Vector3(...n))>.999))normals.push(normal.toArray());changed||=depth>.00001;return false;}});}
      if(!changed)break;
    }
    const unresolved=this.entries.some(entry=>this.inside(entry,segment.getCenter(new Vector3()))||this.overlap(entry,segment.start.toArray(),segment.end.toArray(),Math.max(0,r-1e-5)));
    if(unresolved)return {position:[...position],normals,valid:false,reason:'surface-penetration-unresolved'};
    return {position:segment.start.toArray().map((v,i)=>v-offset[i]),normals,valid:true};
  }
  trace(origin,dir,maxDistance,padding=0){let distance=maxDistance,object=null,normal=null;this.ray.origin.fromArray(origin);this.ray.direction.fromArray(dir);
    for(const entry of this.entries){
      if(padding<=0){const hit=entry.bvh.raycastFirst(this.ray,DoubleSide,0,distance);if(hit&&hit.distance<distance){distance=hit.distance;object=entry.object;normal=hit.face.normal.toArray();}continue;}
      const end=origin.map((v,i)=>v+dir[i]*distance);if(!this.overlap(entry,origin,end,padding))continue;
      let lo=0,hi=distance;for(let i=0;i<14;i++){const mid=(lo+hi)/2;if(this.overlap(entry,origin,origin.map((v,j)=>v+dir[j]*mid),padding))hi=mid;else lo=mid;}
      if(hi<distance){distance=hi;object=entry.object;}
    }
    return {distance,object,normal};
  }
  dispose(){for(const e of this.entries)e.geometry.dispose();}
}
