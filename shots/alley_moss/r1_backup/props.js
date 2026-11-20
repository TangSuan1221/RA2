// 苔藓小巷：叙事杂物（Poly Haven CC0 模型）+ 蕨类
import * as THREE from 'three/webgpu';
import { loadModel, InstanceBatch, trs } from '../world/assets.js';
import { L } from './materials.js';
import { rng } from './util.js';
import { positionWorld, mix, vec3, smoothstep, mx_fractal_noise_float, materialColor, float } from 'three/tsl';

// 给模型材质叠一层潮湿 + 苔藓（朝上的面）
function dampen( mat, moss = 0.5 ) {

	if ( mat.userData.damp ) return;
	mat.userData.damp = true;
	const p = positionWorld;
	const n = mx_fractal_noise_float( p.mul( 3.0 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const m = smoothstep( 0.55, 0.7, n ).mul( moss );
	mat.colorNode = mix( materialColor.rgb.mul( 0.62 ), vec3( 0.03, 0.045, 0.014 ), m );

}

export async function buildProps() {

	const ids = [ 'trashbag', 'cardboard_box_01', 'barrel_03', 'old_tyre', 'fern_02', 'wooden_crate_01', 'shrub_02', 'grass_medium_01' ];
	const M = Object.fromEntries( await Promise.all( ids.map( async ( id ) => [ id, await loadModel( id ) ] ) ) );
	for ( const id of ids ) {

		if ( [ 'fern_02', 'shrub_02', 'grass_medium_01' ].includes( id ) ) continue;
		for ( const list of Object.values( M[ id ].parts ) ) for ( const p of list ) dampen( p.material, id === 'barrel_03' ? 0.2 : 0.5 );

	}

	// 蕨类/灌木/草：叶色压暗、去黄（Poly Haven 植被偏亮偏黄）
	for ( const id of [ 'fern_02', 'shrub_02', 'grass_medium_01' ] ) for ( const list of Object.values( M[ id ].parts ) ) for ( const p of list ) {

		p.material.colorNode = materialColor.rgb.mul( id === 'grass_medium_01' ? vec3( 0.32, 0.36, 0.2 ) : id === 'shrub_02' ? vec3( 0.26, 0.33, 0.17 ) : vec3( 0.36, 0.44, 0.25 ) );

	}

	const r = rng( 55 );
	const b = new InstanceBatch();
	const Y = L.SLAB_TOP;
	// 温室一侧：垃圾袋堆 + 纸箱
	b.add( M.trashbag.parts, 'trashbag', trs( - 1.7, Y, - 4.2, 0.6, 1.0 ) );
	b.add( M.trashbag.parts, 'trashbag', trs( - 1.35, Y, - 4.6, 2.1, 0.85 ) );
	b.add( M.trashbag.parts, 'trashbag', trs( - 1.75, Y + 0.32, - 4.65, 1.1, 0.8, 0.3, 0.1 ) );
	b.add( M.cardboard_box_01.parts, 'cardboard_box_01', trs( - 1.55, Y + 0.17, - 3.5, 0.4, 1.0 ) );
	b.add( M.cardboard_box_01.parts, 'cardboard_box_01', trs( - 1.6, Y + 0.17, - 12.5, 1.9, 1.1, 0, 0 ) );
	// 墙根：倒在藤蔓里的旧轮胎、生锈油桶
	b.add( M.old_tyre.parts, 'old_tyre', trs( 1.05, Y + 0.08, - 9.5, 0.4, 1.0, Math.PI / 2 - 0.08, 0 ) );
	b.add( M.barrel_03.parts, 'barrel_03', trs( 1.3, Y, - 17.2, 0.6, 1.0 ) );
	b.add( M.wooden_crate_01.parts, 'wooden_crate_01', trs( - 1.6, Y - 0.3, - 20, 0.3, 1.0 ) );
	b.add( M.trashbag.parts, 'trashbag', trs( - 1.5, Y, - 21, 2.6, 0.9 ) );

	// 蕨类：两侧墙根
	const fernNames = Object.keys( M.fern_02.parts );
	for ( let z = L.Z1 - 1; z > L.Z0 + 2; z -= 0.8 + r() * 2.2 ) {

		const right = r() < 0.55;
		const x = right ? L.SOIL_X - 0.15 + r() * 0.3 : L.GH_X + 0.3 + r() * 0.25;
		b.add( M.fern_02.parts, r.pick( fernNames ), trs( x, Y - 0.02, z, r() * 6.28, 0.9 + r() * 0.7 ) );

	}

	// 温室内部：疯长的灌木与蕨类（透过破玻璃可见）
	const shrubNames = Object.keys( M.shrub_02.parts );
	for ( let z = L.Z1 - 0.5; z > L.Z0 + 1; z -= 0.9 + r() * 1.3 ) {

		for ( let k = 0; k < 2; k ++ ) {

			const x = L.GH_X - 0.9 - r() * 4.5;
			b.add( M.shrub_02.parts, r.pick( shrubNames ), trs( x, 0.0, z + ( r() - 0.5 ), r() * 6.28, 1.4 + r() * 1.0 ) );

		}

		b.add( M.fern_02.parts, r.pick( fernNames ), trs( L.GH_X - 0.5 - r() * 0.6, 0.0, z, r() * 6.28, 1.1 + r() * 0.6 ) );

	}

	// 屋顶：杂草丛（俯视镜头可见）
	const grassNames = Object.keys( M.grass_medium_01.parts );
	for ( let i = 0; i < 260; i ++ ) {

		const x = L.WALL_X + 0.4 + Math.pow( r(), 1.6 ) * 9, z = L.Z0 + r() * ( L.Z1 - L.Z0 );
		b.add( M.grass_medium_01.parts, r.pick( grassNames ), trs( x, L.WALL_H + 0.05, z, r() * 6.28, 1.0 + r() * 1.2 ) );

	}

	return b.build();

}
