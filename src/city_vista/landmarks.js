// 城市远景：地标与道具
//   · 哥特教堂（多尖塔剪影）
//   · 高架轨道桥 + 灯杆（中景横向分隔层）
//   · 远山（雪顶，被大气透视染成蓝灰）
//   · 铁丝网围栏（Poly Haven 模块，部分倒伏）、记分牌标牌、废弃巴士与车辆
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, float, vec2, vec3, vec4, mix, smoothstep, texture, uv, attribute, positionWorld, normalWorldGeometry,
	mx_fractal_noise_float, luminance, abs, max, step, fract, floor,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxMeters, rng, fbm2, canvasTexture } from './util.js';
import { InstanceBatch, trs, loadTexture } from '../world/assets.js';
import { terrainH } from './ground.js';

const n01 = ( p, oct = 3 ) => mx_fractal_noise_float( p, oct, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );

// —— 通用风化石材/混凝土材质（远景，无贴图）——
function stoneMaterial( base, { moss = 0.4 } = {} ) {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.9, metalness: 0 } );
	const p = positionWorld;
	const grime = n01( vec3( p.x.mul( 0.15 ), p.y.mul( 0.05 ), p.z.mul( 0.15 ) ), 3 );
	const streak = n01( vec3( p.x.mul( 1.3 ).add( p.z.mul( 1.3 ) ), p.y.mul( 0.04 ), 2 ), 2 );
	let col = vec3( base ).mul( grime.mul( 0.4 ).add( 0.75 ) ).mul( float( 1 ).sub( smoothstep( 0.55, 0.85, streak ).mul( 0.35 ) ) );
	const up = smoothstep( 0.5, 0.9, normalWorldGeometry.y );
	const mossK = up.mul( smoothstep( 0.45, 0.6, n01( p.mul( 0.4 ), 2 ) ) ).mul( moss );
	col = mix( col, vec3( 0.05, 0.07, 0.02 ), mossK );
	m.colorNode = col;
	return m;

}

// —— 哥特教堂 ——
function spire( x, z, baseY, w, h, sides = 8 ) {

	const g = [];
	const shaftH = h * 0.45;
	const shaft = new THREE.CylinderGeometry( w * 0.5, w * 0.55, shaftH, sides );
	shaft.translate( 0, baseY + shaftH / 2, 0 );
	g.push( shaft );
	const cone = new THREE.ConeGeometry( w * 0.5, h - shaftH, sides );
	cone.translate( 0, baseY + shaftH + ( h - shaftH ) / 2, 0 );
	g.push( cone );
	// 环绕的小尖塔
	for ( let i = 0; i < 4; i ++ ) {

		const a = i / 4 * Math.PI * 2 + Math.PI / 4;
		const pn = new THREE.ConeGeometry( w * 0.12, h * 0.22, 4 );
		pn.translate( Math.cos( a ) * w * 0.55, baseY + shaftH + h * 0.08, Math.sin( a ) * w * 0.55 );
		g.push( pn );

	}

	const m = mergeGeometries( g.map( ( x ) => x.toNonIndexed() ) );
	m.translate( x, 0, z );
	return m;

}

export function buildChurch( cx, cz, ry = 0.1 ) {

	const g = [];
	const nr = ( a ) => a.toNonIndexed();
	// 中殿：长方体 + 尖顶屋面
	const nave = boxMeters( 22, 26, 70 ); g.push( nr( nave ) );
	const roof = new THREE.CylinderGeometry( 0.01, 13, 14, 4, 1, false, Math.PI / 4 );
	roof.scale( 1, 1, 70 / 18.4 ); roof.rotateY( 0 ); roof.translate( 0, 26 + 7, 0 );
	g.push( nr( roof ) );
	// 西立面双塔
	for ( const sx of [ - 13, 13 ] ) {

		const tw = boxMeters( 12, 52, 12 ); tw.translate( sx, 0, 34 ); g.push( nr( tw ) );
		g.push( spire( sx, 34, 52, 11, 36 ) );
		// 塔身扶壁
		for ( const k of [ - 1, 1 ] ) {

			const b = boxMeters( 2, 46, 2 ); b.translate( sx + k * 6.5, 0, 40.5 ); g.push( nr( b ) );
			const pn = new THREE.ConeGeometry( 1.2, 7, 4 ); pn.translate( sx + k * 6.5, 49.5, 40.5 ); g.push( nr( pn ) );

		}

	}

	// 中央十字交叉塔 + 高尖塔
	const ct = boxMeters( 14, 40, 14 ); ct.translate( 0, 0, - 6 ); g.push( nr( ct ) );
	g.push( spire( 0, - 6, 40, 10, 58 ) );
	// 两侧飞扶壁与小尖塔
	for ( let i = 0; i < 7; i ++ ) {

		const z = - 30 + i * 9;
		for ( const sx of [ - 14, 14 ] ) {

			const b = boxMeters( 2.2, 30, 3 ); b.translate( sx, 0, z ); g.push( nr( b ) );
			const pn = new THREE.ConeGeometry( 1.3, 9, 4 ); pn.translate( sx, 34.5, z ); g.push( nr( pn ) );

		}

	}

	// 后殿（半圆）
	const apse = new THREE.CylinderGeometry( 11, 11, 24, 10, 1, false, 0, Math.PI ); apse.rotateY( Math.PI / 2 ); apse.translate( 0, 12, - 35 ); g.push( nr( apse ) );
	const geo = mergeGeometries( g.map( ( x ) => { if ( x.attributes.uv ) x.deleteAttribute( 'uv' ); return x; } ) );
	geo.computeVertexNormals();
	geo.rotateY( ry );
	geo.translate( cx, 0, cz );
	const mesh = new THREE.Mesh( geo, stoneMaterial( new THREE.Color( 0.42, 0.41, 0.38 ), { moss: 0.5 } ) );
	mesh.castShadow = mesh.receiveShadow = true;
	mesh.name = 'church';
	return mesh;

}

