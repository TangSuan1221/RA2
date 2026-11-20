// 建筑：模块化立面套件拼装（近景）+ 底层商铺（卷帘门/破橱窗/招牌/雨棚）+ 消防梯 + 落水管 + 空调外机
//       + 坍塌转角（断裂楼板悬挑、外露钢筋、瓦砾锥）+ 倾斜高楼靠在邻楼上 + 程序化远景塔楼（多层剪影：退台、水箱、塔吊、残破楼顶）
import * as THREE from 'three/webgpu';
import {
	Fn, float, vec2, vec3, vec4, mix, smoothstep, step, positionWorld, normalWorldGeometry, texture, luminance,
	mx_fractal_noise_float, mx_noise_float, abs, floor, fract, max, min, materialColor, positionLocal, normalLocal, sin, vertexColor,
} from 'three/tsl';
import { InstanceBatch, trs } from '../world/assets.js';
import { rng } from './noise.js';
import { texSet, triplanar, weatherMat, W } from './materials.js';
import { SHADOW_LAYER, REFLECT_LAYER } from './atmosphere.js';
import { GeoBin, M4 } from './geo.js';

const FH = 3, MOD = 3;
// 3×3m 墙面四边形：x ∈ [-3, 0]，y ∈ [0, 3]，朝 +Z（与套件模块规格一致）
const QUAD = new THREE.PlaneGeometry( 3, 3 ).translate( - 1.5, 1.5, 0 );
const UPPER = [ 'centered_large_02', 'centered_double_02', 'centered_small_02', 'offset_small_03', 'centered_large_01' ];
// 窗洞在模块局部的 u 范围（x ∈ [-3,0]，换成从左到右 0..3）
const OPEN = { centered_large_02: [ 0.44, 2.56 ], centered_large_01: [ 0.44, 2.56 ], centered_double_02: [ 0.19, 2.81 ], centered_double_01: [ 0.19, 2.81 ], centered_small_02: [ 0.94, 2.06 ], offset_small_03: [ 0.19, 1.31 ] };

// —— 套件材质变体：混凝土灰 / 红砖 / 褪色涂料 ——
export function makeKitVariants( kit ) {

	const plasterSrc = Object.values( kit.parts ).flat().find( ( p ) => /plaster/.test( p.material.name ) ).material;
	const done = new Set();
	for ( const list of Object.values( kit.parts ) ) for ( const { material: m } of list ) {

		if ( done.has( m ) || /glass/i.test( m.name ) || /plaster/.test( m.name ) ) continue;
		done.add( m );
		const base = materialColor.rgb;
		weatherMat( m, { moss: 1.0, streak: 1.4, baseNode: mix( vec3( luminance( base ) ), base, 0.4 ).mul( 0.62 ) } );

	}

	// 玻璃：脏、暗、能反射天空
	for ( const list of Object.values( kit.parts ) ) for ( const { material: m } of list ) {

		if ( ! /glass/i.test( m.name ) ) continue;
		m.color.set( 0x1c2224 ); m.opacity = 0.8; m.roughness = 0.08; m.metalness = 0.0;

	}

	const mk = ( fn ) => { const m = plasterSrc.clone(); fn( m ); return m; };
	// 墙面通用：大块剥落（露出下层混凝土）+ 楼层雨痕
	const peel = ( d ) => {

		const C = texSet( 'cracked_concrete_wall', '1k' );
		const cc = vec3( luminance( triplanar( C.diff, 0.4 ).rgb ) ).mul( 0.55 );
		const n = mx_fractal_noise_float( positionWorld.mul( 0.35 ), 4, 2.0, 0.55 ).mul( 0.5 ).add( 0.5 );
		const k = smoothstep( 0.66, 0.7, n );
		return mix( d, cc, k );

	};

	const variants = {
		concrete: mk( ( m ) => {

			const T = texSet( 'concrete_slab_wall', '2k' );
			m.map = null; m.normalMap = null;
			const d = triplanar( T.diff, 0.3 ).rgb;
			weatherMat( m, { moss: 1.1, streak: 1.6, baseNode: peel( vec3( luminance( d ) ).mul( 0.72 ) ), roughNode: triplanar( T.arm, 0.3 ).g } );

		} ),
		brick: mk( ( m ) => {

			const T = texSet( 'red_brick_03', '1k' );
			m.map = null; m.normalMap = null;
			const d = triplanar( T.diff, 0.42 ).rgb;
			weatherMat( m, { moss: 1.2, streak: 1.4, baseNode: peel( mix( vec3( luminance( d ) ), d, 0.5 ).mul( 0.78 ) ), roughNode: triplanar( T.arm, 0.42 ).g } );

		} ),
		paint: mk( ( m ) => {

			const T = texSet( 'peeling_painted_wall', '1k' );
			m.map = null; m.normalMap = null;
			const d = triplanar( T.diff, 0.33 ).rgb;
			weatherMat( m, { moss: 1.1, streak: 1.6, baseNode: peel( mix( vec3( luminance( d ) ), d, 0.35 ).mul( 0.7 ) ), roughNode: triplanar( T.arm, 0.33 ).g } );

		} ),
	};

	const out = {};
	for ( const [ k, mat ] of Object.entries( variants ) ) {

		const parts = {};
		for ( const [ name, list ] of Object.entries( kit.parts ) ) parts[ name ] = list.map( ( p ) => ( p.material === plasterSrc ? { ...p, material: mat } : p ) );
		// 实墙模块原模 4608 面（平墙），换成单个四边形（材质为世界空间三平面，无需 UV）
		parts.wall_standard_standard_01 = [ { geometry: QUAD, material: mat, local: new THREE.Matrix4() } ];
		out[ k ] = parts;

	}

	return out;

}

