// 道具与布景：废弃车辆、公交车、军用路障/沙袋、铁丝网+刺网、瓦砾、电线杆与电线、碎屑
import * as THREE from 'three/webgpu';
import {
	float, vec2, vec3, vec4, mix, smoothstep, step, positionWorld, positionLocal, normalLocal, normalWorldGeometry, luminance,
	mx_fractal_noise_float, abs, fract, floor, materialColor, texture, uv,
} from 'three/tsl';
import { InstanceBatch, trs } from '../world/assets.js';
import { rng } from './noise.js';
import { texSet, triplanar, weatherMat, W } from './materials.js';
import { SHADOW_LAYER } from './atmosphere.js';
import { groundY } from './layout.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addOccluder } from './groundmap.js';
import { M4 } from './geo.js';

const enableShadow = ( o ) => o.traverse( ( c ) => {

	if ( c.isMesh ) { c.castShadow = true; c.receiveShadow = true; c.layers.enable( SHADOW_LAYER ); }

} );

// 给模型材质统一加废土层（只处理一次）
const _weathered = new Set();
export function weatherModel( M, { moss = 0.8, streak = 0.6, desat = 0.6, dark = 0.85 } = {} ) {

	for ( const list of Object.values( M.parts ) ) for ( const { material: m } of list ) {

		if ( _weathered.has( m ) || m.transparent ) continue;
		_weathered.add( m );
		const b = materialColor.rgb;
		weatherMat( m, { moss, streak, baseNode: mix( vec3( luminance( b ) ), b, 1 - desat ).mul( dark ) } );

	}

}

// —— 锈蚀金属材质（车身/公交）：油漆底色 + 锈斑噪声 + 掉漆 ——
export function rustPaint( paint, { scale = 0.5, rust = 0.55 } = {} ) {

	const R = texSet( 'rust_coarse_01', '1k' ), P = texSet( 'rusty_painted_metal', '1k' );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.7, metalness: 0.3 } );
	const p = positionWorld;
	const rc = triplanar( R.diff, scale * 2 ).rgb;
	const rustC = mix( vec3( luminance( rc ) ), rc, 0.55 ).mul( 0.6 );
	const chip = luminance( triplanar( P.diff, scale * 2 ).rgb );
	const n = mx_fractal_noise_float( p.mul( 2.2 ), 4, 2.0, 0.6 ).mul( 0.5 ).add( 0.5 );
	// 下半部锈得更重（积水、溅泥）
	const low = smoothstep( 1.4, 0.2, p.y ).mul( 0.25 );
	const rk = smoothstep( 0.62 - rust * 0.3, 0.7 - rust * 0.3, n.add( low ).add( chip.mul( 0.25 ) ) );
	const paintC = vec3( paint ).mul( chip.mul( 0.5 ).add( 0.6 ) );
	const base = mix( paintC, rustC, rk );
	weatherMat( m, { moss: 0.6, streak: 0.8, grime: 1.2, baseNode: base, roughNode: mix( float( 0.5 ), float( 0.95 ), rk ) } );
	m.metalnessNode = mix( float( 0.35 ), float( 0.1 ), rk );
	return m;

}