// —— 远山：环形高度场（只覆盖镜头前方扇形）——
export function buildMountains() {

	const R0 = 1300, R1 = 2600, NA = 260, NR = 40;
	const a0 = - 1.4, a1 = 1.4; // 扇形角度（以 -Z 为 0）
	const pos = [], idx = [];
	for ( let j = 0; j <= NR; j ++ ) {

		const t = j / NR, r = R0 + ( R1 - R0 ) * t;
		for ( let i = 0; i <= NA; i ++ ) {

			const a = a0 + ( a1 - a0 ) * i / NA;
			const x = Math.sin( a ) * r, z = - Math.cos( a ) * r;
			// 山脊：ridged fbm，距离越远越高；中间稍低露出天空
			let h = 0, amp = 1, f = 1;
			for ( let o = 0; o < 6; o ++ ) {

				const n = 1 - Math.abs( fbm2( x * 0.0011 * f + o * 3.7, z * 0.0011 * f - o * 1.3, 1 ) * 2 - 1 );
				h += n * n * amp; amp *= 0.5; f *= 2.1;

			}

			const prof = Math.sin( Math.PI * Math.min( 1, t * 1.6 ) ) * ( 0.55 + 0.45 * t );
			h = h * 520 * prof - 40 + ( 1 - Math.abs( a ) / 1.4 ) * 60;
			pos.push( x, Math.max( - 40, h ), z );

		}

	}

	for ( let j = 0; j < NR; j ++ ) for ( let i = 0; i < NA; i ++ ) {

		const a = j * ( NA + 1 ) + i, b = a + 1, c = a + NA + 1, d = c + 1;
		idx.push( a, b, c, b, d, c );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.95, metalness: 0 } );
	const p = positionWorld;
	const slope = normalWorldGeometry.y;
	// 雪线：高处 + 平缓处有积雪，岩石为灰褐
	const snowLine = n01( p.mul( 0.004 ), 3 ).mul( 160 ).add( 250 );
	const snow = smoothstep( snowLine, snowLine.add( 60 ), p.y ).mul( smoothstep( 0.45, 0.75, slope ) );
	const rock = vec3( 0.16, 0.16, 0.155 ).mul( n01( p.mul( 0.02 ), 3 ).mul( 0.6 ).add( 0.6 ) );
	const forest = vec3( 0.05, 0.065, 0.04 ).mul( smoothstep( 260, 120, p.y ) );
	m.colorNode = mix( mix( rock, forest, smoothstep( 200, 80, p.y ).mul( 0.8 ) ), vec3( 0.5, 0.52, 0.56 ), snow );
	const mesh = new THREE.Mesh( g, m );
	mesh.receiveShadow = false;
	mesh.castShadow = false;
	mesh.name = 'mountains';
	return mesh;

}

