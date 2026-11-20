import { V3, clamp } from '../core/math.mjs';

/** Analytic two-segment solver, including coincident target and collinear pole. */
export function solveTwoBone(hip,target,pole,l1,l2) {
  if(!(l1>0 && l2>0)) throw new Error('Bone lengths must be positive');
  const delta=V3.sub(target,hip), raw=V3.len(delta);
  const axis=raw>1e-8?V3.mul(delta,1/raw):[0,-1,0];
  const d=clamp(raw,Math.abs(l1-l2)+1e-5,(l1+l2)*0.995);
  let bend=V3.sub(pole,V3.mul(axis,V3.dot(pole,axis)));
  if(V3.len(bend)<1e-6) { const fallback=Math.abs(axis[0])<0.8?[1,0,0]:[0,0,1]; bend=V3.sub(fallback,V3.mul(axis,V3.dot(fallback,axis))); }
  bend=V3.norm(bend);
  const along=(l1*l1+d*d-l2*l2)/(2*d);
  const perpendicular=Math.sqrt(Math.max(0,l1*l1-along*along));
  return {knee:V3.add(hip,V3.add(V3.mul(axis,along),V3.mul(bend,perpendicular))),ankle:V3.add(hip,V3.mul(axis,d)),reached:Math.abs(raw-d)<1e-5};
}