// —— 沙袋墙：扁平椭球实例，错缝堆叠，粗麻布贴图 ——
export function makeSandbags( segments ) {

	const T = texSet( 'hessian_230', '1k' );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 1 } );
	const d = triplanar( T.diff, 3.0 ).rgb;
	weatherMat( m, { moss: 0.9, streak: 0.4, grime: 1.4, baseNode: mix( vec3( luminance( d ) ), d, 0.5 ).mul( vec3( 0.95, 0.9, 0.76 ) ).mul( 0.3 ) } );
	const geo = new THREE.SphereGeometry( 0.5, 16, 10 );
	// 超椭球（偏方）→ 枕头形：四角饱满、顶面平缓、扎口一端收窄
	const pos = geo.attributes.position;
	const sp = ( v, e ) => Math.sign( v ) * Math.pow( Math.abs( v ) * 2, e ) * 0.5;
	for ( let i = 0; i < pos.count; i ++ ) {

		const x = pos.getX( i ), y = pos.getY( i ), z = pos.getZ( i );
		const pinch = x > 0.3 ? 1 - ( x - 0.3 ) * 0.9 : 1;
		pos.setXYZ( i, sp( x, 0.55 ), sp( y, 0.8 ) * pinch, sp( z, 0.6 ) * pinch );

	}

	geo.computeVertexNormals();
	const mats = [];
	const r = rng( 77 );
	for ( const { x, z, ry, len, rows, gy = 0 } of segments ) {

		const n = Math.ceil( len / 0.62 );
		const c = Math.cos( ry ), s = Math.sin( ry );
		addOccluder( x, z, len / 2 + 0.2, 0.3, ry, 0.5, 0.7 );
		for ( let row = 0; row < rows; row ++ ) {

			for ( let i = 0; i < n - ( row % 2 ); i ++ ) {

				const u = ( i - ( n - 1 ) / 2 + ( row % 2 ) * 0.5 ) * 0.62;
				const px = x + c * u + ( r() - 0.5 ) * 0.04, pz = z - s * u + ( r() - 0.5 ) * 0.04;
				const mm = new THREE.Matrix4().compose(
					new THREE.Vector3( px, gy + 0.11 + row * 0.2, pz ),
					new THREE.Quaternion().setFromEuler( new THREE.Euler( ( r() - 0.5 ) * 0.12, ry + ( r() - 0.5 ) * 0.2, ( r() - 0.5 ) * 0.1 ) ),
					new THREE.Vector3( 0.62, 0.24, 0.38 ),
				);
				mats.push( mm );

			}

		}

	}

	const im = new THREE.InstancedMesh( geo, m, mats.length );
	mats.forEach( ( mm, i ) => im.setMatrixAt( i, mm ) );
	enableShadow( im );
	return im;

}

// —— 蛇腹刺网（螺旋线圈）——
export function makeConcertina( runs ) {

	const pts = [];
	const coil = 0.42, pitch = 0.22;
	for ( let t = 0; t < 1; t += 1 / 120 ) {

		const a = t * Math.PI * 2 * ( 1 / pitch ) * 1.0;
		pts.push( new THREE.Vector3( t * 1.0 / 1, Math.sin( a ) * coil, Math.cos( a ) * coil ) );

	}

	// 1m 一段，沿 x
	const path = new THREE.CatmullRomCurve3( pts );
	const tube = new THREE.TubeGeometry( path, 200, 0.008, 3, false );
	// 刀片刺：沿线圈每 6cm 一片小菱形（双面薄片）
	const barbs = [];
	const L0 = path.getLength();
	for ( let d = 0; d < L0; d += 0.06 ) {

		const t = d / L0;
		const p = path.getPointAt( t ), tg = path.getTangentAt( t );
		const b = new THREE.PlaneGeometry( 0.045, 0.012 );
		b.lookAt( tg );
		b.rotateX( Math.random() * 3 );
		b.translate( p.x, p.y, p.z );
		barbs.push( b.toNonIndexed() );

	}

	const geo = mergeGeometries( [ tube.toNonIndexed(), ...barbs ].map( ( g ) => { g.deleteAttribute( 'uv' ); return g; } ) );
	const m = new THREE.MeshStandardNodeMaterial( { color: 0x2a231d, roughness: 0.75, metalness: 0.3, side: THREE.DoubleSide } );
	const mats = [];
	const r = rng( 3 );
	for ( const { x0, z0, x1, z1, y } of runs ) {

		const dx = x1 - x0, dz = z1 - z0, len = Math.hypot( dx, dz );
		const ry = - Math.atan2( dz, dx );
		for ( let u = 0; u < len; u += 0.98 ) {

			const sag = r() * 0.08;
			mats.push( new THREE.Matrix4().compose( new THREE.Vector3( x0 + dx * u / len, y + coil - sag, z0 + dz * u / len ), new THREE.Quaternion().setFromEuler( new THREE.Euler( r() * 0.3, ry, 0 ) ), new THREE.Vector3( 1, 0.9 + r() * 0.2, 1 ) ) );

		}

	}

	const im = new THREE.InstancedMesh( geo, m, mats.length );
	mats.forEach( ( mm, i ) => im.setMatrixAt( i, mm ) );
	enableShadow( im );
	return im;

}

