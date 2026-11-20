import {SpotLight, Mesh, MeshBasicMaterial, PlaneGeometry} from 'three';

export function drivingLights(vehicle) {
  const beams = [];
  const lamps = [];
  for (const side of [-1, 1]) {
    const beam = new SpotLight(0xffe6b1, 0, 76, .36, .68, 1.5);
    const lamp = new Mesh(new PlaneGeometry(.32, .10), new MeshBasicMaterial({color: 0xffeabc}));
    vehicle.add(beam, beam.target, lamp);
    beams.push(beam);
    lamps.push(lamp);
  }
  let previous;
  return (night, mode) => {
    const setting = night + mode;
    if (setting === previous) return;
    previous = setting;
    const truck = mode === '卡车', bike = mode === '摩托';
    for (let i = 0; i < 2; i++) {
      const side = i * 2 - 1;
      const on = night && ['轿车','卡车','摩托'].includes(mode) && (!bike || i === 0);
      const x = bike ? 0 : side * (truck ? .85 : .64);
      const z = truck ? 3.19 : bike ? .91 : 2.31;
      const y = truck ? 1.6 : bike ? 1.15 : .94;
      const beam = beams[i], lamp = lamps[i];
      beam.position.set(x,y,z);
      beam.target.position.set(x + side * 1.3, .12, z + 34);
      beam.intensity = on ? 145 : 0;
      lamp.visible = on;
      lamp.position.copy(beam.position);
    }
  };
}
