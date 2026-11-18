// 场景布置：残骸车、路障、杂物、植被散布、铁丝网、路灯
// 所有道具用 InstancedMesh，一种模块一次绘制调用
import * as THREE from 'three/webgpu';
import { InstanceBatch, trs } from './assets.js';
import { onRoad, heightAt } from './ground.js';
import { rng } from './buildings.js';
import { weathered } from '../materials/weathering.js';

// 判断某点是否在建筑占地内（植被不长进楼里）
function insideAny( x, z, rects, pad = 0 ) {

	return rects.some( ( b ) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad );

}

/**
 * @param {object} M  已加载模型表 { id: { parts } }
 * @param {Array} buildings 建筑占地矩形
 */
export function dressScene( M, buildings ) {

	const batch = new InstanceBatch();
	const foliage = new InstanceBatch(); // 大植被：投射阴影
	const smallFoliage = new InstanceBatch(); // 小杂草：不投射阴影（每级阴影级联都要重画一遍，代价高）
	const r = rng( 7 );
	const add = ( id, node, m, color ) => batch.add( M[ id ].parts, node, m, color );

	// 道具材质加一点废土层（较轻）
	for ( const id of [ 'covered_car', 'concrete_road_barrier', 'barrel_03', 'metal_trash_can', 'utility_box_01', 'street_lamp_01', 'rollershutter_door', 'modular_fire_escape' ] ) {

		const seen = new Set();
		for ( const list of Object.values( M[ id ].parts ) ) for ( const { material } of list ) {

			if ( seen.has( material ) || material.transparent ) continue;
			seen.add( material );
			weathered( material, { strength: 0.6 } );

		}

	}

	// —— 废弃车辆：沿东西主路歪斜停放，形成「只能摩托通过」的缝隙 ——
	const cars = [
		[ - 18, - 1.8, 1.45 ], [ - 12.5, 1.6, 1.75 ], [ - 4, - 2.0, 1.52 ], [ 2.5, 0.8, 1.2 ],
		[ 12.2, 9, 0.12 ], [ 11, - 14, 0.05 ], [ 25, 2.2, 1.62 ], [ 31, - 1.6, 1.5 ],
	];
	for ( const [ x, z, ry ] of cars ) {

		const tint = new THREE.Color().setHSL( 0.1 + r() * 0.05, 0.1, 0.35 + r() * 0.25 );
		for ( const node of Object.keys( M.covered_car.parts ) ) {

			const isWheel = node.includes( 'wheel' );
			const local = isWheel ? M.covered_car.offsets[ node ] : M.covered_car.offsets.covered_car;
			const m = trs( x, 0, z, ry ).multiply( new THREE.Matrix4().makeTranslation( ...local ) );
			add( 'covered_car', node, m, isWheel ? null : tint );

		}

	}

	// —— 路障：交叉口北侧被混凝土墩封死（车辆不可通行，步行可过）——
	for ( let i = 0; i < 5; i ++ ) add( 'concrete_road_barrier', 'concrete_road_barrier', trs( 9 + i * 1.6, 0, 5.2 + ( r() - 0.5 ) * 0.4, ( r() - 0.5 ) * 0.25 ) );
	add( 'concrete_road_barrier', 'concrete_road_barrier', trs( 6.5, 0, 6.5, 0.9, 1, 0, 1.45 ) ); // 翻倒的一块

	// —— 杂物：垃圾袋、纸箱、轮胎、油桶 ——
	const litter = [
		[ 'trashbag', 'trashbag', 40 ], [ 'cardboard_box_01', 'cardboard_box_01', 14 ],
		[ 'old_tyre', 'old_tyre', 10 ], [ 'barrel_03', 'barrel_03', 8 ],
	];
	for ( const [ id, node, count ] of litter ) {

		for ( let i = 0; i < count; i ++ ) {

			// 杂物沿墙根和路边堆积
			const nearWall = r() < 0.6 && buildings.length;
			let x, z;
			if ( nearWall ) {

				const b = buildings[ Math.floor( r() * buildings.length ) ];
				const side = Math.floor( r() * 4 );
				x = side < 2 ? b.x0 + r() * ( b.x1 - b.x0 ) : ( side === 2 ? b.x0 - 0.5 : b.x1 + 0.5 );
				z = side >= 2 ? b.z0 + r() * ( b.z1 - b.z0 ) : ( side === 0 ? b.z0 - 0.5 : b.z1 + 0.5 );

			} else {

				x = ( r() - 0.5 ) * 60; z = ( r() - 0.5 ) * 60;

			}

			if ( insideAny( x, z, buildings, 0.1 ) ) continue;
			const isTyre = id === 'old_tyre';
			const lying = isTyre && r() < 0.7;
			const y = lying ? 0.08 : ( id === 'cardboard_box_01' ? 0.17 : 0 );
			add( id, node, trs( x, y + heightAt( x, z ), z, r() * 6.28, 0.85 + r() * 0.35, lying ? Math.PI / 2 : 0 ) );

		}

	}

	// —— 其他街道设施 ——
	add( 'metal_trash_can', 'metal_trash_can_rust', trs( - 6, 0.15, - 7.6, 0.3 ) );
	add( 'metal_trash_can', 'metal_trash_can', trs( 19.5, 0.15, 7.8, 1.1, 1, 0, 1.4 ) ); // 倒地
	add( 'utility_box_01', 'utility_box_01_box', trs( 17.2, 0.15, - 6, Math.PI / 2 ) );
	for ( const [ x, z, ry ] of [ [ - 20, - 6.8, 0 ], [ 0, - 6.8, 0 ], [ 6.8, 12, Math.PI / 2 ], [ 17.2, 20, - Math.PI / 2 ], [ 26, 6.8, Math.PI ] ] ) {

		const tilt = r() < 0.4 ? ( r() - 0.5 ) * 0.4 : 0;
		add( 'street_lamp_01', 'street_lamp_01', trs( x, 0.15, z, ry, 1, tilt, 0 ) );

	}

	// —— 铁丝网围栏：东北空地被围起（可占领营地的视觉暗示）——
	const F = M.modular_chainlink_fence.parts;
	for ( let i = 0; i < 9; i ++ ) {

		const lean = i === 4 ? 0.25 : 0; // 一段被推倒倾斜
		batch.add( F, 'modular_chainlink_fence_double', trs( 21 + i * 2, 0.15, 24, 0, 1, lean, 0 ) );
		batch.add( F, 'modular_chainlink_fence_post', trs( 19 + i * 2, 0.15, 24, 0 ) );

	}

	// —— 植被散布：蕨类、灌木、荨麻、杂草 ——
	const veg = [
		// [模型, 节点前缀, 数量, 缩放区间, 生长规则]
		[ 'fern_02', 'fern_02_', 260, [ 0.9, 1.6 ], 'edge', true ],
		[ 'shrub_02', 'shrub_02_', 70, [ 0.7, 1.2 ], 'lot', true ],
		[ 'nettle_plant', 'nettle_plant_', 280, [ 3.0, 5.0 ], 'edge', false ],
		[ 'weed_plant_02', 'weed_plant_02_', 600, [ 2.5, 4.5 ], 'crack', false ],
		[ 'shrub_04', 'shrub_04', 50, [ 1.5, 2.5 ], 'edge', false ], // 单株 2.7 万面，数量要克制
	];
	for ( const [ id, prefix, count, [ s0, s1 ], rule, shadow ] of veg ) {

		const nodes = Object.keys( M[ id ].parts ).filter( ( n ) => n.startsWith( prefix ) );
		let placed = 0, tries = 0;
		while ( placed < count && tries ++ < count * 20 ) {

			const x = ( r() - 0.5 ) * 100, z = ( r() - 0.5 ) * 100;
			if ( insideAny( x, z, buildings, 0.05 ) ) continue;
			const road = onRoad( x, z );
			// 规则：edge = 墙根和路边密集；crack = 路面裂缝稀疏；lot = 空地
			const nearB = insideAny( x, z, buildings, 1.8 );
			let p = road ? 0.08 : 0.5;
			if ( rule === 'edge' ) p = nearB ? 0.95 : ( road ? 0.03 : 0.35 );
			if ( rule === 'crack' ) p = road ? 0.35 : 0.7;
			if ( rule === 'lot' ) p = road ? 0.02 : ( nearB ? 0.5 : 0.6 );
			if ( r() > p ) continue;
			const node = nodes[ Math.floor( r() * nodes.length ) ];
			( shadow ? foliage : smallFoliage ).add( M[ id ].parts, node, trs( x, heightAt( x, z ), z, r() * 6.28, s0 + r() * ( s1 - s0 ) ) );
			placed ++;

		}

	}

	const g = new THREE.Group();
	g.add( batch.build() );
	g.add( foliage.build( { castShadow: true } ) );
	g.add( smallFoliage.build( { castShadow: false } ) );
	return g;

}
