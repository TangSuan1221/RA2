// 黑暗积水室内：程序化道具（门、吊顶环形灯、天花吊顶残骸、电线、泡水纸张）
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
	vec3, float, mix, smoothstep, positionWorld, mx_fractal_noise_float, mx_worley_noise_float, uv, abs, fract, max,
} from 'three/tsl';
import { WATER_Y, metalMaterial, brassMaterial, doorPaintMaterial, wiredGlassMaterial, ceilingMaterial } from './materials.js';

const n01 = ( p, o = 3 ) => mx_fractal_noise_float( p, o, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );

// 倒角盒（以 min/max 角点给出）
export function rbox( x0, y0, z0, x1, y1, z1, r = 0.008 ) {

	const w = x1 - x0, h = y1 - y0, d = z1 - z0;
	const rr = Math.min( r, w / 2.01, h / 2.01, d / 2.01 );
	const g = new RoundedBoxGeometry( w, h, d, 2, rr );
	g.translate( ( x0 + x1 ) / 2, ( y0 + y1 ) / 2, ( z0 + z1 ) / 2 );
	// 世界尺度 UV（米），与 boxUV 一致
	const pos = g.attributes.position, nor = g.attributes.normal, uvs = g.attributes.uv;
	for ( let i = 0; i < pos.count; i ++ ) {

		const ax = Math.abs( nor.getX( i ) ), ay = Math.abs( nor.getY( i ) );
		const x = pos.getX( i ), y = pos.getY( i ), z = pos.getZ( i );
		if ( ay > ax && ay > Math.abs( nor.getZ( i ) ) ) uvs.setXY( i, x, - z );
		else if ( ax > Math.abs( nor.getZ( i ) ) ) uvs.setXY( i, z, y );
		else uvs.setXY( i, x, y );

	}

	return g;

}

/**
 * 双开防火门：倒角金属门框 + 两扇门（冒头/边梃拼装，上半夹丝磨砂玻璃），右扇向里虚掩约 8cm
 * door: { x0, x1, y1 }，zWall：墙面 z（门框外沿）；T：墙厚
 * 返回 { group, glassMeshes, occluders }
 */
