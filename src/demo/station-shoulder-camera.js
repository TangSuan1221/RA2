import {Vector3,Raycaster,MathUtils} from 'three';

// Frame heights are the vertical span in metres at the actor. Use the same
// framing at different aspect ratios and leave space to the right for travel.
const baseTangent=Math.tan(MathUtils.degToRad(50)/2);
export const shoulderDefaults=Object.freeze({
  idleDistance:1.16/(2*baseTangent),walkDistance:1.91/(2*baseTangent),
  fov:50,shoulderOffset:.34,horizontal:0,vertical:0,response:7
});

export function createShoulderCamera(camera,settings=shoulderDefaults){
  const right=new Vector3(),back=new Vector3(),pivot=new Vector3();
  const arm=new Vector3(),origin=new Vector3(),forward=new Vector3();
  const ray=new Raycaster();ray.layers.enable(2);
  let travel=0,doorBlend=0,clearance=1;
  return function follow({position,jumpHeight,crouched,prone,yaw,pitch,moving,nearDoor,dt,obstacles,distanceOverride,side=1}){
    const blend=1-Math.exp(-settings.response*dt);
    travel+=((moving?1:0)-travel)*blend;
    doorBlend+=((nearDoor?1:0)-doorBlend)*blend;
    const tangent=Math.tan(MathUtils.degToRad(settings.fov)/2);
    const distance=distanceOverride??MathUtils.lerp(settings.idleDistance,settings.walkDistance,travel);
    const frameHeight=2*tangent*distance;
    const baseX=MathUtils.lerp(.332,.377-.019*doorBlend,travel)+settings.horizontal/100;
    const headX=side===1?baseX:1-baseX;
    const headY=MathUtils.lerp(.253,.342-.018*doorBlend,travel)+settings.vertical/100;
    const headHeight=prone?.61:crouched?1.14:1.78;


    const shoulder=settings.shoulderOffset*side;
    pivot.copy(position);
    pivot.y+=jumpHeight+headHeight-(.5-headY)*frameHeight;
    right.set(Math.cos(yaw),0,-Math.sin(yaw));
    back.set(Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    arm.copy(back).multiplyScalar(distance).addScaledVector(right,shoulder);
    const length=arm.length();
    ray.ray.direction.copy(arm).normalize();
    let free=1;
    for(const side of [0,-.11,.11]){
      origin.copy(pivot).addScaledVector(right,side);
      ray.ray.origin.copy(origin);ray.far=length+.10;
      const hit=ray.intersectObjects(obstacles,false)[0];
      if(hit)free=Math.min(free,Math.max(.09,(hit.distance-.13)/length));
    }
    clearance=Math.min(free,clearance+(1-clearance)*blend);
    camera.position.copy(pivot).addScaledVector(arm,clearance);
    forward.copy(camera.position).sub(back);camera.lookAt(forward);
    // Physical shoulder shift is bounded in tight spaces. The remaining
    // horizontal composition comes from an asymmetric projection.
    const offset=(.5-headX-shoulder/(frameHeight*camera.aspect))*2*tangent*camera.aspect*camera.getFilmWidth();
    if(camera.fov!==settings.fov||Math.abs(camera.filmOffset-offset)>.002){
      camera.fov=settings.fov;camera.filmOffset=offset;camera.updateProjectionMatrix();
    }
  };
}
