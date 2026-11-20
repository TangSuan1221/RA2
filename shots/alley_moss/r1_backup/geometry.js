// 苔藓小巷：地面、苔藓墙、温室、尽头建筑（几何生成）
// 坐标：+Y 上；巷子沿 -Z 方向延伸；右侧苔藓墙面在 x = L.WALL_X（朝 -X）；左侧温室立面在 x = L.GH_X
import * as THREE from 'three/webgpu';
import { L } from './materials.js';
import { rng, fbm2, noise2, smooth, merge, worldUV, bevelBox, xf, T, dataTex } from './util.js';

// ———————————————————————— 地面：错位的混凝土板 + 缝隙泥土 ————————————————————————
export const SLAB = { x0: - 2.05, x1: 1.45, size: 1.16, gap: 0.035, missing: new Set() };

export function buildGround( mats ) {

	const r = rng( 7 );
	const slabs = [];
	const cells = []; // 记录板的位置，供草/苔藓摆放
	const nx = Math.round( ( SLAB.x1 - SLAB.x0 ) / SLAB.size );
	const w = ( SLAB.x1 - SLAB.x0 ) / nx;
	const nz = Math.ceil( ( L.Z1 - L.Z0 ) / SLAB.size );
	for ( let j = 0; j < nz; j ++ ) {

		for ( let i = 0; i < nx; i ++ ) {

			const cx = SLAB.x0 + ( i + 0.5 ) * w, cz = L.Z1 - ( j + 0.5 ) * SLAB.size;
			// 少量板缺失（露出泥土与杂草）
			if ( r() < 0.045 && j > 2 ) { SLAB.missing.add( `${i},${j}` ); cells.push( { cx, cz, w, d: SLAB.size, missing: true } ); continue; }
			// 树根顶起：靠墙一侧更明显
			const heave = ( r() - 0.5 ) * 0.025 + ( i === nx - 1 ? r() * 0.03 : 0 );
			const tiltX = ( r() - 0.5 ) * 0.018, tiltZ = ( r() - 0.5 ) * 0.018;
			const sw = w - SLAB.gap - r() * 0.015, sd = SLAB.size - SLAB.gap - r() * 0.015;
			// 有些板碎成两块
			const pieces = r() < 0.18 ? split( sw, sd, r ) : [ [ 0, 0, sw, sd ] ];
			for ( const [ ox, oz, pw, pd ] of pieces ) {

				const g = bevelBox( pw, 0.14, pd, 0.012 );
				g.rotateX( 0 );
				xf( g, T( cx + ox, L.SLAB_TOP - 0.07 + heave, cz + oz, tiltX, 0, tiltZ ) );
				// 每块板独立偏移贴图，避免平铺重复
				worldUV( g, 2.6, [ r() * 7, r() * 7 ] );
				slabs.push( g );

			}

			cells.push( { cx, cz, w, d: SLAB.size, missing: false } );

		}

	}

	const group = new THREE.Group();
	const slabMesh = new THREE.Mesh( merge( slabs ), mats.slab );
	slabMesh.receiveShadow = true;
	slabMesh.castShadow = true;
	group.add( slabMesh );

	// 板下的泥土层（从缝隙与缺失处露出），并延伸到墙根与温室墙根
	const soil = new THREE.PlaneGeometry( 60, L.Z1 - L.Z0 + 30, 1, 1 );
	soil.rotateX( - Math.PI / 2 );
	soil.translate( 0, 0.065, ( L.Z0 + L.Z1 ) / 2 - 10 );
	const soilMesh = new THREE.Mesh( soil, mats.soil );
	soilMesh.receiveShadow = true;
	group.add( soilMesh );
	return { group, cells, slabW: w, nx, nz };

}

function split( sw, sd, r ) {

	// 沿随机方向把板分成两块（中间留 1.5cm 裂缝）
	const t = 0.35 + r() * 0.3, c = 0.015;
	if ( r() < 0.5 ) {

		const a = sw * t - c / 2, b = sw * ( 1 - t ) - c / 2;
		return [ [ - sw / 2 + a / 2, 0, a, sd ], [ sw / 2 - b / 2, 0, b, sd ] ];

	}

	const a = sd * t - c / 2, b = sd * ( 1 - t ) - c / 2;
	return [ [ 0, - sd / 2 + a / 2, sw, a ], [ 0, sd / 2 - b / 2, sw, b ] ];

}