// —— 瓦砾：随机多面体碎块 + 钢筋 ——
export function makeRubble( piles ) {

	const T = texSet( 'concrete_layers_02', '1k' );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 1 } );
	const d = triplanar( T.diff, 0.8 ).rgb;
	weatherMat( m, { moss: 1.3, streak: 0.3, grime: 1, baseNode: vec3( luminance( d ) ).mul( 0.85 ), roughNode: triplanar( T.arm, 0.8 ).g } );
	// 3 种碎块形状
	// 碎块形状：多面体（混凝土块）、扁板（楼板碎片，带倒角）、砖块
	const slabG = new THREE.BoxGeometry( 1, 0.22, 0.8, 2, 1, 2 );
	{ const p = slabG.attributes.position; for ( let i = 0; i < p.count; i ++ ) { p.setX( i, p.getX( i ) * ( 1 + ( Math.sin( i * 12.9 ) * 0.15 ) ) ); p.setZ( i, p.getZ( i ) * ( 1 + Math.cos( i * 7.1 ) * 0.2 ) ); } slabG.computeVertexNormals(); }
	const shapes = [ new THREE.DodecahedronGeometry( 0.5, 0 ), new THREE.IcosahedronGeometry( 0.5, 0 ), slabG, new THREE.BoxGeometry( 0.23, 0.07, 0.11 ) ];
	const lists = shapes.map( () => [] );
	const rebar = [];
	const r = rng( 101 );
	for ( const { x, z, radius, height, count, gy = 0, size = 1, rebar: hasRebar = true } of piles ) {

		addOccluder( x, z, radius * 0.6, radius * 0.6, 0, radius * 0.25, 0.55 );
		for ( let i = 0; i < count; i ++ ) {

			const a = r() * Math.PI * 2, dd = Math.pow( r(), 0.7 ) * radius;
			// 锥形堆：高度随离中心距离线性下降，碎块落在锥面上（不悬空）
			const hh = Math.max( 0, ( 1 - dd / radius ) ) * height;
			const s = ( 0.25 + Math.pow( r(), 2.2 ) * 1.4 ) * ( 0.6 + ( 1 - dd / radius ) * 0.6 ) * size;
			const k = r() < 0.18 ? 3 : Math.floor( r() * 3 );
			const sk = k === 3 ? 1 + r() * 0.3 : s;
			lists[ k ].push( new THREE.Matrix4().compose(
				new THREE.Vector3( x + Math.cos( a ) * dd, gy + hh * ( 0.75 + r() * 0.25 ) + ( k === 3 ? 0.03 : s * 0.12 ), z + Math.sin( a ) * dd ),
				new THREE.Quaternion().setFromEuler( new THREE.Euler( r() * 6, r() * 6, r() * 6 ) ),
				k === 3 ? new THREE.Vector3( sk, sk, sk ) : new THREE.Vector3( s * ( 0.7 + r() * 0.6 ), s * ( 0.4 + r() * 0.4 ), s * ( 0.7 + r() * 0.6 ) ),
			) );

		}

		for ( let i = 0; i < ( hasRebar ? count / 25 : 0 ); i ++ ) {

			const a = r() * Math.PI * 2, dd = r() * radius * 0.7;
			rebar.push( new THREE.Matrix4().compose( new THREE.Vector3( x + Math.cos( a ) * dd, gy + height * 0.4, z + Math.sin( a ) * dd ), new THREE.Quaternion().setFromEuler( new THREE.Euler( ( r() - 0.5 ) * 1.8, r() * 6, ( r() - 0.5 ) * 1.8 ) ), new THREE.Vector3( 1, 1 + r() * 1.5, 1 ) ) );

		}

	}

	const g = new THREE.Group();
	const bt = texSet( 'red_brick_03', '1k' );
	const bm = new THREE.MeshStandardNodeMaterial( { roughness: 1 } );
	weatherMat( bm, { moss: 1.2, streak: 0, baseNode: mix( vec3( luminance( triplanar( bt.diff, 2 ).rgb ) ), triplanar( bt.diff, 2 ).rgb, 0.6 ).mul( 0.6 ) } );
	lists.forEach( ( l, k ) => {

		if ( ! l.length ) return;
		const im = new THREE.InstancedMesh( shapes[ k ], k === 3 ? bm : m, l.length );
		l.forEach( ( mm, i ) => im.setMatrixAt( i, mm ) );
		enableShadow( im );
		g.add( im );

	} );
	const rm = new THREE.MeshStandardNodeMaterial( { color: 0x3a2a1e, roughness: 0.8, metalness: 0.5 } );
	const rg = new THREE.CylinderGeometry( 0.012, 0.012, 1.6, 4 );
	rg.translate( 0, 0.8, 0 );
	const ri = new THREE.InstancedMesh( rg, rm, rebar.length );
	rebar.forEach( ( mm, i ) => ri.setMatrixAt( i, mm ) );
	g.add( ri );
	return g;

}

