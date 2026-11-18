// 场景：室外街道（P0 样板间）—— 西雅图废弃十字路口，阴天潮湿
import * as THREE from 'three/webgpu';
import { buildGround } from '../world/ground.js';
import { buildBuilding, weatherFacadeKit } from '../world/buildings.js';
import { dressScene } from '../world/props.js';
import { setupLighting } from '../world/lighting.js';
import { loadModel, loadTexture, InstanceBatch } from '../world/assets.js';
import { mossTex } from '../materials/weathering.js';

const MODEL_IDS = [
	'modular_urban_apartments_facade', 'modular_fire_escape', 'rollershutter_door',
	'covered_car', 'concrete_road_barrier', 'modular_chainlink_fence', 'street_lamp_01',
	'trashbag', 'cardboard_box_01', 'old_tyre', 'barrel_03', 'metal_trash_can', 'utility_box_01',
	'fern_02', 'shrub_02', 'shrub_04', 'nettle_plant', 'weed_plant_02',
];

// 街区里的楼（占地矩形，边长为 3m 的倍数以匹配立面模块）
const BUILDINGS = [
	{ x0: - 25, z0: - 22, x1: - 7, z1: - 7, floors: 5, seed: 11, shopSides: [ 'S' ], tint: 0xb9b2a6 },
	{ x0: - 4, z0: - 19, x1: 5, z1: - 7, floors: 3, seed: 23, shopSides: [ 'S', 'E' ], tint: 0x9e8f7d },
	{ x0: - 22, z0: 7, x1: - 4, z1: 19, floors: 4, seed: 37, shopSides: [ 'N' ], tint: 0x8c9590 },
	{ x0: 19, z0: - 25, x1: 34, z1: - 7, floors: 6, seed: 41, shopSides: [ 'N', 'W' ], tint: 0xa9a196 },
	{ x0: 19, z0: 7, x1: 28, z1: 16, floors: 2, seed: 53, shopSides: [ 'N', 'W' ], tint: 0x968a7a },
];


// 固定机位：用于截图对比（mode/yaw/pitch/distance/target 见 core/camera.js）
export const SHOTS = {
	top: { mode: 'top', yaw: 35, pitch: 55, distance: 38, target: [ 4, 0, 0 ] },
	street: { mode: 'close', yaw: 115, pitch: 10, distance: 10, target: [ 10, 0, - 6 ] },
	alley: { mode: 'close', yaw: 200, pitch: 12, distance: 9, target: [ - 4, 0, - 5.5 ] },
};

export async function build( { scene, renderer, camera } ) {

	const lights = await setupLighting( scene, renderer, camera );
	mossTex.map = loadTexture( 'textures/leafy_grass/leafy_grass_diff_1k.jpg', { srgb: true } );
	const loaded = await Promise.all( MODEL_IDS.map( loadModel ) );
	const M = Object.fromEntries( MODEL_IDS.map( ( id, i ) => [ id, loaded[ i ] ] ) );
	scene.add( buildGround() );
	const kit = M.modular_urban_apartments_facade;
	weatherFacadeKit( kit );
	const batch = new InstanceBatch();
	for ( const b of BUILDINGS ) {

		const { extra } = buildBuilding( kit, b, batch );
		extra.forEach( ( o ) => scene.add( o ) );

	}

	scene.add( batch.build() );
	scene.add( dressScene( M, BUILDINGS ) );
	return { ...lights, M, update: null };

}