// ———————————————————————— 右侧墙：横向凹槽护墙板 ————————————————————————
const BOARD = 0.34, GROOVE = 0.026, GDEPTH = 0.016, CH = 0.005;

export function buildWall( mats ) {

	const H = L.WALL_H;
	// 截面轮廓（shape.x = 进入墙体的深度，0 为板面；shape.y = 高度）
	const s = new THREE.Shape();
	s.moveTo( 0.35, 0 );
	s.lineTo( 0, 0 );
	let y = 0;
	while ( y + BOARD < H - 0.01 ) {

		const top = y + BOARD - GROOVE;
		// 板面（上下边缘 5mm 倒角，能接住天光）
		s.lineTo( 0, top - CH );
		s.lineTo( CH, top );
		// 凹槽
		s.lineTo( GDEPTH, top );
		s.lineTo( GDEPTH, top + GROOVE );
		s.lineTo( CH, top + GROOVE );
		s.lineTo( 0, top + GROOVE + CH );
		y += BOARD;

	}

	s.lineTo( 0, H );
	s.lineTo( 0.35, H );
	s.lineTo( 0.35, 0 );

	const PANEL = 2.4, SEAM = 0.014;
	const parts = [];
	for ( let z = L.Z1; z > L.Z0; z -= PANEL ) {

		const len = Math.min( PANEL, z - L.Z0 ) - SEAM;
		const g = new THREE.ExtrudeGeometry( s, { depth: len, bevelEnabled: false, curveSegments: 1 } );
		g.translate( L.WALL_X, 0, z - len );
		const ng = ( g.index ? ( g.index ? g.toNonIndexed() : g ) : g );
		ng.computeVertexNormals();
		worldUV( ng, 2.4 );
		parts.push( ng );

	}

	const group = new THREE.Group();
	const wall = new THREE.Mesh( merge( parts ), mats.wall );
	wall.castShadow = wall.receiveShadow = true;
	group.add( wall );

	// 接缝后面的黑色衬底（防止透光）
	const back = new THREE.Mesh( new THREE.PlaneGeometry( L.Z1 - L.Z0, H ), mats.dark );
	back.rotation.y = - Math.PI / 2;
	back.position.set( L.WALL_X + 0.03, H / 2, ( L.Z0 + L.Z1 ) / 2 );
	group.add( back );

	// 墙顶压顶（略挑出）+ 屋顶
	const cap = bevelBox( 0.5, 0.26, L.Z1 - L.Z0, 0.02 );
	xf( cap, T( L.WALL_X + 0.2, H + 0.1, ( L.Z0 + L.Z1 ) / 2 ) );
	worldUV( cap, 2.0 );
	const roof = new THREE.BoxGeometry( 14, 0.3, L.Z1 - L.Z0 + 10 ).toNonIndexed();
	xf( roof, T( L.WALL_X + 7.3, H - 0.1, ( L.Z0 + L.Z1 ) / 2 - 5 ) );
	worldUV( roof, 3.0 );
	// 屋顶女儿墙（远侧）+ 通风箱
	const extra = [ cap ];
	const r = rng( 77 );
	for ( let i = 0; i < 7; i ++ ) {

		const w = 0.8 + r() * 1.4, d = 0.8 + r() * 2.2, h = 0.5 + r() * 0.9;
		const g = bevelBox( w, h, d, 0.03 );
		xf( g, T( L.WALL_X + 2.5 + r() * 8, H + 0.05 + h / 2, L.Z0 + 3 + r() * ( L.Z1 - L.Z0 - 6 ), 0, ( r() - 0.5 ) * 0.2 ) );
		worldUV( g, 2.0, [ r(), r() ] );
		extra.push( g );

	}

	const top = new THREE.Mesh( merge( extra ), mats.concrete );
	top.castShadow = top.receiveShadow = true;
	const roofM = new THREE.Mesh( roof, mats.roof );
	roofM.castShadow = roofM.receiveShadow = true;
	group.add( top, roofM );

	return group;

}

