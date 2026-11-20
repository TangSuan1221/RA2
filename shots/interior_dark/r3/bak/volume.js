// 体积雾（本场景专用版本）：与 core/renderer.js 的 createVolumeFog 相同接口，
// 区别：步进起点抖动用「交错梯度噪声 + 帧序号」逐帧变化，交给 TRAA 时间累积 → 不再出现静态 Bayer 方块纹样
import * as THREE from 'three/webgpu';
import { Fn, uniform, screenCoordinate, frameId, float, fract, dot, vec2 } from 'three/tsl';
import { VOLUME_LAYER } from '../core/renderer.js';

// 交错梯度噪声（Jimenez 2014），每帧沿屏幕平移一个黄金比例偏移
const ign = Fn( () => {

	const f = float( frameId ).mod( 64 );
	const p = screenCoordinate.xy.add( vec2( f.mul( 5.588238 ), f.mul( 5.588238 ) ) );
	return fract( float( 52.9829189 ).mul( fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ) );

} );

export function createVolumeFogTAA( geometry, { density = 1, steps = 24, noise = null } = {} ) {

	const mat = new THREE.VolumeNodeMaterial();
	mat.steps = steps;
	mat.offsetNode = ign();
	const d = typeof density === 'number' ? uniform( density ) : density;
	mat.scatteringNode = Fn( ( { positionRay } ) => noise ? d.mul( noise( positionRay ) ) : d );
	const mesh = new THREE.Mesh( geometry, mat );
	mesh.receiveShadow = true;
	mesh.layers.disableAll();
	mesh.layers.enable( VOLUME_LAYER );
	mesh.userData.density = d;
	return mesh;

}