// —— 电线杆与下垂电线（ref4 的天际线细节）——
export function makePoles( poles ) {

	const g = new THREE.Group();
	const T = texSet( 'weathered_planks', '1k' );
	const wood = new THREE.MeshStandardNodeMaterial( { roughness: 1 } );
	weatherMat( wood, { moss: 0.8, streak: 0.8, baseNode: triplanar( T.diff, 0.8 ).rgb.mul( vec3( 0.45, 0.42, 0.38 ) ) } );
	const poleGeo = new THREE.CylinderGeometry( 0.12, 0.17, 10, 8 ); poleGeo.translate( 0, 5, 0 );
	const armGeo = new THREE.BoxGeometry( 2.2, 0.12, 0.12 );
	const im = new THREE.InstancedMesh( poleGeo, wood, poles.length );
	const am = new THREE.InstancedMesh( armGeo, wood, poles.length );
	const tops = [];
	poles.forEach( ( p, i ) => {

		const q = new THREE.Quaternion().setFromEuler( new THREE.Euler( p.tx || 0, p.ry || 0, p.tz || 0 ) );
		const m = new THREE.Matrix4().compose( new THREE.Vector3( p.x, p.y || 0, p.z ), q, new THREE.Vector3( 1, 1, 1 ) );
		im.setMatrixAt( i, m );
		const armPos = new THREE.Vector3( 0, 9.3, 0 ).applyMatrix4( m );
		am.setMatrixAt( i, new THREE.Matrix4().compose( armPos, q, new THREE.Vector3( 1, 1, 1 ) ) );
		tops.push( [ - 1, - 0.35, 0.35, 1 ].map( ( o ) => new THREE.Vector3( o, 9.36, 0 ).applyMatrix4( m ) ) );

	} );
	enableShadow( im ); enableShadow( am );
	g.add( im, am );
	// 电线：相邻电线杆之间的悬链线（细管）
	const wireMat = new THREE.MeshPhysicalNodeMaterial( { color: 0x0a0a0a, roughness: 0.85, specularIntensity: 0.2 } );
	const wires = [];
	for ( let i = 0; i < tops.length - 1; i ++ ) {

		if ( poles[ i ].noWire ) continue;
		for ( let k = 0; k < 4; k ++ ) {

			const a = tops[ i ][ k ], b = tops[ i + 1 ][ k ];
			const pts = [];
			const sag = 0.6 + a.distanceTo( b ) * 0.035 + k * 0.05;
			for ( let t = 0; t <= 16; t ++ ) {

				const u = t / 16;
				pts.push( new THREE.Vector3().lerpVectors( a, b, u ).add( new THREE.Vector3( 0, - sag * 4 * u * ( 1 - u ), 0 ) ) );

			}

			wires.push( new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts ), 16, 0.012, 3 ) );

		}

	}

	// 合并电线几何（一次绘制）
	if ( wires.length ) g.add( new THREE.Mesh( mergeGeos( wires ), wireMat ) );
	return g;

}