function sides( x0, z0, x1, z1 ) {

	return [
		{ name: 'S', start: [ x0, z1 ], dir: [ 1, 0 ], ry: 0, len: x1 - x0, n: [ 0, 1 ] },
		{ name: 'E', start: [ x1, z1 ], dir: [ 0, - 1 ], ry: Math.PI / 2, len: z1 - z0, n: [ 1, 0 ] },
		{ name: 'N', start: [ x1, z0 ], dir: [ - 1, 0 ], ry: Math.PI, len: x1 - x0, n: [ 0, - 1 ] },
		{ name: 'W', start: [ x0, z0 ], dir: [ 0, 1 ], ry: - Math.PI / 2, len: z1 - z0, n: [ - 1, 0 ] },
	];

}

// —— 共享材质 ——
let _S = null;
export function shared() {

	if ( _S ) return _S;
	const interior = new THREE.MeshStandardNodeMaterial( { color: 0x070707, roughness: 0.95 } );
	// 屋顶：沥青卷材/混凝土 + 重度苔藓 + 积水（俯视镜头大量看到屋顶）
	const roof = new THREE.MeshStandardNodeMaterial( { roughness: 1 } );
	{

		const T = texSet( 'brushed_concrete', '1k' ), A = texSet( 'asphalt_02', '2k' );
		const pw = positionWorld;
		const d = mix( vec3( luminance( triplanar( T.diff, 0.3 ).rgb ) ).mul( 0.4 ), vec3( luminance( triplanar( A.diff, 0.25 ).rgb ) ).mul( 0.55 ), smoothstep( 0.4, 0.6, mx_noise_float( pw.mul( 0.05 ) ).mul( 0.5 ).add( 0.5 ) ) );
		const n = mx_fractal_noise_float( vec3( pw.x.mul( 0.12 ), 2.0, pw.z.mul( 0.12 ) ), 4, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
		const pud = smoothstep( 0.7, 0.72, n );
		// 屋面卷材接缝
		const seam = smoothstep( 0.03, 0.0, abs( fract( pw.x.div( 1.0 ) ).sub( 0.5 ) ).sub( 0.47 ) ).mul( 0.3 );
		weatherMat( roof, { moss: 1.7, streak: 0.4, baseNode: d.mul( float( 1 ).sub( seam ) ), roughNode: triplanar( T.arm, 0.3 ).g } );
		const c0 = roof.colorNode;
		roof.colorNode = mix( c0, c0.mul( 0.28 ), pud );
		roof.roughnessNode = mix( roof.roughnessNode, float( 0.05 ), pud );

	}

	// 锈铁（消防梯、雨棚骨架、水箱、塔吊）
	const rust = new THREE.MeshStandardNodeMaterial( { roughness: 0.8, metalness: 0.5 } );
	{

		const T = texSet( 'rusty_metal_02', '1k' );
		const d = triplanar( T.diff, 0.8 ).rgb;
		weatherMat( rust, { moss: 0.9, streak: 1.2, baseNode: mix( vec3( luminance( d ) ), d, 0.55 ).mul( 0.5 ).mul( vertexColor().rgb ), roughNode: triplanar( T.arm, 0.8 ).g } );
		rust.metalnessNode = float( 0.35 );

	}

	// 断面混凝土（楼板断口、瓦砾大块）
	const slab = new THREE.MeshStandardNodeMaterial( { roughness: 1 } );
	{

		const T = texSet( 'concrete_layers_02', '1k' );
		const d = triplanar( T.diff, 0.5 ).rgb;
		weatherMat( slab, { moss: 1.4, streak: 1.2, baseNode: vec3( luminance( d ) ).mul( 0.55 ).mul( vertexColor().rgb ), roughNode: triplanar( T.arm, 0.5 ).g } );

	}

	// 招牌/雨棚帆布（顶点色为底色）
	const sign = new THREE.MeshPhysicalNodeMaterial( { roughness: 0.85, specularIntensity: 0.35 } );
	weatherMat( sign, { moss: 0.9, streak: 1.6, grime: 1.2, baseNode: vertexColor().rgb.mul( 0.55 ).mul( mx_fractal_noise_float( positionWorld.mul( 1.5 ), 3, 2.0, 0.5 ).mul( 0.25 ).add( 0.85 ) ) } );

	const shadowMat = new THREE.MeshBasicNodeMaterial();
	_S = { interior, roof, rust, slab, sign, shadowMat };
	return _S;

}

// 只投影的代理体（主相机不可见）；同时进反射层（积水里倒映大体块）
export function shadowProxy( geo, reflect = false ) {

	const m = new THREE.Mesh( geo, shared().shadowMat );
	m.layers.disableAll();
	m.layers.enable( SHADOW_LAYER );
	m.castShadow = true;
	return m;

}

// 楼体细节收集器（全部楼共享，最后合并：每种材质 1 次绘制）
export const detail = { rust: new GeoBin(), slab: new GeoBin(), sign: new GeoBin(), dark: new GeoBin(), rebar: [], fireEscapes: [], aircon: [], shutters: [] };

const SIGN_COLS = [ [ 0.22, 0.09, 0.07 ], [ 0.12, 0.18, 0.2 ], [ 0.3, 0.27, 0.2 ], [ 0.1, 0.16, 0.11 ], [ 0.32, 0.3, 0.28 ] ];

/**
 * 拼装一栋楼
 * b: { x0, z0, x1, z1, floors, seed, variant, tint, shop: ['E'], hide: ['W'], cut(side,i,n)→层数, collapseCorner: 'NE'|... }
 */
export function buildBuilding( variants, b, batch, ivy ) {

	const P = variants[ b.variant || 'concrete' ];
	const r = rng( b.seed );
	const H = b.floors * FH;
	const tint = new THREE.Color( b.tint ?? 0xa8a8a2 );
	const noGlass = ( part ) => ! /glass/i.test( part.material.name );
	const extra = [];
	const S = shared();

	for ( const s of sides( b.x0, b.z0, b.x1, b.z1 ) ) {

		if ( b.hide?.includes( s.name ) ) continue;
		const n = Math.round( s.len / MOD );
		const isShop = b.shop?.includes( s.name );
		const wA = UPPER[ Math.floor( r() * UPPER.length ) ], wB = UPPER[ Math.floor( r() * UPPER.length ) ];
		const openings = [], ledges = [];
		const tops = [];
		const rot = M4( 0, 0, 0, 0, s.ry, 0 );
		const along = ( u, y, out ) => new THREE.Vector3( s.start[ 0 ] + s.dir[ 0 ] * u + s.n[ 0 ] * out, y, s.start[ 1 ] + s.dir[ 1 ] * u + s.n[ 1 ] * out );
		const atM = ( u, y, out, extraRot = null ) => {

			const v = along( u, y, out );
			const m = M4( v.x, v.y, v.z, 0, s.ry, 0 );
			return extraRot ? m.multiply( extraRot ) : m;

		};

		for ( let i = 0; i < n; i ++ ) {

			const px = s.start[ 0 ] + s.dir[ 0 ] * MOD * ( i + 1 );
			const pz = s.start[ 1 ] + s.dir[ 1 ] * MOD * ( i + 1 );
			let top = b.floors;
			if ( b.cut ) top = Math.min( top, b.cut( s.name, i, n ) );
			tops.push( top );
			for ( let f = 0; f < top; f ++ ) {

				const m = trs( px, f * FH, pz, s.ry );
				const roll = r();
				if ( f === 0 ) {

					if ( isShop ) {

						// 底层商铺：实墙 + 自建门脸（卷帘门/破橱窗），开间 3m
						batch.add( P, 'wall_standard_standard_01', m, tint );
						const u0 = i * MOD;
						const kind = r();
						if ( kind < 0.45 ) {

							// 卷帘门（两扇宽 1.08m），半开的露出黑洞
							for ( const k of [ 0.96, 2.04 ] ) {

								const v = along( u0 + k, 0, 0.02 );
								detail.shutters.push( { x: v.x, z: v.z, ry: s.ry, half: r() < 0.25 } );

							}

							detail.dark.box( 2.3, 2.5, 0.05, atM( u0 + 1.5, 1.25, 0.005 ) );

						} else {

							// 破碎橱窗：黑洞 + 残留窗框 + 地面碎玻璃（由道具散布）
							detail.dark.box( 2.5, 2.2, 0.05, atM( u0 + 1.5, 1.35, 0.01 ) );
							detail.slab.box( 2.7, 0.12, 0.12, atM( u0 + 1.5, 2.48, 0.06 ), [ 0.7, 0.7, 0.68 ] );
							detail.slab.box( 2.7, 0.3, 0.14, atM( u0 + 1.5, 0.15, 0.07 ), [ 0.6, 0.6, 0.58 ] );
							for ( const k of [ 0.2, 1.5, 2.8 ] ) detail.rust.box( 0.08, 2.2, 0.08, atM( u0 + k, 1.35, 0.05 ), [ 0.35, 0.35, 0.33 ] );
							openings.push( { u0: u0 + 0.25, u1: u0 + 2.75, h0: 0.3, h1: 2.4 } );

						}

						// 招牌带（每 1–3 开间一块，偶尔歪斜脱落）
						if ( i % 2 === 0 || r() < 0.3 ) {

							const c = SIGN_COLS[ Math.floor( r() * SIGN_COLS.length ) ];
							const tilt = r() < 0.2 ? ( r() - 0.5 ) * 0.4 : 0;
							detail.sign.box( MOD * ( r() < 0.5 ? 2 : 1 ) - 0.2, 0.62, 0.12, atM( u0 + 1.5, 2.95, 0.12, M4( 0, 0, 0, 0, 0, tilt ) ), c );

						}

						// 雨棚：锈铁骨架 + 破帆布（部分只剩骨架）
						if ( r() < 0.35 ) {

							const c = SIGN_COLS[ Math.floor( r() * SIGN_COLS.length ) ];
							for ( const k of [ 0.15, 1.5, 2.85 ] ) detail.rust.box( 0.04, 0.04, 1.4, atM( u0 + k, 2.75, 0.7, M4( 0, 0, 0, 0.35, 0, 0 ) ), [ 0.5, 0.45, 0.4 ] );
							if ( r() < 0.65 ) detail.sign.box( 3.0, 0.03, 1.45, atM( u0 + 1.5, 2.78, 0.72, M4( 0, 0, 0, 0.35, 0, ( r() - 0.5 ) * 0.1 ) ), c );

						}

					} else batch.add( P, 'wall_standard_standard_01', m, tint );

					batch.add( P, 'base_standard_01', m );

				} else {

					if ( roll < 0.1 ) batch.add( P, 'wall_standard_standard_01', m, tint );
					else {

						const w = ( i % 3 === 1 ) ? wB : wA;
						batch.add( P, `wall_window_${w}`, m, tint );
						const broken = r() < 0.6;
						batch.add( P, `window_${w}`, m, null, broken ? noGlass : null );
						const o = OPEN[ w ];
						if ( o ) openings.push( { u0: i * MOD + o[ 0 ], u1: i * MOD + o[ 1 ], h0: f * FH + 0.57, h1: f * FH + 2.03 } );
						// 空调外机（挂在窗下）
						if ( r() < 0.06 ) {

							// 程序化窗式空调：箱体 + 散热格栅（暗）+ 支架
							detail.rust.box( 0.75, 0.5, 0.6, atM( i * MOD + 1.5, f * FH + 0.35, 0.3 ), [ 0.62, 0.62, 0.6 ] );
							detail.dark.box( 0.6, 0.36, 0.02, atM( i * MOD + 1.5, f * FH + 0.35, 0.61 ) );
							for ( const k of [ - 0.3, 0.3 ] ) detail.rust.box( 0.04, 0.04, 0.55, atM( i * MOD + 1.5 + k, f * FH + 0.08, 0.3, M4( 0, 0, 0, 0.5, 0, 0 ) ), [ 0.4, 0.4, 0.4 ] );

						}

					}

					batch.add( P, 'cornice_standard_standard_01', trs( px, f * FH - 0.1, pz, s.ry ) );
					ledges.push( f * FH );

				}

			}

			if ( top === b.floors ) batch.add( P, 'crown_standard_standard_01', trs( px, H, pz, s.ry ) );
			else {

				// 坍塌列：断口处的楼板残片（向外下垂）+ 外露钢筋
				const u = i * MOD + 1.5;
				const v = along( u, top * FH, - 1.2 );
				const sag = 0.25 + r() * 0.35;
				detail.slab.box( MOD + 0.1, 0.28, 2.8, M4( v.x, v.y - 0.1, v.z, - sag * 0.6 * ( r() < 0.5 ? 1 : - 1 ) * 0.3, s.ry, ( r() - 0.5 ) * 0.25 ), [ 0.85, 0.85, 0.82 ] );
				for ( let k = 0; k < 7; k ++ ) {

					const vv = along( i * MOD + 0.2 + r() * 2.6, top * FH + 0.05, 0.05 + r() * 0.2 );
					detail.rebar.push( { x: vv.x, y: vv.y, z: vv.z, rx: ( r() - 0.5 ) * 1.4, ry: r() * 6, rz: ( r() - 0.5 ) * 1.4, len: 0.8 + r() * 1.6 } );

				}

			}

		}

		// 转角壁柱
		for ( let f = 0; f < b.floors; f ++ ) batch.add( P, 'wall_pier_corner_01', trs( s.start[ 0 ], f * FH, s.start[ 1 ], s.ry ), tint );

		// 消防梯（非商铺立面，楼层 ≥ 4）
		const pipes = [];
		if ( ! isShop && b.floors >= 4 && r() < 0.8 && n >= 3 ) {

			const u = MOD * ( 1 + Math.floor( r() * ( n - 2 ) ) ) + 1.5;
			const v = along( u, 0, 0.85 );
			detail.fireEscapes.push( { x: v.x, z: v.z, ry: s.ry, floors: Math.min( b.floors, Math.min( ...tops.slice( Math.floor( ( u - 1.5 ) / MOD ), Math.floor( ( u - 1.5 ) / MOD ) + 2 ) ) ) - 1 } );

		}

		// 落水管（铸铁，沿墙竖直，常春藤顺着爬）
		for ( let k = 0; k < Math.max( 1, Math.floor( n / 4 ) ); k ++ ) {

			const u = MOD * ( 1 + Math.floor( r() * Math.max( 1, n - 1 ) ) ) - 0.25;
			const topH = tops[ Math.min( tops.length - 1, Math.floor( u / MOD ) ) ] * FH;
			const v = along( u, topH / 2, 0.12 );
			detail.rust.add( new THREE.CylinderGeometry( 0.06, 0.06, topH, 6 ), M4( v.x, v.y, v.z ), [ 0.45, 0.45, 0.43 ] );
			pipes.push( u );

		}

		// 常春藤：每个可见立面（窗洞/线脚/落水管参与生长）
		if ( ivy && b.ivy !== 0 ) {

			const o = [ s.start[ 0 ] + s.n[ 0 ] * 0.05, 0, s.start[ 1 ] + s.n[ 1 ] * 0.05 ];
			ivy.addWall( o, [ s.dir[ 0 ], 0, s.dir[ 1 ] ], [ s.n[ 0 ], 0, s.n[ 1 ] ], s.len, Math.min( ...tops ) * FH + 0.6, {
				cover: ( b.ivy ?? 0.55 ) * ( 0.85 + r() * 0.3 ), seed: b.seed * 4 + s.name.charCodeAt( 0 ), hang: 0.8 + r() * 0.5, climb: 0.7 + r() * 0.5,
				openings, ledges, pipes, name: `${b.seed}${s.name}`,
			} );

		}

	}

	// 室内暗体 + 屋顶
	const inset = 0.3;
	const hTop = b.cutHeight ?? H;
	const inner = new THREE.Mesh( new THREE.BoxGeometry( b.x1 - b.x0 - inset * 2, hTop - 0.05, b.z1 - b.z0 - inset * 2 ), S.interior );
	inner.position.set( ( b.x0 + b.x1 ) / 2, hTop / 2, ( b.z0 + b.z1 ) / 2 );
	inner.userData.kind = 'interior';
	extra.push( inner );
	if ( ! b.cut ) {

		const roof = new THREE.Mesh( new THREE.BoxGeometry( b.x1 - b.x0 - 0.04, 0.35, b.z1 - b.z0 - 0.04 ), S.roof );
		roof.position.set( ( b.x0 + b.x1 ) / 2, H - 0.12, ( b.z0 + b.z1 ) / 2 );
		roof.receiveShadow = true;
		roof.userData.kind = 'roof';
		extra.push( roof );
		roofClutter( b, r );

	} else {

		// 坍塌楼：顶部残存楼板（参差）+ 楼内瓦砾
		const roof = new THREE.Mesh( new THREE.BoxGeometry( b.x1 - b.x0 - 0.6, 0.3, b.z1 - b.z0 - 0.6 ), S.roof );
		roof.position.set( ( b.x0 + b.x1 ) / 2, hTop - 0.15, ( b.z0 + b.z1 ) / 2 );
		roof.userData.kind = 'roof';
		extra.push( roof );

	}

	// 阴影代理体
	const proxy = shadowProxy( new THREE.BoxGeometry( b.x1 - b.x0, b.cut ? hTop : H, b.z1 - b.z0 ) );
	proxy.position.set( ( b.x0 + b.x1 ) / 2, ( b.cut ? hTop : H ) / 2, ( b.z0 + b.z1 ) / 2 );
	proxy.layers.enable( REFLECT_LAYER );
	proxy.material = S.interior;
	extra.push( proxy );
	return extra;

}

// 屋顶杂物：女儿墙、空调机组、水箱（木桶 + 支架）、通风管、天窗、楼梯间、屋顶苔藓堆（俯视镜头的信息量）
function roofClutter( b, r ) {

	const H = b.floors * FH;
	const w = b.x1 - b.x0, d = b.z1 - b.z0;
	const cx = ( b.x0 + b.x1 ) / 2, cz = ( b.z0 + b.z1 ) / 2;
	// 女儿墙内侧压顶（深色带，勾出屋面边界）
	const pw = 0.25;
	for ( const [ x, z, sx, sz ] of [ [ cx, b.z0 + pw / 2 + 0.1, w - 0.4, pw ], [ cx, b.z1 - pw / 2 - 0.1, w - 0.4, pw ], [ b.x0 + pw / 2 + 0.1, cz, pw, d - 0.4 ], [ b.x1 - pw / 2 - 0.1, cz, pw, d - 0.4 ] ] ) detail.slab.box( sx, 0.7, sz, M4( x, H + 0.3, z ), [ 0.8, 0.8, 0.78 ] );
	// 空调机组 / 通风箱
	const n = 3 + Math.floor( r() * 4 );
	for ( let i = 0; i < n; i ++ ) {

		const sx = 1 + r() * 2.2, sz = 1 + r() * 1.8, sy = 0.7 + r() * 1.0;
		const x = b.x0 + 1.5 + sx / 2 + r() * ( w - 3 - sx ), z = b.z0 + 1.5 + sz / 2 + r() * ( d - 3 - sz );
		const ry = r() < 0.8 ? 0 : r() * 0.3;
		detail.rust.box( sx, sy, sz, M4( x, H + sy / 2, z, 0, ry, 0 ), [ 0.6, 0.62, 0.6 ] );
		// 顶部风扇圆盖
		if ( r() < 0.6 ) detail.dark.add( new THREE.CylinderGeometry( Math.min( sx, sz ) * 0.35, Math.min( sx, sz ) * 0.35, 0.04, 14 ), M4( x, H + sy + 0.02, z ) );

	}

	// 天窗（玻璃破碎 = 暗洞 + 框）
	for ( let i = 0; i < 2; i ++ ) {

		const x = b.x0 + 3 + r() * ( w - 6 ), z = b.z0 + 3 + r() * ( d - 6 );
		detail.dark.box( 1.6, 0.3, 1.6, M4( x, H + 0.15, z ) );
		detail.rust.box( 1.75, 0.08, 0.08, M4( x, H + 0.32, z - 0.8 ), [ 0.5, 0.5, 0.5 ] );
		detail.rust.box( 1.75, 0.08, 0.08, M4( x, H + 0.32, z + 0.8 ), [ 0.5, 0.5, 0.5 ] );

	}

	// 楼梯间小屋
	if ( r() < 0.75 ) {

		const x = b.x0 + w * ( 0.25 + r() * 0.5 ), z = b.z0 + d * ( 0.25 + r() * 0.5 );
		detail.slab.box( 3.2, 2.8, 4, M4( x, H + 1.4, z ), [ 0.75, 0.75, 0.72 ] );
		detail.dark.box( 1.0, 2.0, 0.05, M4( x, H + 1.0, z + 2.01 ) );

	}

	// 木质水箱（西雅图/纽约式）：圆桶 + 锥顶 + 钢支架
	if ( r() < 0.7 ) {

		const x = b.x0 + 2.5 + r() * ( w - 5 ), z = b.z0 + 2.5 + r() * ( d - 5 );
		const legH = 2.2;
		for ( const [ dx, dz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) detail.rust.box( 0.12, legH, 0.12, M4( x + dx * 1.0, H + legH / 2, z + dz * 1.0 ), [ 0.5, 0.5, 0.48 ] );
		detail.slab.add( new THREE.CylinderGeometry( 1.4, 1.5, 2.8, 16 ), M4( x, H + legH + 1.4, z ), [ 0.55, 0.45, 0.35 ] );
		detail.rust.add( new THREE.ConeGeometry( 1.55, 0.9, 16 ), M4( x, H + legH + 3.25, z ), [ 0.45, 0.43, 0.4 ] );

	}

	// 屋面苔藓/杂草堆由植被系统散布（roofSpots）
	roofSpots.push( { x0: b.x0 + 0.5, z0: b.z0 + 0.5, x1: b.x1 - 0.5, z1: b.z1 - 0.5, y: H + 0.05 } );

}

export const roofSpots = [];

// 消防梯 / 空调外机 / 卷帘门 / 钢筋：实例化（在场景里拿到模型后调用）
export function buildDetailInstances( M, batch ) {

	const FE = M.modular_fire_escape;
	const off = FE.offsets;
	const base = off.modular_fire_escape_platform_middle;
	for ( const fe of detail.fireEscapes ) {

		for ( let f = 1; f <= fe.floors; f ++ ) {

			const y0 = f * FH + 0.05;
			for ( const name of [ 'modular_fire_escape_platform_middle', 'modular_fire_escape_railing_middle', ...( f < fe.floors ? [ 'modular_fire_escape_stairs' ] : [] ) ] ) {

				const o = off[ name ];
				const m = trs( fe.x, y0, fe.z, fe.ry ).multiply( new THREE.Matrix4().makeTranslation( o[ 0 ] - base[ 0 ], o[ 1 ] - base[ 1 ], o[ 2 ] - base[ 2 ] ) );
				batch.add( FE.parts, name, m );

			}

		}

		// 底部收起的梯子
		const o = off.modular_fire_escape_ladder_bottom;
		batch.add( FE.parts, 'modular_fire_escape_ladder_bottom', trs( fe.x, FH + 0.05, fe.z, fe.ry ).multiply( new THREE.Matrix4().makeTranslation( o[ 0 ] - base[ 0 ], o[ 1 ] - base[ 1 ] + 1.2, o[ 2 ] - base[ 2 ] ) ) );

	}

	for ( const s of detail.shutters ) batch.add( M.rollershutter_door.parts, Math.random() < 0.5 ? 'rollershutter_door' : 'rollershutter_door_graffiti', trs( s.x, s.half ? 1.36 : 0.16, s.z, s.ry, 1 ).multiply( new THREE.Matrix4().makeScale( 1, s.half ? 0.5 : 1, 1 ) ) );

}

// 合并所有楼体细节网格
export function buildDetailMeshes() {

	const S = shared();
	const g = new THREE.Group();
	g.add( detail.rust.build( S.rust ), detail.slab.build( S.slab ), detail.sign.build( S.sign ), detail.dark.build( S.interior ) );
	// 钢筋：细圆柱实例
	if ( detail.rebar.length ) {

		const rm = new THREE.MeshStandardNodeMaterial( { color: 0x3a2618, roughness: 0.75, metalness: 0.4 } );
		const rg = new THREE.CylinderGeometry( 0.014, 0.014, 1, 4 ); rg.translate( 0, 0.5, 0 );
		const im = new THREE.InstancedMesh( rg, rm, detail.rebar.length );
		detail.rebar.forEach( ( b, i ) => im.setMatrixAt( i, M4( b.x, b.y, b.z, b.rx, b.ry, b.rz, 'YXZ', 1, b.len, 1 ) ) );
		g.add( im );

	}

	g.traverse( ( o ) => { if ( o.isMesh ) { o.layers.enable( SHADOW_LAYER ); o.castShadow = o.receiveShadow = true; } } );
	return g;

}

// —— 远景塔楼材质：窗格着色器（局部坐标，按楼层/开间切分；窗型随楼变化；破窗、残留玻璃、楼面流痕与藤蔓带）——
let _towerMat = null;
export function towerMaterial() {

	if ( _towerMat ) return _towerMat;
	const T = texSet( 'concrete_wall_008', '2k' );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.9 } );
	const p = positionLocal;
	const nl = normalLocal;
	const vc = vertexColor(); // rgb = 每栋楼的墙色倍率
	// 每栋楼的窗型参数：由墙色倍率（每栋不同）哈希得到
	const seedB = fract( sin( vc.r.mul( 917.3 ).add( vc.b.mul( 311.7 ) ) ).mul( 43758.5 ) );
	const side = abs( nl.x ).greaterThan( 0.5 );
	const u = side.select( p.z, p.x );
	const bay = mix( float( 2.6 ), float( 4.2 ), seedB );
	const flH = mix( float( 3.2 ), float( 3.9 ), fract( seedB.mul( 7.3 ) ) );
	const fu = fract( u.div( bay ) ), fv = fract( p.y.div( flH ) );
	const cell = vec2( floor( u.div( bay ) ), floor( p.y.div( flH ) ) );
	const ww = mix( float( 0.12 ), float( 0.3 ), fract( seedB.mul( 3.1 ) ) ); // 窗间墙宽
	const win = smoothstep( ww, ww.add( 0.02 ), fu ).mul( smoothstep( float( 1 ).sub( ww ), float( 0.98 ).sub( ww ), fu ) ).mul( step( 0.3, fv ) ).mul( step( fv, 0.85 ) ).mul( step( abs( nl.y ), 0.5 ) );
	const rnd = fract( cell.x.mul( 12.9898 ).add( cell.y.mul( 78.233 ) ).sin().mul( 43758.5453 ) );
	const conc = triplanar( T.diff, 0.12, p, nl ).rgb;
	// 楼层间的深色腰线（层板外露）
	const band = smoothstep( 0.06, 0.0, fv ).add( smoothstep( 0.94, 1.0, fv ) ).clamp().mul( 0.5 );
	const wallC = mix( vec3( luminance( conc ) ), conc, 0.3 ).mul( 0.62 ).mul( vc.rgb ).mul( float( 1 ).sub( band ) );
	const glass = step( 0.72, rnd );
	const winC = mix( vec3( 0.006, 0.007, 0.007 ), vec3( 0.05, 0.058, 0.062 ), glass );
	const col = mix( wallC, winC, win );
	m.colorNode = col;
	m.roughnessNode = mix( float( 0.9 ), mix( float( 0.95 ), float( 0.08 ), glass ), win );
	weatherMat( m, { moss: 1.1, streak: 1.8, baseNode: col, roughNode: m.roughnessNode } );
	_towerMat = m;
	return m;

}

