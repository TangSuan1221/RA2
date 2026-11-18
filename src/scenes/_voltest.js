// 冒烟测试场景：验证体积光管线（手电光束）可用。正式室内场景见 interior.js
import * as THREE from 'three/webgpu';
import { createVolumeFog, VOLUME_LAYER } from '../core/renderer.js';

export const SHOTS = { main: { mode: 'close', yaw: 30, pitch: 8, distance: 6, target: [ 0, 0, 0 ] } };

export async function build( { scene, renderer } ) {

	scene.background = new THREE.Color( 0x050505 );
	renderer.toneMappingExposure = 1;
	const room = new THREE.Mesh( new THREE.BoxGeometry( 12, 4, 12 ), new THREE.MeshStandardNodeMaterial( { color: 0x666055, roughness: 0.9, side: THREE.BackSide } ) );
	room.position.y = 2; room.receiveShadow = true; scene.add( room );
	const box = new THREE.Mesh( new THREE.BoxGeometry( 1, 1, 1 ), new THREE.MeshStandardNodeMaterial( { color: 0x887766 } ) );
	box.position.set( 0, 0.5, 0 ); box.castShadow = box.receiveShadow = true; scene.add( box );
	const spot = new THREE.SpotLight( 0xfff1d6, 60, 15, 0.35, 0.4, 2 );
	spot.position.set( - 3, 2.5, 3 ); spot.target.position.set( 1, 0, - 1 ); spot.castShadow = true;
	spot.layers.enable( VOLUME_LAYER );
	scene.add( spot, spot.target );
	const fog = createVolumeFog( new THREE.BoxGeometry( 12, 4, 12 ), { density: 0.6 } );
	fog.position.y = 2; scene.add( fog );
	return { pipelineOptions: { volumes: [ fog ], volumeIntensity: 1 } };

}
