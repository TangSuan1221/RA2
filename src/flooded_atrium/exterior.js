// 淹水中庭：门外（阳光草地、带刺铁丝网围栏、过曝天空背景）
// 室外材质单独挂 HDRI 环境光（envMap），室内则用极低的场景环境光，从而做出室内暗/室外亮的强烈反差
import * as THREE from 'three/webgpu';
import {
	vec3, float, mix, smoothstep, texture, uv, positionWorld, mx_fractal_noise_float, luminance, normalMap, vec2,
	instanceIndex, hash, positionLocal, sin, time,
} from 'three/tsl';
import { InstanceBatch, trs } from '../world/assets.js';
import { texSet, mulberry, merge, meshOf } from './util.js';

export const OUT_Y = 0.32; // 室外地面标高（门槛高于水面）

// 草地地面：leafy_grass 亮度细节 × 美术指定的绿，泥土斑块
function grassGround( hdr ) {

	const G = texSet( 'leafy_grass' );
	const Mud = texSet( 'brown_mud_leaves_01' );
	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const uvA = p.xz.mul( 0.45 );
	const g = luminance( texture( G.map, uvA ).rgb ).mul( 3.0 );
	const g2 = luminance( texture( G.map, p.xz.mul( 0.17 ).add( 0.3 ) ).rgb ).mul( 3.0 );
	const n = mx_fractal_noise_float( vec3( p.x.mul( 0.15 ), 0, p.z.mul( 0.15 ) ), 4, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const grass = mix( vec3( 0.045, 0.075, 0.018 ), vec3( 0.09, 0.12, 0.03 ), n ).mul( mix( g, g2, 0.5 ) );
	const mud = texture( Mud.map, p.xz.mul( 0.4 ) ).rgb.mul( 0.6 );
	const mudM = smoothstep( 0.62, 0.7, n.add( mx_fractal_noise_float( p.mul( 1.3 ), 2, 2.0, 0.5 ).mul( 0.1 ) ) );
	m.colorNode = mix( grass, mud, mudM );
	m.roughnessNode = float( 0.92 );
	m.normalNode = normalMap( texture( G.normalMap, uvA ), vec2( 0.8, 0.8 ) );
	m.envMap = hdr; m.envMapIntensity = 0.9;
	return m;

}

// 门外混凝土平台（台阶）
function concreteLanding( hdr ) {

	const T = texSet( 'concrete_moss' );
	const m = new THREE.MeshStandardNodeMaterial();
	const uvN = positionWorld.xz.mul( 0.35 );
	const c = texture( T.map, uvN ).rgb;
	m.colorNode = mix( vec3( luminance( c ) ), c, 0.6 ).mul( 0.8 );
	m.roughnessNode = texture( T.arm, uvN ).g;
	m.normalNode = normalMap( texture( T.normalMap, uvN ) );
	m.envMap = hdr; m.envMapIntensity = 0.9;
	return m;

}

// 带刺铁丝：螺旋蛇腹形刺网（concertina）+ 直线刺绳与倒刺
function barbedWire( x0, x1, y, z, rng ) {

	const geos = [];
	// 蛇腹网：沿 x 方向的螺旋，半径 0.22，节距 0.16
	const pts = [];
	const R = 0.22;
	const turns = ( x1 - x0 ) / 0.16;
	for ( let i = 0; i <= turns * 18; i ++ ) {

		const a = ( i / 18 ) * Math.PI * 2;
		const x = x0 + ( i / ( turns * 18 ) ) * ( x1 - x0 ) + Math.sin( a * 0.5 ) * 0.02;
		const sag = Math.sin( ( ( x - x0 ) / ( x1 - x0 ) ) * Math.PI * 6 ) * 0.03;
		pts.push( new THREE.Vector3( x, y + R + Math.sin( a ) * R + sag, z + Math.cos( a ) * R ) );

	}

	geos.push( new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts ), Math.floor( turns * 18 ), 0.0035, 4, false ) );
	// 两条直刺绳（立柱顶部的斜臂上），轻微下垂
	for ( const dz of [ - 0.12, 0.12 ] ) {

		const s = [];
		for ( let i = 0; i <= 40; i ++ ) {

			const t = i / 40;
			const x = x0 + t * ( x1 - x0 );
			const span = ( ( x - x0 ) % 3 ) / 3;
			s.push( new THREE.Vector3( x, y - 0.05 + dz * 0.4 - Math.sin( span * Math.PI ) * 0.04, z + dz ) );

		}

		geos.push( new THREE.TubeGeometry( new THREE.CatmullRomCurve3( s ), 120, 0.003, 3, false ) );
		// 倒刺：每 12cm 一个小十字
		for ( let x = x0 + 0.05; x < x1; x += 0.12 ) {

			const b = new THREE.BoxGeometry( 0.004, 0.05, 0.004 );
			b.rotateX( rng() * 3 ); b.rotateZ( 0.8 );
			const span = ( ( x - x0 ) % 3 ) / 3;
			b.translate( x, y - 0.05 + dz * 0.4 - Math.sin( span * Math.PI ) * 0.04, z + dz );
			geos.push( b );

		}

	}

	return merge( geos );

}

