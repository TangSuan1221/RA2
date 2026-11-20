// 苔藓小巷：左侧钢架玻璃温室
//   · 倒角钢构（立柱/横梁/椽子/檩条 + 节点板 + 螺栓）
//   · 玻璃逐块变化（顶点色 r=随机 g=完好/裂/碎 b=屋顶），约 30% 缺失或碎得只剩边缘尖片
//   · 内部：混凝土种植池、翻倒的育苗台、枯死盆栽、碎花盆、约 4000 张蕨类卡片 + 杂草
import * as THREE from 'three/webgpu';
import { L } from './materials.js';
import { rng, fbm2, smooth, merge, worldUV, bevelBox, xf, T, paint, instanced, mergeIndexed, taperTube, voronoiCells } from './util.js';
import { grassClump } from './ground.js';

export const GH = { X: L.GH_X, KH: 0.72, H1: L.GH_H, RX1: - 9.0, RY1: 8.2, IN0: - 8.8 };

export function buildGreenhouse( mats ) {

	const r = rng( 21 );
	const group = new THREE.Group();
	const { X, KH, H1, RX1, RY1 } = GH;
	const BAY = L.BAY;
	const steel = [], glass = [], concrete = [], bolts = [];
	const ZA = L.Z0 - 1.6, ZB = L.Z1 + 1.6; // 立柱与 1.6m 开间对齐（钢材锈迹按此定位节点）

	// 混凝土矮墙
	const knee = bevelBox( 0.32, KH, ZB - ZA, 0.02 );
	xf( knee, T( X - 0.16, KH / 2, ( ZA + ZB ) / 2 ) );
	worldUV( knee, 2.0, [ 0.3, 0.1 ] );
	concrete.push( knee );

	const beam = ( x0, y0, z0, x1, y1, z1, w = 0.07, d = 0.11 ) => {

		const a = new THREE.Vector3( x0, y0, z0 ), b = new THREE.Vector3( x1, y1, z1 );
		const len = a.distanceTo( b );
		const g = bevelBox( w, len, d, Math.min( w, d ) * 0.08 );
		const q = new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), b.clone().sub( a ).normalize() );
		g.applyMatrix4( new THREE.Matrix4().compose( a.clone().add( b ).multiplyScalar( 0.5 ), q, new THREE.Vector3( 1, 1, 1 ) ) );
		steel.push( g );

	};

	const rows = L.ROWS;
	const nb = Math.floor( ( ZB - ZA ) / BAY );
	for ( let k = 0; k <= nb; k ++ ) {

		const z = ZB - k * BAY;
		const major = k % 3 === 0;
		beam( X - 0.06, KH, z, X - 0.06, H1, z, major ? 0.14 : 0.08, major ? 0.14 : 0.12 );
		beam( X - 0.06, H1, z, RX1, RY1, z, 0.07, major ? 0.16 : 0.1 );
		if ( major ) {

			beam( X - 0.6, 0, z, X - 0.6, H1 + 0.3, z, 0.18, 0.18 );
			beam( X - 0.6, 2.4, z, X - 0.06, H1, z, 0.08, 0.08 );
			// 柱脚底板
			const bp = bevelBox( 0.34, 0.03, 0.34, 0.006 );
			xf( bp, T( X - 0.6, 0.08, z ) );
			steel.push( bp );

		}

		// 节点板 + 螺栓（每个立柱与横梁交点）
		for ( const y of rows ) {

			const pl = bevelBox( 0.012, 0.16, 0.16, 0.003 );
			xf( pl, T( X + 0.0, y, z ) );
			steel.push( pl );
			for ( const [ dy, dz ] of [ [ 0.05, 0.05 ], [ - 0.05, 0.05 ], [ 0.05, - 0.05 ], [ - 0.05, - 0.05 ] ] ) {

				const b = new THREE.CylinderGeometry( 0.011, 0.011, 0.016, 6 );
				b.rotateZ( Math.PI / 2 );
				b.translate( X + 0.012, y + dy, z + dz );
				bolts.push( b );

			}

		}

	}

	for ( const y of rows ) beam( X - 0.06, y, ZA, X - 0.06, y, ZB, 0.12, 0.08 );
	for ( let t = 0.25; t < 1; t += 0.25 ) {

		const x = X + ( RX1 - X ) * t, y = H1 + ( RY1 - H1 ) * t;
		beam( x, y, ZA, x, y, ZB, 0.08, 0.08 );

	}

	// 屋脊梁 + 一根塌落下垂的檩条（废弃感）
	beam( RX1, RY1, ZA, RX1, RY1, ZB, 0.14, 0.14 );
	beam( X + ( RX1 - X ) * 0.5, H1 + ( RY1 - H1 ) * 0.5, - 24, - 4.6, 1.2, - 27.5, 0.08, 0.08 );

	// —— 玻璃 ——
	// 窗格局部：x ∈ [-w/2,w/2]（开间方向）、y ∈ [-h/2,h/2]；uv 0~1
	// 完好：整块平面；破碎：Voronoi 碎片，只保留与窗框相接的那一圈尖片（中间空洞），碎片略有错位
	const pane = ( w, h, seed, roof, broken ) => {

		const g = [];
		const mk = ( pts, shard ) => {

			const shape = new THREE.Shape( pts.map( ( p ) => new THREE.Vector2( p[ 0 ], p[ 1 ] ) ) );
			const sg = new THREE.ShapeGeometry( shape ).toNonIndexed();
			const pp = sg.attributes.position, uvA = new Float32Array( pp.count * 2 );
			for ( let i = 0; i < pp.count; i ++ ) { uvA[ i * 2 ] = pp.getX( i ) / w + 0.5; uvA[ i * 2 + 1 ] = pp.getY( i ) / h + 0.5; }
			sg.setAttribute( 'uv', new THREE.BufferAttribute( uvA, 2 ) );
			paint( sg, seed, shard, roof );
			g.push( sg );

		};

		if ( ! broken ) { mk( [ [ - w / 2, - h / 2 ], [ w / 2, - h / 2 ], [ w / 2, h / 2 ], [ - w / 2, h / 2 ] ], 0 ); return g; }
		// 冲击点 + 放射状种子
		const ix = ( r() - 0.5 ) * w * 0.5, iy = ( r() - 0.5 ) * h * 0.5;
		const seeds = [ [ ix, iy ] ];
		const n = 14 + Math.floor( r() * 10 );
		for ( let i = 0; i < n; i ++ ) {

			const ang = i / n * 6.28 + r() * 0.4, rr = Math.pow( r(), 0.6 ) * Math.max( w, h ) * 0.7;
			seeds.push( [ ix + Math.cos( ang ) * rr, iy + Math.sin( ang ) * rr * 0.8 ] );

		}

		const cells = voronoiCells( [ - w / 2, - h / 2, w / 2, h / 2 ], seeds );
		const keep = broken > 0.9 ? 0.25 : 0.55; // 碎得多的只剩少量尖片
		for ( const c of cells ) {

			// 只保留贴着窗框的碎片（重力：下沿与两侧保留得更多）
			let onFrame = false, low = false;
			for ( const p of c ) {

				if ( Math.abs( p[ 0 ] ) > w / 2 - 0.003 || Math.abs( p[ 1 ] ) > h / 2 - 0.003 ) onFrame = true;
				if ( p[ 1 ] < - h / 2 + 0.003 ) low = true;

			}

			if ( ! onFrame || r() > keep + ( low ? 0.3 : 0 ) ) continue;
			// 碎片向窗框方向收缩一点并拉尖：把离框最远的顶点再往外推，形成尖角
			let mx = 0, my = 0; for ( const p of c ) { mx += p[ 0 ]; my += p[ 1 ]; }
			mx /= c.length; my /= c.length;
			const pts = c.map( ( p ) => {

				const inner = Math.min( w / 2 - Math.abs( p[ 0 ] ), h / 2 - Math.abs( p[ 1 ] ) );
				const k = inner > 0.05 ? 0.96 : 1.0;
				return [ mx + ( p[ 0 ] - mx ) * k, my + ( p[ 1 ] - my ) * k ];

			} );
			mk( pts, 1 );

		}

		return g;

	};

	const glassState = () => {

		const u = r();
		if ( u < 0.3 ) return - 1; // 整块缺失
		if ( u < 0.42 ) return 1; // 只剩边缘少量尖片
		if ( u < 0.52 ) return 0.6; // 破洞较大
		return 0;

	};

	// 钢构上的玻璃压条（每块窗格四周的细框）也作为钢件
	for ( let k = 0; k < nb; k ++ ) {

		const z = ZB - ( k + 0.5 ) * BAY;
		for ( let ri = 0; ri < rows.length - 1; ri ++ ) {

			const y0 = rows[ ri ], y1 = rows[ ri + 1 ];
			const st = glassState();
			if ( st < 0 ) continue;
			const parts = pane( BAY - 0.08, y1 - y0 - 0.08, r(), 0, st );
			for ( const g of parts ) {

				g.rotateY( - Math.PI / 2 );
				g.translate( X - 0.06, ( y0 + y1 ) / 2, z );
				glass.push( g );

			}

		}

		const RL = Math.hypot( RX1 - X, RY1 - H1 );
		const ang = Math.atan2( RY1 - H1, X - RX1 );
		for ( let t = 0; t < 4; t ++ ) {

			const st = glassState();
			if ( st < 0 ) continue;
			const parts = pane( BAY - 0.08, RL / 4 - 0.08, r(), 1, st );
			const tt = ( t + 0.5 ) / 4;
			for ( const g of parts ) {

				// 局部 x=开间方向，y=沿坡向上（uv.y=0 为檐口，污垢在低处堆积）
				g.rotateX( - Math.PI / 2 );
				g.rotateY( Math.PI / 2 );
				g.rotateZ( - ang );
				g.translate( X + ( RX1 - X ) * tt, H1 + ( RY1 - H1 ) * tt + 0.05, z );
				glass.push( g );

			}

		}

	}

	const steelMesh = new THREE.Mesh( merge( steel ), mats.steel );
	steelMesh.castShadow = steelMesh.receiveShadow = true;
	const boltMesh = new THREE.Mesh( mergeIndexed( bolts ), mats.steel );
	const glassMesh = new THREE.Mesh( merge( glass ), mats.glass );
	glassMesh.renderOrder = 2;
	const concMesh = new THREE.Mesh( merge( concrete ), mats.concreteKnee );
	concMesh.castShadow = concMesh.receiveShadow = true;
	group.add( steelMesh, boltMesh, glassMesh, concMesh );

	// 温室内部后墙（深色混凝土）
	const backWall = new THREE.BoxGeometry( 0.3, RY1 + 0.5, ZB - ZA ).toNonIndexed();
	xf( backWall, T( RX1 - 0.2, ( RY1 + 0.5 ) / 2, ( ZA + ZB ) / 2 ) );
	worldUV( backWall, 2.5 );
	const bw = new THREE.Mesh( backWall, mats.concreteDark );
	bw.receiveShadow = true;
	group.add( bw );

	// 地面玻璃碎片（温室墙根 + 室内）
	const shards = [];
	for ( let i = 0; i < 1400; i ++ ) {

		const s = new THREE.Shape();
		const a = 0.015 + Math.pow( r(), 2 ) * 0.12;
		s.moveTo( 0, 0 ); s.lineTo( a, r() * a * 0.5 ); s.lineTo( r() * a * 0.6, a * ( 0.6 + r() ) );
		const g = new THREE.ShapeGeometry( s );
		g.rotateX( - Math.PI / 2 + ( r() - 0.5 ) * 0.2 );
		g.rotateY( r() * 6.28 );
		const z = L.Z0 + 2 + r() * ( L.Z1 - L.Z0 - 4 );
		const inside = r() < 0.45;
		const x = inside ? X - 0.4 - r() * 5 : X + 0.05 + Math.pow( r(), 2 ) * 1.4;
		g.translate( x, inside ? 0.09 : L.SLAB_TOP + 0.006, z );
		shards.push( g );

	}

	group.add( new THREE.Mesh( merge( shards ), mats.shard ) );

	// 室内地面：旧水磨石/地砖
	const fl = new THREE.PlaneGeometry( X - RX1 + 0.2, ZB - ZA );
	fl.rotateX( - Math.PI / 2 );
	fl.translate( ( X + RX1 ) / 2, 0.075, ( ZA + ZB ) / 2 );
	const flm = new THREE.Mesh( fl, mats.ghFloor );
	flm.receiveShadow = true;
	group.add( flm );
	return group;

}

