import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
export function createPistol(){const group=new T.Group(),metal=new T.MeshStandardMaterial({color:0x333735,metalness:.8,roughness:.36}),grip=new T.MeshStandardMaterial({color:0x181c18,roughness:.95});for(const [size,pos,mat]of [[[.035,.19,.045],[0,.1,.025],metal],[[.038,.055,.09],[0,.015,-.025],grip],[[.015,.08,.014],[0,.03,-.06],metal]]){const mesh=new T.Mesh(new T.BoxGeometry(...size),mat);mesh.position.fromArray(pos);mesh.castShadow=true;group.add(mesh);}group.position.set(0,.045,0);return group;}
export function createKnife(){const group=new T.Group();const handle=new T.Mesh(new T.BoxGeometry(.025,.09,.025),new T.MeshStandardMaterial({color:0x28291d,roughness:.85}));const blade=new T.Mesh(new T.BoxGeometry(.028,.2,.006),new T.MeshStandardMaterial({color:0x9a9d92,metalness:.9,roughness:.28}));blade.position.y=.13;group.add(handle,blade);group.position.y=.065;return group;}
export function createPracticeLongGun(scoped){
  const gun=new T.Group();
  const metal=new T.MeshStandardMaterial({color:0x41494c,roughness:.48,metalness:.4});
  const stock=new T.MeshStandardMaterial({color:scoped?0x695345:0x977854,roughness:.76});
  const rubber=new T.MeshStandardMaterial({color:0x292d2b,roughness:.94});
  function part(size,pos,material,tilt=0){
    const mesh=new T.Mesh(new RoundedBoxGeometry(...size,1,Math.min(...size)*.22),material);
    mesh.position.fromArray(pos);
    mesh.rotation.x=tilt;
    mesh.castShadow=true;
    gun.add(mesh);
    return mesh;
  }
  function tube(z0,z1,y,r0,r1,material){
    const mesh=new T.Mesh(new T.CylinderGeometry(r1,r0,z1-z0,16),material);
    mesh.rotation.x=Math.PI/2;
    mesh.position.set(0,y,(z0+z1)/2);
    mesh.castShadow=true;
    gun.add(mesh);
  }
  part([.056,.08,.21],[0,.053,.058],metal);
  part([.049,.054,.21],[0,.059,-.124],stock,-.1);
  const magazine=part([.039,scoped?.085:.125,.062],[0,-.04,.08],rubber,-.16);
  magazine.name='magazine';
  part([.057,.095,.065],[0,.036,-.249],stock,-.12);
  part([.06,.096,.015],[0,.035,-.283],rubber,-.12);
  part([.035,.088,.038],[0,-.009,-.018],stock,.30);
  const end=scoped?.79:.56;
  tube(.14,end,.085,.019,.011,metal);
  part([.055,.057,scoped?.23:.17],[0,.058,scoped?.252:.222],stock);
  tube(end-.042,end,.085,.018,.017,metal);
  if(scoped){
    for(const z of [.018,.107])part([.028,.047,.019],[0,.12,z],rubber);
    tube(-.066,.124,.149,.019,.019,metal);
    tube(.124,.175,.149,.019,.035,metal);
    tube(.175,.195,.149,.035,.035,rubber);
    tube(-.09,-.045,.149,.025,.025,rubber);
    const glass=new T.MeshStandardMaterial({color:0x6b878e,metalness:.28,roughness:.2});
    tube(-.091,-.09,.149,.019,.019,glass);
  }else{
    part([.025,.026,.023],[0,.108,-.012],rubber);
    part([.014,.035,.018],[0,.113,.315],rubber);
  }
  return gun;
}
export function createExecutionProps(){
  const wood=new T.MeshStandardMaterial({color:0x795036,roughness:.82});
  const axe=new T.Group(),bat=new T.Group();
  const handle=new T.Mesh(new T.CylinderGeometry(.022,.026,.48,12),wood);
  handle.position.y=.13;axe.add(handle);
  const profile=new T.Shape();
  profile.moveTo(-.035,.03);profile.lineTo(.12,.065);profile.lineTo(.15,-.09);
  profile.lineTo(.025,-.035);profile.lineTo(-.035,-.025);profile.closePath();
  const head=new T.Mesh(new T.ExtrudeGeometry(profile,{depth:.028,bevelEnabled:false}),new T.MeshStandardMaterial({color:0x758088,metalness:.7,roughness:.45}));
  head.position.set(0,.32,-.014);axe.add(head);
  const outline=[[0,-.12],[.024,-.12],[.019,-.09],[.018,.09],[.037,.36],[.04,.51],[.034,.55],[0,.56]];
  bat.add(new T.Mesh(new T.LatheGeometry(outline.map(([x,y])=>new T.Vector2(x,y)),16),wood));
  return {Axe:axe,Bat:bat};
}