// ———————————————————————— 墙面厚苔藓：遮罩烘焙 + 位移网格 ————————————————————————
export function buildMoss( mats, makeMat ) {

	const H = L.WALL_H, LEN = L.Z1 - L.Z0;
	const TW = 1024, TH = 160;
	const mask = new Float32Array( TW * TH );
	for ( let j = 0; j < TH; j ++ ) {

		for ( let i = 0; i < TW; i ++ ) {

			const z = L.Z0 + ( i + 0.5 ) / TW * LEN, y = ( j + 0.5 ) / TH * H;
			// 竖向拉长的噪声：苔藓沿着水流方向向下延伸成舌状
			const big = fbm2( z * 0.21, y * 0.12 + 3.1, 5 );
			const drip = fbm2( z * 1.1 + 40, y * 0.18, 4 );
			const det = fbm2( z * 3.1, y * 3.1 + 11, 3 );
			// 高度偏好：中上部 + 墙根（藤蔓后面）苔藓最多
			const hb = 0.12 * smooth( 1.5, 4.2, y ) - 0.08 * smooth( 6.4, 7.2, y ) + 0.06 * smooth( 1.2, 0.2, y );
			const v = big * 0.95 + ( drip - 0.5 ) * 0.42 + ( det - 0.5 ) * 0.16 + hb;
			mask[ j * TW + i ] = smooth( 0.49, 0.6, v );

		}

	}

	// 模糊版本（晕染用）
	const blur = boxBlur( mask, TW, TH, 6 );
	const tex = dataTex( TW, TH, ( d ) => {

		for ( let k = 0; k < TW * TH; k ++ ) {

			d[ k * 4 ] = mask[ k ] * 255;
			d[ k * 4 + 1 ] = Math.min( 1, blur[ k ] * 1.6 ) * 255;
			d[ k * 4 + 2 ] = 0; d[ k * 4 + 3 ] = 255;

		}

	} );

	const sampleM = ( z, y ) => {

		const fx = ( z - L.Z0 ) / LEN * TW - 0.5, fy = y / H * TH - 0.5;
		const ix = Math.max( 0, Math.min( TW - 2, Math.floor( fx ) ) ), iy = Math.max( 0, Math.min( TH - 2, Math.floor( fy ) ) );
		const tx = Math.min( 1, Math.max( 0, fx - ix ) ), ty = Math.min( 1, Math.max( 0, fy - iy ) );
		const a = mask[ iy * TW + ix ], b = mask[ iy * TW + ix + 1 ], c = mask[ ( iy + 1 ) * TW + ix ], d = mask[ ( iy + 1 ) * TW + ix + 1 ];
		return ( a * ( 1 - tx ) + b * tx ) * ( 1 - ty ) + ( c * ( 1 - tx ) + d * tx ) * ty;

	};

	// 位移网格：5cm 网格，只在有苔藓的格子生成三角形
	const STEP = 0.045;
	const NZ = Math.ceil( LEN / STEP ), NY = Math.ceil( H / STEP );
	const pos = [], idx = [], uvs = [];
	const vid = new Int32Array( ( NZ + 1 ) * ( NY + 1 ) ).fill( - 1 );
	const mv = new Float32Array( ( NZ + 1 ) * ( NY + 1 ) );
	for ( let j = 0; j <= NY; j ++ ) for ( let i = 0; i <= NZ; i ++ ) mv[ j * ( NZ + 1 ) + i ] = sampleM( L.Z1 - i * STEP, Math.min( H - 0.02, j * STEP ) );
	const vert = ( i, j ) => {

		const k = j * ( NZ + 1 ) + i;
		if ( vid[ k ] >= 0 ) return vid[ k ];
		const z = L.Z1 - i * STEP, y = Math.min( H - 0.02, j * STEP );
		const m = mv[ k ];
		// 厚度：边缘收进墙里，中心鼓起成团（「垫状」苔藓）
		const lump = fbm2( z * 6.0, y * 6.0 + 5, 3 );
		const th = Math.pow( m, 0.6 ) * ( 0.022 + 0.05 * lump * lump ) - 0.004;
		pos.push( L.WALL_X - th, y, z );
		uvs.push( z, y );
		vid[ k ] = pos.length / 3 - 1;
		return vid[ k ];

	};

	for ( let j = 0; j < NY; j ++ ) {

		for ( let i = 0; i < NZ; i ++ ) {

			const a = mv[ j * ( NZ + 1 ) + i ], b = mv[ j * ( NZ + 1 ) + i + 1 ], c = mv[ ( j + 1 ) * ( NZ + 1 ) + i ], d = mv[ ( j + 1 ) * ( NZ + 1 ) + i + 1 ];
			if ( Math.max( a, b, c, d ) < 0.02 ) continue;
			const v00 = vert( i, j ), v10 = vert( i + 1, j ), v01 = vert( i, j + 1 ), v11 = vert( i + 1, j + 1 );
			// 朝 -X：从 -X 方向看 z 递减为右手方向
			idx.push( v00, v01, v10, v10, v01, v11 );

		}

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	const mesh = new THREE.Mesh( g, makeMat( tex ) );
	mesh.castShadow = false;
	mesh.receiveShadow = true;
	return { mesh, tex, sampleM };

}

function boxBlur( src, w, h, r ) {

	const tmp = new Float32Array( w * h ), out = new Float32Array( w * h );
	for ( let y = 0; y < h; y ++ ) for ( let x = 0; x < w; x ++ ) {

		let s = 0, n = 0;
		for ( let k = - r; k <= r; k ++ ) { const xx = x + k; if ( xx >= 0 && xx < w ) { s += src[ y * w + xx ]; n ++; } }
		tmp[ y * w + x ] = s / n;

	}

	for ( let y = 0; y < h; y ++ ) for ( let x = 0; x < w; x ++ ) {

		let s = 0, n = 0;
		// 竖向模糊偏向下方（水把藻类往下带）
		for ( let k = - r; k <= r * 2; k ++ ) { const yy = y - k; if ( yy >= 0 && yy < h ) { s += tmp[ yy * w + x ]; n ++; } }
		out[ y * w + x ] = s / n;

	}

	return out;

}

// ———————————————————————— 左侧：钢架玻璃温室 ————————————————————————
export function buildGreenhouse( mats ) {

	const r = rng( 21 );
	const group = new THREE.Group();
	const X = L.GH_X, KH = 0.72, H1 = 4.6, BAY = 1.6;
	const steel = [], glass = [], concrete = [];

	// 混凝土矮墙
	const knee = bevelBox( 0.32, KH, L.Z1 - L.Z0, 0.02 );
	xf( knee, T( X - 0.16, KH / 2, ( L.Z0 + L.Z1 ) / 2 ) );
	worldUV( knee, 2.0, [ 0.3, 0.1 ] );
	concrete.push( knee );

	const beam = ( x0, y0, z0, x1, y1, z1, w = 0.07, d = 0.11 ) => {

		const a = new THREE.Vector3( x0, y0, z0 ), b = new THREE.Vector3( x1, y1, z1 );
		const len = a.distanceTo( b );
		const g = bevelBox( w, len, d, 0.006 );
		const q = new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), b.clone().sub( a ).normalize() );
		g.applyMatrix4( new THREE.Matrix4().compose( a.clone().add( b ).multiplyScalar( 0.5 ), q, new THREE.Vector3( 1, 1, 1 ) ) );
		steel.push( g );

	};

	// 立柱、横梁
	const rows = [ KH, 2.3, 3.55, H1 ];
	const nb = Math.floor( ( L.Z1 - L.Z0 ) / BAY );
	const RX1 = - 9.0, RY1 = 8.2; // 屋脊
	for ( let k = 0; k <= nb; k ++ ) {

		const z = L.Z1 - k * BAY;
		const major = k % 3 === 0;
		beam( X - 0.06, KH, z, X - 0.06, H1, z, major ? 0.16 : 0.07, major ? 0.16 : 0.1 );
		// 屋顶椽子
		beam( X - 0.06, H1, z, RX1, RY1, z, 0.07, major ? 0.18 : 0.1 );
		if ( major ) {

			// 主框架：内侧立柱 + 斜撑（中庭钢结构）
			beam( X - 0.6, 0, z, X - 0.6, H1 + 0.3, z, 0.2, 0.2 );
			beam( X - 0.6, 2.4, z, X - 0.06, H1, z, 0.08, 0.08 );

		}

	}

	for ( const y of rows ) beam( X - 0.06, y, L.Z0, X - 0.06, y, L.Z1, 0.1, 0.09 );
	// 屋顶檩条
	for ( let t = 0.25; t < 1; t += 0.25 ) {

		const x = X + ( RX1 - X ) * t, y = H1 + ( RY1 - H1 ) * t;
		beam( x, y, L.Z0, x, y, L.Z1, 0.08, 0.08 );

	}

	// 玻璃：每格可能完整、碎出锯齿洞、或整块缺失
	const pane = ( w, h, broken ) => {

		const s = new THREE.Shape();
		s.moveTo( - w / 2, - h / 2 ); s.lineTo( w / 2, - h / 2 ); s.lineTo( w / 2, h / 2 ); s.lineTo( - w / 2, h / 2 ); s.lineTo( - w / 2, - h / 2 );
		if ( broken ) {

			// 锯齿形破洞（星形，半径随机）
			const hole = new THREE.Path();
			const cx = ( r() - 0.5 ) * w * 0.3, cy = ( r() - 0.5 ) * h * 0.3, R = Math.min( w, h ) * ( 0.25 + r() * 0.2 );
			const n = 11 + Math.floor( r() * 6 );
			for ( let i = 0; i < n; i ++ ) {

				const a = - i / n * Math.PI * 2, rr = R * ( i % 2 ? 0.35 + r() * 0.3 : 0.8 + r() * 0.6 );
				const px = Math.max( - w / 2 + 0.02, Math.min( w / 2 - 0.02, cx + Math.cos( a ) * rr ) ), py = Math.max( - h / 2 + 0.02, Math.min( h / 2 - 0.02, cy + Math.sin( a ) * rr ) );
				i === 0 ? hole.moveTo( px, py ) : hole.lineTo( px, py );

			}

			hole.closePath();
			s.holes.push( hole );

		}

		const g = new THREE.ShapeGeometry( s );
		return ( g.index ? ( g.index ? g.toNonIndexed() : g ) : g );

	};

	for ( let k = 0; k < nb; k ++ ) {

		const z = L.Z1 - ( k + 0.5 ) * BAY;
		for ( let ri = 0; ri < rows.length - 1; ri ++ ) {

			const y0 = rows[ ri ], y1 = rows[ ri + 1 ];
			const u = r();
			if ( u < 0.42 ) continue; // 缺失
			const g = pane( BAY - 0.08, y1 - y0 - 0.08, u < 0.55 );
			g.rotateY( Math.PI / 2 );
			g.translate( X - 0.06, ( y0 + y1 ) / 2, z );
			glass.push( g );

		}

		// 屋顶玻璃
		const RL = Math.hypot( RX1 - X, RY1 - H1 );
		const ang = Math.atan2( RY1 - H1, - ( RX1 - X ) );
		for ( let t = 0; t < 4; t ++ ) {

			if ( r() < 0.4 ) continue;
			const g = pane( BAY - 0.08, RL / 4 - 0.08, r() < 0.4 );
			g.rotateX( - Math.PI / 2 );
			g.rotateZ( ang );
			const tt = ( t + 0.5 ) / 4;
			g.translate( X + ( RX1 - X ) * tt, H1 + ( RY1 - H1 ) * tt + 0.05, z );
			glass.push( g );

		}

	}

	const steelMesh = new THREE.Mesh( merge( steel ), mats.steel );
	steelMesh.castShadow = steelMesh.receiveShadow = true;
	const glassMesh = new THREE.Mesh( merge( glass ), mats.glass );
	glassMesh.renderOrder = 2;
	const concMesh = new THREE.Mesh( merge( concrete ), mats.concrete );
	concMesh.castShadow = concMesh.receiveShadow = true;
	group.add( steelMesh, glassMesh, concMesh );

	// 悬垂电缆：墙与温室之间（悬链线管道）
	const cables = [];
	for ( const [ z, sag ] of [ [ - 7.5, 0.9 ], [ - 7.9, 0.6 ], [ - 19, 1.1 ], [ - 27.5, 0.7 ] ] ) {

		const pts = [];
		for ( let t = 0; t <= 1.0001; t += 1 / 24 ) {

			const x = L.WALL_X - 0.05 + ( X - L.WALL_X + 0.1 ) * t;
			const y = L.WALL_H - 0.3 + ( H1 - L.WALL_H + 0.3 ) * t - sag * 4 * t * ( 1 - t );
			pts.push( new THREE.Vector3( x, y, z + ( r() - 0.5 ) * 0.02 ) );

		}

		cables.push( new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts ), 32, 0.012, 5, false ) );

	}

	const cableMesh = new THREE.Mesh( merge( cables ), mats.stem );
	cableMesh.castShadow = true;
	group.add( cableMesh );

	// 温室内部后墙（深色混凝土，靠近屋脊）
	const backWall = new THREE.BoxGeometry( 0.3, RY1 + 0.5, L.Z1 - L.Z0 ).toNonIndexed();
	xf( backWall, T( RX1 - 0.2, ( RY1 + 0.5 ) / 2, ( L.Z0 + L.Z1 ) / 2 ) );
	worldUV( backWall, 2.5 );
	const bw = new THREE.Mesh( backWall, mats.concreteDark );
	bw.receiveShadow = true;
	group.add( bw );

	// 地面玻璃碎片（温室墙根）
	const shards = [];
	for ( let i = 0; i < 260; i ++ ) {

		const s = new THREE.Shape();
		const a = 0.02 + r() * 0.07;
		s.moveTo( 0, 0 ); s.lineTo( a, r() * a * 0.5 ); s.lineTo( r() * a * 0.6, a * ( 0.6 + r() ) );
		const g = new THREE.ShapeGeometry( s );
		g.rotateX( - Math.PI / 2 + ( r() - 0.5 ) * 0.2 );
		g.rotateY( r() * 6.28 );
		const z = L.Z0 + 2 + r() * ( L.Z1 - L.Z0 - 4 );
		g.translate( X + 0.05 + Math.pow( r(), 2 ) * 1.4, L.SLAB_TOP + 0.004, z );
		shards.push( g );

	}

	const shardMesh = new THREE.Mesh( merge( shards ), mats.shard );
	group.add( shardMesh );
	return group;

}