// —— 高架轨道桥（中景横向结构）——
export function buildOverpass( z = - 124 ) {

	const parts = [];
	const nr = ( g ) => { const n = g.toNonIndexed(); return n; };
	const L = 420, H = 7.5;
	const deck = boxMeters( L, 1.6, 9 ); deck.translate( 0, H, z ); parts.push( nr( deck ) );
	const parapetA = boxMeters( L, 1.3, 0.35 ); parapetA.translate( 0, H + 1.6, z + 4.3 ); parts.push( nr( parapetA ) );
	const parapetB = boxMeters( L, 1.3, 0.35 ); parapetB.translate( 0, H + 1.6, z - 4.3 ); parts.push( nr( parapetB ) );
	for ( let x = - L / 2 + 10; x < L / 2; x += 24 ) {

		const p = boxMeters( 2.2, H, 3.2 ); p.translate( x, 0, z ); parts.push( nr( p ) );

	}

	const geo = mergeGeometries( parts.map( ( g ) => { g.deleteAttribute( 'uv' ); return g; } ) );
	const mesh = new THREE.Mesh( geo, stoneMaterial( new THREE.Color( 0.33, 0.33, 0.31 ), { moss: 0.7 } ) );
	mesh.castShadow = mesh.receiveShadow = true;
	mesh.name = 'overpass';

	// 灯杆 / 信号杆（细长剪影）
	const poles = [];
	for ( let x = - L / 2 + 4; x < L / 2; x += 18 ) {

		const p = new THREE.CylinderGeometry( 0.12, 0.16, 8, 6 ); p.translate( x, H + 1.6 + 4, z + 4 ); poles.push( nr( p ) );
		const arm = boxMeters( 0.12, 0.12, 2.6 ); arm.translate( x, H + 1.6 + 7.6, z + 3 ); poles.push( nr( arm ) );
		const box = boxMeters( 0.5, 1.1, 0.4 ); box.translate( x, H + 1.6 + 6.2, z + 4.3 ); poles.push( nr( box ) );

	}

	const pg = mergeGeometries( poles.map( ( g ) => { if ( g.attributes.uv ) g.deleteAttribute( 'uv' ); return g; } ) );
	const pm = new THREE.MeshStandardNodeMaterial( { color: 0x1d1e1c, roughness: 0.7, metalness: 0.4 } );
	const poleMesh = new THREE.Mesh( pg, pm );
	poleMesh.castShadow = true;
	const grp = new THREE.Group();
	grp.add( mesh, poleMesh );
	return grp;

}

// —— 记分牌标牌（右侧中景）——
export function buildSign( x, z, ry ) {

	const t = canvasTexture( 1024, 640, ( c, w, h ) => {

		c.fillStyle = '#2a3e57'; c.fillRect( 0, 0, w, h );
		// 褪色与锈斑
		for ( let i = 0; i < 900; i ++ ) {

			c.fillStyle = `rgba(${120 + Math.random() * 60},${110 + Math.random() * 40},${90},${Math.random() * 0.12})`;
			const s = Math.random() * 30;
			c.fillRect( Math.random() * w, Math.random() * h, s, s * 0.6 );

		}

		c.fillStyle = '#d9dbd2';
		c.fillRect( 30, 30, w - 60, 130 );
		c.fillStyle = '#1d3a63';
		c.font = 'bold 74px Arial';
		c.textAlign = 'center';
		c.fillText( 'MILLBROOK  FIELD', w / 2, 122 );
		c.fillStyle = '#d9dbd2';
		c.font = 'bold 54px Arial';
		c.fillText( 'HOME', w * 0.27, 250 ); c.fillText( 'GUEST', w * 0.73, 250 );
		c.fillStyle = '#0c0d0e';
		for ( const cx of [ 0.27, 0.73 ] ) c.fillRect( w * cx - 120, 280, 240, 150 );
		c.fillStyle = '#7d3a2a';
		c.font = 'bold 120px monospace';
		c.fillText( '0', w * 0.27, 400 ); c.fillText( '0', w * 0.73, 400 );
		c.fillStyle = '#d9dbd2';
		c.font = 'bold 44px Arial';
		c.fillText( 'BALL   STRIKE   OUT', w / 2, 520 );
		c.fillStyle = '#0c0d0e';
		for ( let i = 0; i < 9; i ++ ) c.fillRect( 160 + i * 80, 550, 50, 50 );
		// 流痕
		for ( let i = 0; i < 60; i ++ ) {

			c.fillStyle = 'rgba(30,25,18,0.18)';
			c.fillRect( Math.random() * w, 0, 2 + Math.random() * 5, 100 + Math.random() * 500 );

		}

	} );
	const grp = new THREE.Group();
	const boardMat = new THREE.MeshStandardNodeMaterial( { map: t, roughness: 0.7, metalness: 0.2 } );
	const frameMat = new THREE.MeshStandardNodeMaterial( { color: 0x2b2c2a, roughness: 0.6, metalness: 0.6 } );
	const W = 6.4, H = 4;
	const board = new THREE.Mesh( new THREE.PlaneGeometry( W, H ), boardMat );
	board.position.set( 0, 4.6 + H / 2, 0.08 );
	const back = new THREE.Mesh( new THREE.BoxGeometry( W + 0.3, H + 0.3, 0.14 ), frameMat );
	back.position.set( 0, 4.6 + H / 2, 0 );
	grp.add( board, back );
	for ( const sx of [ - W * 0.35, W * 0.35 ] ) {

		const post = new THREE.Mesh( new THREE.CylinderGeometry( 0.12, 0.14, 4.8, 8 ), frameMat );
		post.position.set( sx, 2.4, - 0.15 );
		grp.add( post );

	}

	grp.traverse( ( o ) => { if ( o.isMesh ) o.castShadow = o.receiveShadow = true; } );
	grp.position.set( x, terrainH( x, z ) - 0.1, z );
	grp.rotation.y = ry;
	return grp;

}