/**
 * 远景塔楼：主体 + 退台 + 屋顶构件（水箱/机房/天线），可选残破楼顶（锯齿形缺口）、整体倾斜
 * 全部顶点合并进 bin（塔楼共用一个材质 = 1 次绘制）
 */
export function towerGeo( bin, x, z, w, d, h, { ry = 0, tilt = 0, tiltAxis = 'z', seed = 1, broken = false, setback = true, crane = false, tint = 1 } = {} ) {

	const r = rng( seed * 131 + 7 );
	const g = [];
	const t = [ tint, tint, tint * 1.02 ];
	const add = ( geo, m ) => { geo.applyMatrix4( m ); g.push( geo ); };
	// 主体（分 2–3 段退台）
	const segs = setback ? 1 + Math.floor( r() * 2.5 ) : 1;
	let y = 0, cw = w, cd = d;
	for ( let i = 0; i < segs; i ++ ) {

		const sh = i === segs - 1 ? h - y : h * ( 0.45 + r() * 0.25 );
		if ( broken && i === segs - 1 ) {

			// 残破楼顶：几根不等高的柱段，形成锯齿剪影
			const k = 4;
			for ( let a = 0; a < k; a ++ ) for ( let b2 = 0; b2 < 2; b2 ++ ) {

				const hh = sh * ( 0.35 + r() * 0.65 );
				add( new THREE.BoxGeometry( cw / k + 0.02, hh, cd / 2 + 0.02 ), M4( - cw / 2 + cw / k * ( a + 0.5 ), y + hh / 2, - cd / 4 + b2 * cd / 2 ) );

			}

		} else add( new THREE.BoxGeometry( cw, sh, cd ), M4( 0, y + sh / 2, 0 ) );
		y += sh;
		cw *= 0.72 + r() * 0.12; cd *= 0.72 + r() * 0.12;

	}

	if ( ! broken ) {

		// 屋顶机房、水箱、天线
		add( new THREE.BoxGeometry( cw * 0.5, 3, cd * 0.4 ), M4( ( r() - 0.5 ) * cw * 0.3, h + 1.5, ( r() - 0.5 ) * cd * 0.3 ) );
		if ( r() < 0.6 ) add( new THREE.CylinderGeometry( 1.6, 1.6, 3.2, 10 ), M4( cw * 0.25, h + 3.6, - cd * 0.2 ) );
		if ( r() < 0.5 ) add( new THREE.CylinderGeometry( 0.12, 0.2, 9, 4 ), M4( - cw * 0.2, h + 4.5, cd * 0.15 ) );

	}

	if ( crane ) {

		// 塔吊：格构立柱（简化为细方柱）+ 吊臂 + 配重
		const ch = h + 22;
		add( new THREE.BoxGeometry( 1.4, ch, 1.4 ), M4( w / 2 + 2, ch / 2, 0 ) );
		add( new THREE.BoxGeometry( 38, 1.2, 1.2 ), M4( w / 2 + 2 + 12, ch, 0 ) );
		add( new THREE.BoxGeometry( 3, 2.5, 2.5 ), M4( w / 2 + 2 - 6, ch - 0.5, 0 ) );
		add( new THREE.BoxGeometry( 0.15, 14, 0.15 ), M4( w / 2 + 2 + 26, ch - 7, 0 ) );

	}

	const tr = new THREE.Matrix4().compose( new THREE.Vector3( x, 0, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( tiltAxis === 'x' ? tilt : 0, ry, tiltAxis === 'z' ? tilt : 0, 'YXZ' ) ), new THREE.Vector3( 1, 1, 1 ) );
	// 窗格着色器使用 positionLocal：合并进共享 bin 的塔楼（不倾斜）直接烘进世界坐标；
	// 倾斜塔楼单独成网格（几何体保持塔楼局部坐标，窗格随楼体一起倾斜）
	if ( bin ) {

		for ( const q of g ) { q.applyMatrix4( tr ); bin.add( q, null, t ); }
		return null;

	}

	const own = new GeoBin();
	for ( const q of g ) own.add( q, null, t );
	const mesh = own.build( towerMaterial(), { shadow: false } );
	mesh.matrixAutoUpdate = false;
	mesh.matrix.copy( tr );
	mesh.matrixWorldNeedsUpdate = true;
	return mesh;

}