export function buildDoubleDoor( door, zWall, T ) {

	const group = new THREE.Group();
	const frameMat = brassMaterial();
	const paint = doorPaintMaterial();
	const glass = wiredGlassMaterial( { glow: 0.05 } ); // 门后暖光只是微弱的漏光

	// —— 门框：两级台阶的门套（贴墙面的宽套线 + 门洞内的窄门挡）——
	const fw = 0.075, fo = 0.035;
	const fr = [];
	// 套线（墙面上）
	fr.push( rbox( door.x0 - fw, 0, zWall, door.x0, door.y1 + fw, zWall + fo, 0.01 ) );
	fr.push( rbox( door.x1, 0, zWall, door.x1 + fw, door.y1 + fw, zWall + fo, 0.01 ) );
	fr.push( rbox( door.x0 - fw, door.y1, zWall, door.x1 + fw, door.y1 + fw, zWall + fo, 0.01 ) );
	// 门洞内衬（贴洞口三面）
	fr.push( rbox( door.x0, 0, zWall - T, door.x0 + 0.02, door.y1, zWall, 0.004 ) );
	fr.push( rbox( door.x1 - 0.02, 0, zWall - T, door.x1, door.y1, zWall, 0.004 ) );
	fr.push( rbox( door.x0, door.y1 - 0.02, zWall - T, door.x1, door.y1, zWall, 0.004 ) );
	// 门挡条
	fr.push( rbox( door.x0 + 0.02, 0, zWall - T * 0.6, door.x0 + 0.045, door.y1 - 0.02, zWall - T * 0.6 + 0.03, 0.004 ) );
	fr.push( rbox( door.x1 - 0.045, 0, zWall - T * 0.6, door.x1 - 0.02, door.y1 - 0.02, zWall - T * 0.6 + 0.03, 0.004 ) );
	for ( const g of fr ) {

		const m = new THREE.Mesh( g, frameMat );
		m.castShadow = m.receiveShadow = true;
		group.add( m );

	}

	// —— 门扇（局部坐标：铰链在 x=0，门宽沿 +x 或 -x）——
	const leafW = ( door.x1 - door.x0 - 0.05 ) / 2, leafH = door.y1 - 0.04, th = 0.045;
	const glassMeshes = [];
	const makeLeaf = ( dirX ) => {

		const lg = new THREE.Group();
		const sx = ( a, b ) => dirX > 0 ? [ a, b ] : [ - b, - a ];
		const stile = 0.11, gx0 = stile, gx1 = leafW - stile, gy0 = 1.05, gy1 = leafH - 0.18;
		const parts = [
			[ ...sx( 0, stile ), 0, leafH ], // 铰链边梃
			[ ...sx( leafW - stile, leafW ), 0, leafH ], // 锁边梃
			[ ...sx( stile, leafW - stile ), 0, gy0 ], // 下冒头（大面板）
			[ ...sx( stile, leafW - stile ), gy1, leafH ], // 上冒头
		];
		for ( const [ a, b, y0, y1 ] of parts ) {

			const m = new THREE.Mesh( rbox( a, y0 + 0.02, - th / 2, b, y1 + 0.02, th / 2, 0.006 ), paint );
			m.castShadow = m.receiveShadow = true;
			lg.add( m );

		}

		// 下冒头的凹凸镶板线（推板 + 踢脚板）
		const [ ka, kb ] = sx( 0.04, leafW - 0.04 );
		const kick = new THREE.Mesh( rbox( ka, 0.02, th / 2, kb, 0.3, th / 2 + 0.004, 0.002 ), metalMaterial( { color: 0x3a3630, rust: 0.8 } ) );
		kick.castShadow = true; kick.receiveShadow = true;
		lg.add( kick );
		// 玻璃（不投影 → 门后暖光可以穿过玻璃照出来）
		const [ ga, gb ] = sx( gx0, gx1 );
		const gm = new THREE.Mesh( new THREE.PlaneGeometry( gb - ga, gy1 - gy0 ), glass );
		gm.position.set( ( ga + gb ) / 2, ( gy0 + gy1 ) / 2 + 0.02, 0 );
		gm.castShadow = false; gm.receiveShadow = true;
		lg.add( gm );
		glassMeshes.push( gm );
		// 玻璃压条
		const bead = metalMaterial( { color: 0x2a2824, rust: 0.4 } );
		for ( const [ a, b, y0, y1 ] of [ [ ga - 0.015, ga, gy0, gy1 ], [ gb, gb + 0.015, gy0, gy1 ], [ ga, gb, gy0 - 0.015, gy0 ], [ ga, gb, gy1, gy1 + 0.015 ] ] ) {

			const m = new THREE.Mesh( rbox( a, y0 + 0.02, - th / 2 - 0.008, b, y1 + 0.02, th / 2 + 0.008, 0.003 ), bead );
			m.castShadow = true;
			lg.add( m );

		}

		// 推杆把手
		const [ ha, hb ] = sx( leafW - 0.28, leafW - 0.06 );
		const handle = new THREE.Mesh( rbox( ha, 1.0, th / 2 + 0.02, hb, 1.04, th / 2 + 0.045, 0.01 ), frameMat );
		handle.castShadow = true;
		lg.add( handle );
		return lg;

	};

	const zc = zWall - T * 0.6 - th / 2 - 0.005;
	const left = makeLeaf( 1 );
	left.position.set( door.x0 + 0.025, 0, zc );
	left.rotation.y = 0.012; // 门扇略下垂歪斜
	const right = makeLeaf( - 1 );
	right.position.set( door.x1 - 0.025, 0, zc );
	right.rotation.y = 0.1; // 向门后虚掩：锁边向 -z 摆开约 8cm
	group.add( left, right );
	return { group, glassMeshes };

}