// —— 合并工具：几何体合并为单个网格（减少绘制调用）——
export function mergeGeos( geos ) {

	let count = 0, icount = 0;
	for ( const g of geos ) { count += g.attributes.position.count; icount += g.index ? g.index.count : g.attributes.position.count; }
	const pos = new Float32Array( count * 3 ), nor = new Float32Array( count * 3 ), uvs = new Float32Array( count * 2 );
	const idx = new Uint32Array( icount );
	let vo = 0, io = 0;
	for ( const g of geos ) {

		const n = g.attributes.position.count;
		pos.set( g.attributes.position.array, vo * 3 );
		nor.set( g.attributes.normal.array, vo * 3 );
		if ( g.attributes.uv ) uvs.set( g.attributes.uv.array, vo * 2 );
		if ( g.index ) { for ( let i = 0; i < g.index.count; i ++ ) idx[ io + i ] = g.index.array[ i ] + vo; io += g.index.count; } else { for ( let i = 0; i < n; i ++ ) idx[ io + i ] = vo + i; io += n; }
		vo += n;

	}

	const out = new THREE.BufferGeometry();
	out.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
	out.setAttribute( 'normal', new THREE.BufferAttribute( nor, 3 ) );
	out.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
	out.setIndex( new THREE.BufferAttribute( idx, 1 ) );
	out.computeBoundingSphere();
	return out;

}

// —— HESCO 防爆墙：铁丝网格笼 + 土工布内衬 + 顶部土与杂草（军方检查站标志物）——
export function makeHesco( runs ) {

	const T = texSet( 'hessian_230', '1k' );
	const liner = new THREE.MeshStandardNodeMaterial( { roughness: 1 } );
	const d = triplanar( T.diff, 1.5 ).rgb;
	weatherMat( liner, { moss: 1.3, streak: 1.2, grime: 1.5, baseNode: mix( vec3( luminance( d ) ), d, 0.4 ).mul( vec3( 0.75, 0.72, 0.6 ) ).mul( 0.5 ) } );
	const cage = new THREE.MeshStandardNodeMaterial( { color: 0x3a3630, roughness: 0.6, metalness: 0.7 } );
	const B = 1.05, Hh = 1.35;
	const unit = new THREE.BoxGeometry( B - 0.04, Hh, B - 0.04 );
	// 网格笼：竖杆 + 横杆（每单元 5×6）
	const bars = [];
	for ( const sx of [ - 1, 1 ] ) for ( let k = 0; k <= 4; k ++ ) {

		const u = - B / 2 + k * B / 4;
		bars.push( new THREE.BoxGeometry( 0.012, Hh + 0.02, 0.012 ).translate( u, 0, sx * B / 2 ) );
		bars.push( new THREE.BoxGeometry( 0.012, Hh + 0.02, 0.012 ).translate( sx * B / 2, 0, u ) );

	}

	for ( let k = 0; k <= 5; k ++ ) {

		const y = - Hh / 2 + k * Hh / 5;
		for ( const sx of [ - 1, 1 ] ) {

			bars.push( new THREE.BoxGeometry( B, 0.012, 0.012 ).translate( 0, y, sx * B / 2 ) );
			bars.push( new THREE.BoxGeometry( 0.012, 0.012, B ).translate( sx * B / 2, y, 0 ) );

		}

	}

	const cageGeo = mergeGeometries( bars.map( ( g ) => g.toNonIndexed() ) );
	const ms = [];
	const r = rng( 515 );
	for ( const { x0, z0, x1, z1 } of runs ) {

		const dx = x1 - x0, dz = z1 - z0, len = Math.hypot( dx, dz );
		const ry = - Math.atan2( dz, dx );
		const n = Math.max( 1, Math.round( len / B ) );
		addOccluder( ( x0 + x1 ) / 2, ( z0 + z1 ) / 2, len / 2 + 0.2, B / 2 + 0.1, ry, 0.7, 0.75 );
		for ( let i = 0; i < n; i ++ ) {

			const u = ( i + 0.5 ) / n;
			// 填土沉降：顶部略低、轻微外鼓
			ms.push( M4( x0 + dx * u, Hh / 2 - r() * 0.04, z0 + dz * u, ( r() - 0.5 ) * 0.02, ry + ( r() - 0.5 ) * 0.03, ( r() - 0.5 ) * 0.02 ) );

		}

	}

	const g = new THREE.Group();
	for ( const [ geo, mat ] of [ [ unit, liner ], [ cageGeo, cage ] ] ) {

		const im = new THREE.InstancedMesh( geo, mat, ms.length );
		ms.forEach( ( m, i ) => im.setMatrixAt( i, m ) );
		enableShadow( im );
		g.add( im );

	}

	g.userData.tops = ms.map( ( m ) => new THREE.Vector3().setFromMatrixPosition( m ).add( new THREE.Vector3( 0, Hh / 2, 0 ) ) );
	return g;

}