// ———————————————————————— 温室内部陈设 + 植物 ————————————————————————
// 蕨叶卡片几何：拱形叶片（uv.x -1~1 横向，uv.y 0~1 沿叶轴）
function frondGeometry( len = 1, w = 0.22, arch = 0.45, seg = 6 ) {

	const pos = [], uvs = [], idx = [];
	for ( let j = 0; j <= seg; j ++ ) {

		const t = j / seg;
		const y = Math.sin( t * Math.PI * 0.55 ) * len * 0.8 - arch * t * t * len;
		const z = t * len;
		for ( const u of [ - 1, 1 ] ) {

			pos.push( u * w, y + Math.abs( u ) * 0.02 * t, z );
			uvs.push( u, t );

		}

	}

	for ( let j = 0; j < seg; j ++ ) {

		const a = j * 2;
		idx.push( a, a + 2, a + 1, a + 1, a + 2, a + 3 );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

// 蕨丛 = 若干拱形叶片绕中心放射
function fernClump( r, n = 9 ) {

	const list = [];
	for ( let i = 0; i < n; i ++ ) {

		const f = frondGeometry( 0.7 + r() * 0.5, 0.17 + r() * 0.08, 0.35 + r() * 0.4 );
		f.rotateX( - 0.25 - r() * 0.3 );
		f.rotateY( i / n * Math.PI * 2 + r() * 0.5 );
		list.push( f );

	}

	return mergeIndexed( list );

}

// 车削花盆（陶土）
function potGeometry( broken = 0 ) {

	const pts = [ [ 0, 0 ], [ 0.08, 0 ], [ 0.085, 0.01 ], [ 0.12, 0.2 ], [ 0.135, 0.2 ], [ 0.14, 0.235 ], [ 0.125, 0.235 ], [ 0.115, 0.215 ], [ 0.11, 0.21 ], [ 0.075, 0.03 ], [ 0.0, 0.03 ] ].map( ( p ) => new THREE.Vector2( p[ 0 ], p[ 1 ] ) );
	const g = new THREE.LatheGeometry( pts, 18, 0, Math.PI * 2 * ( broken ? 0.55 + broken * 0.3 : 1 ) );
	g.computeVertexNormals();
	return g;

}

export function buildGreenhouseInterior( mats, props ) {

	const r = rng( 515 );
	const group = new THREE.Group();
	const { X, IN0 } = GH;
	const conc = [], wood = [], metal = [], soil = [];
	// 种植池：靠玻璃一排（窄）+ 内侧一排（宽），中间过道
	const beds = [ { x0: X - 1.25, x1: X - 0.35, h: 0.5 }, { x0: IN0 + 0.1, x1: IN0 + 1.5, h: 0.6 } ];
	for ( const b of beds ) {

		for ( let z = L.Z1 + 1; z > L.Z0 - 1; z -= 6.4 ) {

			const len = 5.9;
			const zc = z - len / 2;
			for ( const [ x, w ] of [ [ b.x0 + 0.06, 0.12 ], [ b.x1 - 0.06, 0.12 ] ] ) {

				const g = bevelBox( w, b.h, len, 0.015 );
				xf( g, T( x, b.h / 2 + 0.07, zc ) );
				conc.push( worldUV( g, 1.5, [ r(), r() ] ) );

			}

			for ( const zz of [ zc - len / 2 + 0.06, zc + len / 2 - 0.06 ] ) {

				const g = bevelBox( b.x1 - b.x0, b.h, 0.12, 0.015 );
				xf( g, T( ( b.x0 + b.x1 ) / 2, b.h / 2 + 0.07, zz ) );
				conc.push( worldUV( g, 1.5, [ r(), r() ] ) );

			}

			const sp = new THREE.PlaneGeometry( b.x1 - b.x0 - 0.2, len - 0.2, 8, 24 );
			sp.rotateX( - Math.PI / 2 );
			const pa = sp.attributes.position;
			for ( let i = 0; i < pa.count; i ++ ) pa.setY( i, 0.04 * fbm2( pa.getX( i ) * 3 + z, pa.getZ( i ) * 3, 2 ) );
			sp.computeVertexNormals();
			sp.translate( ( b.x0 + b.x1 ) / 2, b.h + 0.07 - 0.05, zc );
			soil.push( sp );

		}

	}

	// 育苗台（金属框 + 木板条）：部分翻倒
	const bench = ( x, z, ry, over ) => {

		const parts = [], wparts = [];
		const W = 0.7, D = 1.6, Hh = 0.8;
		for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

			const leg = bevelBox( 0.04, Hh, 0.04, 0.004 );
			xf( leg, T( sx * ( W / 2 - 0.03 ), Hh / 2, sz * ( D / 2 - 0.03 ) ) );
			parts.push( leg );

		}

		for ( const sx of [ - 1, 1 ] ) {

			const rail = bevelBox( 0.04, 0.05, D, 0.004 ); xf( rail, T( sx * ( W / 2 - 0.03 ), Hh - 0.03, 0 ) ); parts.push( rail );
			const low = bevelBox( 0.03, 0.03, D, 0.004 ); xf( low, T( sx * ( W / 2 - 0.03 ), 0.18, 0 ) ); parts.push( low );

		}

		for ( let i = 0; i < 6; i ++ ) {

			if ( over && r() < 0.3 ) continue; // 缺失木条
			const s = bevelBox( 0.1, 0.02, D, 0.004 );
			xf( s, T( - W / 2 + 0.06 + i * 0.116, Hh + 0.01, 0, 0, 0, over ? ( r() - 0.5 ) * 0.05 : 0 ) );
			wparts.push( worldUV( s, 0.8, [ r(), r() ] ) );

		}

		// 翻倒：绕长轴转 90°，台面朝外
		const M = over ? T( x, W / 2 + 0.07, z, 0, ry, Math.PI / 2 * ( r() < 0.5 ? 1 : - 1 ) ) : T( x, 0.075, z, 0, ry );
		for ( const g of parts ) metal.push( xf( g, M ) );
		for ( const g of wparts ) wood.push( xf( g, M ) );
		return { over };

	};

	const benchSpots = [];
	for ( let z = 6.5; z > L.Z0 + 1; z -= 2.6 + r() * 2.2 ) {

		const x = - 5.4 + ( r() - 0.5 ) * 0.6;
		const over = r() < 0.4;
		bench( x, z, ( r() - 0.5 ) * ( over ? 0.6 : 0.12 ), over );
		benchSpots.push( { x, z, over } );

	}

	const cm = new THREE.Mesh( merge( conc ), mats.concreteKnee );
	cm.castShadow = cm.receiveShadow = true;
	const wm = new THREE.Mesh( merge( wood ), mats.wood );
	wm.castShadow = wm.receiveShadow = true;
	const mm = new THREE.Mesh( merge( metal ), mats.steel );
	mm.castShadow = mm.receiveShadow = true;
	const sm = new THREE.Mesh( mergeIndexed( soil ), mats.soil );
	sm.receiveShadow = true;
	group.add( cm, wm, mm, sm );

	// —— 花盆：台面上的枯死盆栽 + 地上翻倒/破碎的 ——
	const pots = [ potGeometry( 0 ), potGeometry( 0.5 ), potGeometry( 0.2 ) ];
	const pl = pots.map( () => ( { m: [], c: [] } ) );
	const deadSticks = [];
	const potCol = () => new THREE.Color().setRGB( 0.16 + r() * 0.05, 0.075 + r() * 0.03, 0.045 + r() * 0.02 ).multiplyScalar( 0.75 );
	for ( const b of benchSpots ) {

		if ( b.over ) {

			// 翻倒的台子旁：散落的碎盆
			for ( let i = 0; i < 6; i ++ ) {

				const k = 1 + Math.floor( r() * 2 );
				const x = b.x + ( r() - 0.5 ) * 1.6, z = b.z + ( r() - 0.5 ) * 2;
				pl[ k ].m.push( new THREE.Matrix4().compose( new THREE.Vector3( x, 0.075 + 0.12, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( Math.PI / 2 + ( r() - 0.5 ) * 0.4, r() * 6, 0 ) ), new THREE.Vector3( 1, 1, 1 ).multiplyScalar( 0.8 + r() * 0.5 ) ) );
				pl[ k ].c.push( potCol() );

			}

			continue;

		}

		for ( let i = 0; i < 5; i ++ ) {

			if ( r() < 0.25 ) continue;
			const x = b.x + ( r() - 0.5 ) * 0.4, z = b.z + ( i - 2 ) * 0.3;
			const s = 0.8 + r() * 0.5;
			pl[ 0 ].m.push( new THREE.Matrix4().compose( new THREE.Vector3( x, 0.075 + 0.82, z ), new THREE.Quaternion(), new THREE.Vector3( s, s, s ) ) );
			pl[ 0 ].c.push( potCol() );
			// 枯枝：几根细管
			for ( let k = 0; k < 4; k ++ ) {

				const pts = [];
				let px = x, py = 0.075 + 0.82 + 0.2 * s, pz = z;
				const dx = ( r() - 0.5 ) * 0.3, dz = ( r() - 0.5 ) * 0.3;
				for ( let t = 0; t < 5; t ++ ) { pts.push( new THREE.Vector3( px, py, pz ) ); px += dx * 0.1 + ( r() - 0.5 ) * 0.02; py += 0.06 + r() * 0.03; pz += dz * 0.1 + ( r() - 0.5 ) * 0.02; }
				deadSticks.push( taperTube( pts, 0.006, 0.002, 3 ) );

			}

		}

	}

	// 种植池边、过道上的倒地花盆
	for ( let i = 0; i < 26; i ++ ) {

		const k = Math.floor( r() * 3 );
		const x = - 5.4 + ( r() - 0.5 ) * 2.4, z = L.Z0 + 2 + r() * ( L.Z1 - L.Z0 - 3 );
		const fallen = k > 0 || r() < 0.5;
		pl[ k ].m.push( new THREE.Matrix4().compose( new THREE.Vector3( x, 0.075 + ( fallen ? 0.12 : 0 ), z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( fallen ? Math.PI / 2 : 0, r() * 6, 0 ) ), new THREE.Vector3( 1, 1, 1 ).multiplyScalar( 0.9 + r() * 0.6 ) ) );
		pl[ k ].c.push( potCol() );

	}

	pots.forEach( ( g, k ) => pl[ k ].m.length && group.add( instanced( g, mats.pot, pl[ k ].m, pl[ k ].c ) ) );
	if ( deadSticks.length ) group.add( new THREE.Mesh( mergeIndexed( deadSticks ), mats.stem ) );

	// —— 植物：蕨类卡片丛（约 4000 张叶片）+ 杂草 ——
	const ferns = [ fernClump( r, 8 ), fernClump( r, 11 ), fernClump( r, 6 ) ];
	const fl = ferns.map( () => ( { m: [], c: [] } ) );
	let fronds = 0;
	const addFern = ( x, y, z, s ) => {

		const k = Math.floor( r() * ferns.length );
		fl[ k ].m.push( new THREE.Matrix4().compose( new THREE.Vector3( x, y, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, r() * 6.28, 0 ) ), new THREE.Vector3( s, s * ( 0.8 + r() * 0.4 ), s ) ) );
		const c = new THREE.Color().setRGB( 0.032 + r() * 0.02, 0.05 + r() * 0.025, 0.014 + r() * 0.01 );
		if ( r() < 0.15 ) c.setRGB( 0.07, 0.055, 0.025 ); // 枯黄
		fl[ k ].c.push( c );
		fronds += [ 8, 11, 6 ][ k ];

	};

	for ( const b of beds ) for ( let z = L.Z1; z > L.Z0; z -= 0.3 + r() * 0.35 ) {

		const x = b.x0 + 0.2 + r() * ( b.x1 - b.x0 - 0.4 );
		if ( fbm2( x * 0.8, z * 0.4, 3 ) < 0.33 ) continue;
		addFern( x, b.h + 0.05, z, 0.6 + r() * 0.7 );

	}

	// 过道裂缝里的蕨与杂草
	for ( let i = 0; i < 260; i ++ ) {

		const x = - 6.5 + r() * 2.6, z = L.Z0 + r() * ( L.Z1 - L.Z0 );
		if ( fbm2( x * 0.6 + 4, z * 0.3, 3 ) < 0.45 ) continue;
		addFern( x, 0.07, z, 0.4 + r() * 0.6 );

	}

	// 温室外墙根（巷子一侧）也有一排蕨
	for ( let z = L.Z1; z > L.Z0; z -= 0.5 + r() * 1.4 ) addFern( X + 0.25 + r() * 0.25, L.SLAB_TOP - 0.03, z, 0.35 + r() * 0.35 );
	ferns.forEach( ( g, k ) => fl[ k ].m.length && group.add( instanced( g, mats.fern, fl[ k ].m, fl[ k ].c ) ) );

	const weeds = [ grassClump( r, 12, 1.3 ), grassClump( r, 8, 0.9 ) ];
	const wl = weeds.map( () => ( { m: [], c: [] } ) );
	for ( let i = 0; i < 1300; i ++ ) {

		const onBed = r() < 0.6;
		const b = beds[ Math.floor( r() * 2 ) ];
		const x = onBed ? b.x0 + 0.15 + r() * ( b.x1 - b.x0 - 0.3 ) : - 6.6 + r() * 2.8;
		const z = L.Z0 + r() * ( L.Z1 - L.Z0 );
		const k = Math.floor( r() * 2 );
		const s = 0.5 + r() * 0.7;
		wl[ k ].m.push( new THREE.Matrix4().compose( new THREE.Vector3( x, onBed ? b.h + 0.04 : 0.07, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, r() * 6, 0 ) ), new THREE.Vector3( s, s, s ) ) );
		wl[ k ].c.push( new THREE.Color().setRGB( 0.04 + r() * 0.03, 0.05 + r() * 0.03, 0.02 ) );

	}

	weeds.forEach( ( g, k ) => group.add( instanced( g, mats.grass, wl[ k ].m, wl[ k ].c, { cast: false } ) ) );
	return { group, fronds };

}