/**
 * 吊顶环形灯（参考图顶部的大圆环）：U 形钢槽灯体 + 碎裂的乳白灯罩（缺段）+ 三根吊索（一根断裂，灯体倾斜下坠）
 * + 垂下的电源线与半挂的灯罩碎片
 */
export function buildRingLamp( R = 0.8 ) {

	const lamp = new THREE.Group();
	const metal = metalMaterial( { color: 0x34302a, rust: 0.55, side: THREE.DoubleSide } );
	// U 形槽截面（开口朝下）
	const prof = [
		[ R - 0.07, - 0.005 ], [ R - 0.07, 0.07 ], [ R + 0.07, 0.07 ], [ R + 0.07, - 0.005 ], [ R + 0.062, - 0.005 ], [ R + 0.062, 0.062 ], [ R - 0.062, 0.062 ], [ R - 0.062, - 0.005 ],
	].map( ( [ x, y ] ) => new THREE.Vector2( x, y ) );
	const channel = new THREE.Mesh( new THREE.LatheGeometry( prof, 96 ), metal );
	lamp.add( channel );

	// 乳白灯罩：半圆截面的环（缺一段），裂纹 + 积灰 + 死虫斑点
	const opal = new THREE.MeshStandardNodeMaterial( { roughness: 0.45, metalness: 0, side: THREE.DoubleSide } );
	const p = positionWorld;
	const crack = smoothstep( 0.035, 0.0, mx_worley_noise_float( p.mul( 9.0 ), 1, 1 ).sub( 0.0 ).abs().mul( 0.25 ) );
	const dirt = n01( p.mul( 7 ), 3 );
	opal.colorNode = mix( vec3( 0.2, 0.195, 0.17 ), vec3( 0.08, 0.07, 0.05 ), smoothstep( 0.45, 0.8, dirt ) ).mul( float( 1 ).sub( crack.mul( 0.6 ) ) );
	opal.roughnessNode = mix( float( 0.25 ), float( 0.8 ), dirt );
	const dprof = [];
	for ( let i = 0; i <= 10; i ++ ) {

		const a = Math.PI * i / 10;
		dprof.push( new THREE.Vector2( R + Math.cos( a ) * 0.06, - Math.sin( a ) * 0.05 ) );

	}

	const diffuser = new THREE.Mesh( new THREE.LatheGeometry( dprof, 80, 0.4, Math.PI * 2 - 1.1 ), opal );
	lamp.add( diffuser );
	// 半挂的灯罩碎片：从缺口处垂下
	const shard = new THREE.Mesh( new THREE.LatheGeometry( dprof, 10, 0, 0.45 ), opal );
	shard.position.set( 0, - 0.02, 0 );
	shard.rotation.set( 0.0, - 0.35, 0.0 );
	const shardPivot = new THREE.Group();
	shardPivot.add( shard );
	shardPivot.rotation.set( 0, 0, 0 );
	lamp.add( shardPivot );
	const sh2 = shard.clone();
	sh2.rotation.set( 0.9, - 0.1, 0.35 );
	sh2.position.set( Math.cos( 0.2 ) * 0.1, - 0.35, - Math.sin( 0.2 ) * 0.1 );
	lamp.add( sh2 );

	// 灯管（裸露的 T5 荧光灯管段，暗）
	const tubeMat = new THREE.MeshStandardNodeMaterial( { color: 0x8a8a80, roughness: 0.3 } );
	const tube = new THREE.Mesh( new THREE.TorusGeometry( R, 0.009, 6, 90, 1.4 ), tubeMat );
	tube.rotation.x = Math.PI / 2;
	tube.rotation.z = 0.2;
	tube.position.y = 0.025;
	lamp.add( tube );
	lamp.traverse( ( o ) => { if ( o.isMesh ) o.castShadow = o.receiveShadow = true; } );
	return lamp;

}