// —— 铁丝网围栏：沿折线放置 2m 模块（部分倒伏/缺失）——
export function buildFences( kit, lines ) {

	const batch = new InstanceBatch();
	const r = rng( 515 );
	const fix = ( mat ) => {

		if ( mat.userData.cv ) return;
		mat.userData.cv = true;
		// 生锈：降低金属感、偏褐
		if ( /posts/.test( mat.name ) ) { mat.color = new THREE.Color( 0.42, 0.38, 0.33 ); mat.metalness = 0.4; }
		if ( /wire/.test( mat.name ) ) { mat.color = new THREE.Color( 0.3, 0.28, 0.25 ); mat.metalness = 0.3; mat.roughness = 0.75; }

	};

	for ( const list of Object.values( kit.parts ) ) for ( const { material } of list ) fix( material );
	for ( const line of lines ) {

		for ( let i = 0; i < line.length - 1; i ++ ) {

			const [ ax, az ] = line[ i ], [ bx, bz ] = line[ i + 1 ];
			const len = Math.hypot( bx - ax, bz - az );
			const n = Math.floor( len / 2 );
			const ry = Math.atan2( - ( bz - az ), bx - ax );
			for ( let k = 0; k < n; k ++ ) {

				const t0 = ( k + 1 ) / n;
				const x = ax + ( bx - ax ) * t0, z = az + ( bz - az ) * t0;
				const y = terrainH( x, z ) - 0.05;
				const roll = r();
				if ( roll < 0.08 ) continue; // 缺失的一段
				const lean = roll < 0.22 ? ( r() - 0.5 ) * 0.5 : ( r() - 0.5 ) * 0.06;
				const m = trs( x, y, z, ry, 1, 0, lean );
				batch.add( kit.parts, 'modular_chainlink_fence_double', m );
				batch.add( kit.parts, 'modular_chainlink_fence_post', trs( x, y, z, ry, 1, 0, lean ) );

			}

		}

	}

	const g = batch.build();
	// 铁丝网细节太细，阴影性价比低：只让立柱投影
	g.traverse( ( o ) => { if ( o.isMesh && /wire/.test( o.material.name ) ) o.castShadow = false; } );
	return g;

}

// —— 废弃巴士（程序化低模）——
export function buildBus( x, z, ry ) {

	const grp = new THREE.Group();
	const body = new THREE.MeshStandardNodeMaterial( { roughness: 0.6, metalness: 0.3 } );
	const p = positionWorld;
	const q = uv();
	// 蓝白涂装 + 车窗带 + 锈蚀
	const winBand = step( 1.45, q.y ).mul( step( q.y, 2.35 ) );
	const winCell = step( 0.12, fract( q.x.div( 1.4 ) ) );
	const rust = smoothstep( 0.55, 0.75, n01( p.mul( 1.5 ), 3 ) );
	let col = mix( vec3( 0.12, 0.17, 0.3 ), vec3( 0.55, 0.56, 0.55 ), step( 2.35, q.y ) );
	col = mix( col, vec3( 0.02, 0.025, 0.03 ), winBand.mul( winCell ) );
	col = mix( col, vec3( 0.18, 0.09, 0.04 ), rust.mul( 0.7 ) );
	body.colorNode = col;
	const b = new THREE.Mesh( boxMeters( 2.5, 3.0, 11 ), body );
	b.position.y = 0.45;
	grp.add( b );
	const wheelM = new THREE.MeshStandardNodeMaterial( { color: 0x111111, roughness: 0.9 } );
	for ( const wz of [ - 3.6, 3.6 ] ) for ( const wx of [ - 1.15, 1.15 ] ) {

		const w = new THREE.Mesh( new THREE.CylinderGeometry( 0.5, 0.5, 0.35, 12 ), wheelM );
		w.rotation.z = Math.PI / 2; w.position.set( wx, 0.45, wz ); grp.add( w );

	}

	grp.traverse( ( o ) => { if ( o.isMesh ) o.castShadow = o.receiveShadow = true; } );
	grp.position.set( x, terrainH( x, z ) - 0.05, z );
	grp.rotation.y = ry;
	return grp;

}

void Fn; void uniform; void vec2; void vec4; void texture; void attribute; void luminance; void abs; void max; void floor; void loadTexture;