export async function buildExterior( { scene, M, hdr, doorX, wallZ } ) {

	const rng = mulberry( 4242 );
	const group = new THREE.Group();

	// 地面
	const ground = new THREE.Mesh( new THREE.PlaneGeometry( 90, 70 ), grassGround( hdr ) );
	ground.rotation.x = - Math.PI / 2;
	ground.position.set( 0, OUT_Y, wallZ - 35.6 );
	ground.receiveShadow = true;
	group.add( ground );

	// 门外混凝土平台：高于草地一点，带倒角
	const landing = meshOf( new THREE.BoxGeometry( doorX * 2 + 3, 0.12, 2.6 ), concreteLanding( hdr ) );
	landing.position.set( 0, OUT_Y + 0.0, wallZ - 1.5 );
	group.add( landing );

	// 铁丝网围栏：z = wallZ - 8，横跨视野；Poly Haven 模块（2m 一段）
	const fence = M.modular_chainlink_fence;
	for ( const list of Object.values( fence.parts ) ) for ( const part of list ) {

		if ( ! part.material.userData.ext ) {

			part.material.envMap = hdr; part.material.envMapIntensity = 1.0;
			part.material.userData.ext = true;

		}

	}

	const batch = new InstanceBatch();
	const fz = wallZ - 3.0;
	for ( let x = - 16; x < 16; x += 2 ) {

		// 中间一段微微倒伏（被撞过）
		const lean = Math.abs( x - 2 ) < 1.5 ? 0.06 : 0;
		batch.add( fence.parts, 'modular_chainlink_fence', trs( x + 2, OUT_Y, fz, 0, 1, 0, lean ) );
		batch.add( fence.parts, 'modular_chainlink_fence_post', trs( x, OUT_Y, fz, 0, 1 ) );

	}

	group.add( batch.build( { castShadow: false } ) ); // 铁丝网阴影投进大厅会在水面上形成网格，去掉

	// 带刺铁丝（立柱顶部 2.5m）
	const wireMat = new THREE.MeshStandardNodeMaterial( { color: 0x2b2622, metalness: 0.7, roughness: 0.6 } );
	wireMat.envMap = hdr; wireMat.envMapIntensity = 1;
	const wire = meshOf( barbedWire( - 16, 16, OUT_Y + 2.5, fz, rng ), wireMat, { cast: false } );
	group.add( wire );

	// 草丛（实例化 Poly Haven grass_medium_01），门口最密，阳光下
	const grassParts = M.grass_medium_01.parts;
	// 只用低面数的高草/中草（large 系列单株 5–6 千面，过重）
	const gNames = Object.keys( grassParts ).filter( ( n ) => /tall|mid_b|mid_c/.test( n ) );
	const gb = new InstanceBatch();
	for ( let i = 0; i < 2200; i ++ ) {

		const x = ( rng() - 0.5 ) * 26;
		const z = wallZ - 2.9 - Math.pow( rng(), 0.8 ) * 18;
		const name = gNames[ Math.floor( rng() * gNames.length ) ];
		const s = 2.6 + rng() * 2.6 * ( 1 + Math.max( 0, ( wallZ - 9 - z ) ) * 0.05 );
		gb.add( grassParts, name, trs( x, OUT_Y - 0.02, z, rng() * 6.28, s ) );

	}

	// 门槛与平台边缘的杂草
	for ( let i = 0; i < 260; i ++ ) {

		const x = ( rng() - 0.5 ) * ( doorX * 2 + 3 );
		const z = wallZ - 0.4 - ( rng() < 0.5 ? rng() * 0.4 : 2.6 + rng() * 0.3 );
		const name = gNames[ Math.floor( rng() * gNames.length ) ];
		gb.add( grassParts, name, trs( x, OUT_Y + 0.05, z, rng() * 6.28, 1.4 + rng() * 1.6 ) );

	}

	const grassGroup = gb.build( { castShadow: false } );
	grassGroup.traverse( ( o ) => {

		if ( o.isMesh && ! o.material.userData.ext ) {

			const m = o.material;
			m.envMap = hdr; m.envMapIntensity = 0.55;
			// Poly Haven 草偏枯黄：取亮度细节重新着色为偏灰的绿，实例间抖动
			const h = hash( instanceIndex );
			const base = texture( m.map, uv() ).rgb;
			m.colorNode = mix( vec3( 0.06, 0.1, 0.025 ), vec3( 0.14, 0.15, 0.045 ), h ).mul( luminance( base ).mul( 3.4 ) );
			m.userData.ext = true;

		}

	} );
	group.add( grassGroup );

	// 围栏外灌木（逆光剪影，被雾吞掉一半）
	const shrubParts = M.shrub_02.parts;
	const sb = new InstanceBatch();
	const sNames = Object.keys( shrubParts );
	for ( let i = 0; i < 28; i ++ ) {

		const x = ( rng() - 0.5 ) * 36;
		const z = fz - 1.0 - rng() * 5;
		sb.add( shrubParts, sNames[ i % sNames.length ], trs( x, OUT_Y, z, rng() * 6.28, 3.0 + rng() * 2.2 ) );

	}

	const shrubs = sb.build();
	shrubs.traverse( ( o ) => {

		if ( o.isMesh && ! o.material.userData.ext ) {

			o.material.envMap = hdr; o.material.envMapIntensity = 1.0;
			const base = texture( o.material.map, uv() ).rgb;
			o.material.colorNode = vec3( 0.12, 0.15, 0.05 ).mul( luminance( base ).mul( 3.2 ) );
			o.material.userData.ext = true;

		}

	} );
	group.add( shrubs );

	// 过曝天空 / 远景背景：巨大的弧形发光幕，上亮下略暗，带远处树冠的淡影
	const skyMat = new THREE.MeshBasicNodeMaterial( { side: THREE.BackSide, fog: false } );
	const sp = positionWorld;
	const treeLine = mx_fractal_noise_float( vec3( sp.x.mul( 0.05 ), 0, sp.z.mul( 0.05 ) ), 3, 2.0, 0.5 ).mul( 4 ).add( 9 );
	const trees = smoothstep( treeLine.add( 0.5 ), treeLine.sub( 1.5 ), sp.y );
	const skyCol = mix( vec3( 0.30, 0.42, 0.48 ), vec3( 0.12, 0.22, 0.15 ), trees.mul( 0.85 ) );
	skyMat.colorNode = skyCol;
	const sky = new THREE.Mesh( new THREE.CylinderGeometry( 60, 60, 80, 48, 1, true, Math.PI * 0.5, Math.PI ), skyMat );
	sky.position.set( 0, 30, wallZ );
	sky.castShadow = sky.receiveShadow = false;
	group.add( sky );

	scene.add( group );
	return { fenceZ: fz };

}