// 悬垂电线（悬链线，TubeGeometry）：a → b，sag 下垂量
export function cable( a, b, sag = 0.3, r = 0.006, tail = null ) {

	const pts = [];
	for ( let i = 0; i <= 12; i ++ ) {

		const t = i / 12;
		const p = a.clone().lerp( b, t );
		p.y -= Math.sin( Math.PI * t ) * sag;
		pts.push( p );

	}

	if ( tail ) for ( const q of tail ) pts.push( q );
	return new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts ), pts.length * 4, r, 5, false );

}

// 吊顶矿棉板材质（60×60 方板，边缘有缺损、水渍、霉点）
let _tileMat = null;
export function ceilingTileMaterial() {

	if ( _tileMat ) return _tileMat;
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.95, metalness: 0 } );
	const p = positionWorld;
	const pin = mx_fractal_noise_float( p.mul( 60 ), 2, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 ); // 矿棉针孔纹理
	const stain = n01( p.mul( 2.2 ), 4 );
	const ring = fract( stain.mul( 5 ) );
	let col = vec3( 0.085, 0.083, 0.075 ).mul( pin.mul( 0.4 ).add( 0.8 ) );
	col = col.mul( mix( 1.0, 0.35, smoothstep( 0.45, 0.75, stain ) ) );
	col = col.mul( float( 1 ).sub( smoothstep( 0.92, 1.0, ring ).mul( 0.3 ) ) );
	// 泡水的一端：深褐
	const wet = smoothstep( WATER_Y + 0.25, WATER_Y, p.y );
	col = mix( col, col.mul( vec3( 0.4, 0.36, 0.28 ) ), wet );
	m.colorNode = col;
	_tileMat = m;
	return m;

}

/**
 * 泡水纸张：卷曲的网格，四角翘起或下沉；随机一部分没入水面以下（水不透明，自然被“切”掉）
 */
export function soggyPaper( rng, w = 0.21, h = 0.29 ) {

	const g = new THREE.PlaneGeometry( w, h, 6, 8 );
	const pa = g.attributes.position;
	const curlX = ( rng() - 0.5 ) * 0.25, curlY = ( rng() - 0.5 ) * 0.2, sink = rng() * 0.012;
	for ( let k = 0; k < pa.count; k ++ ) {

		const x = pa.getX( k ) / w, y = pa.getY( k ) / h;
		const z = curlX * x * x * w + curlY * y * y * h - sink + ( rng() - 0.5 ) * 0.002;
		pa.setZ( k, z );

	}

	g.computeVertexNormals();
	return g;

}

// 泡水纸张材质：发灰的旧纸、印刷字行、吸水后半透明暗斑
export function paperMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.6, side: THREE.DoubleSide } );
	const u = uv();
	const lines = smoothstep( 0.35, 0.5, abs( fract( u.y.mul( 34 ) ).sub( 0.5 ) ) ).mul( smoothstep( 0.08, 0.12, u.x ).mul( smoothstep( 0.92, 0.88, u.x ) ) ).mul( smoothstep( 0.08, 0.12, u.y ).mul( smoothstep( 0.9, 0.86, u.y ) ) );
	const n = n01( positionWorld.mul( 9 ), 3 );
	let col = vec3( 0.075, 0.07, 0.06 ).mul( float( 1 ).sub( lines.mul( n01( positionWorld.mul( 40 ), 1 ) ).mul( 0.4 ) ) );
	col = col.mul( mix( 1.0, 0.45, smoothstep( 0.4, 0.7, n ) ) ); // 吸水暗斑
	m.colorNode = col;
	m.roughnessNode = mix( float( 0.75 ), float( 0.3 ), smoothstep( 0.4, 0.7, n ) );
	return m;

}

export { ceilingMaterial, max };