// ———————————————————————— 巷子尽头：建筑 + 冷白灯 ————————————————————————
export function buildEnd( mats ) {

	const group = new THREE.Group();
	const Z = L.Z0;
	const parts = [];
	const box = ( x0, y0, z0, x1, y1, z1, tile = 2.5 ) => {

		const g = bevelBox( x1 - x0, y1 - y0, z1 - z0, 0.02 );
		xf( g, T( ( x0 + x1 ) / 2, ( y0 + y1 ) / 2, ( z0 + z1 ) / 2 ) );
		worldUV( g, tile );
		parts.push( g );

	};

	// 立面（中间一个 2.4m 宽的通道口）
	box( - 14, 0, Z - 6, - 1.2, 13, Z );
	box( 1.2, 0, Z - 6, 18, 13, Z );
	box( - 1.2, 3.2, Z - 6, 1.2, 13, Z );
	// 通道口顶部的过梁 + 楼层挑檐 + 壁柱
	box( - 1.4, 3.0, Z - 0.1, 1.4, 3.3, Z + 0.12 );
	for ( const y of [ 4.2, 7.6, 11.0 ] ) box( - 14, y, Z - 0.05, 18, y + 0.22, Z + 0.25 );
	for ( const x of [ - 6.5, - 3.2, 3.2, 6.5 ] ) box( x - 0.25, 0, Z - 0.05, x + 0.25, 13, Z + 0.3 );
	const m = new THREE.Mesh( merge( parts ), mats.concreteEnd );
	m.castShadow = m.receiveShadow = true;
	group.add( m );

	// 窗洞：内凹 25cm 的黑色窗口（部分有残留窗框）
	const win = [];
	for ( const y of [ 5.0, 8.4 ] ) for ( const x of [ - 4.85, - 1.6, 1.6, 4.85 ] ) {

		const g = new THREE.PlaneGeometry( 1.5, 2.0 );
		g.translate( x, y + 1.0, Z - 0.25 );
		win.push( g );

	}

	group.add( new THREE.Mesh( merge( win ), mats.dark ) );
	// 通道深处的黑暗
	const hole = new THREE.Mesh( new THREE.PlaneGeometry( 2.4, 3.2 ), mats.dark );
	hole.position.set( 0, 1.6, Z - 5.5 );
	group.add( hole );
	const sideA = new THREE.Mesh( new THREE.PlaneGeometry( 6, 3.2 ), mats.dark );
	sideA.rotation.y = Math.PI / 2; sideA.position.set( - 1.2, 1.6, Z - 3 );
	const sideB = sideA.clone(); sideB.rotation.y = - Math.PI / 2; sideB.position.x = 1.2;
	group.add( sideA, sideB );

	// 冷白壁灯：灯罩 + 发光灯泡
	const lampBody = new THREE.Mesh( new THREE.CylinderGeometry( 0.12, 0.17, 0.16, 16 ), mats.steel );
	lampBody.position.set( 0, 3.62, Z + 0.25 );
	const arm = new THREE.Mesh( new THREE.BoxGeometry( 0.04, 0.04, 0.3 ), mats.steel );
	arm.position.set( 0, 3.72, Z + 0.12 );
	const bulb = new THREE.Mesh( new THREE.SphereGeometry( 0.08, 16, 8 ), mats.lamp );
	bulb.position.set( 0, 3.52, Z + 0.25 );
	group.add( lampBody, arm, bulb );
	const light = new THREE.PointLight( 0xdbe6ff, 9, 16, 2 );
	light.position.set( 0, 3.4, Z + 0.35 );
	group.add( light );
	return { group, light };

}
