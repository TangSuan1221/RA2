// 程序化铝制划艇（搭接式船壳 / lapstrake）
//   外壳：7 列搭接船板（每列略倾斜，上一列压住下一列，露出板缘台阶），带凹痕
//   铆钉：沿每条搭接线、每根肋条外侧的实例化半球铆钉
//   包边圆管、龙骨条、尾板、3 条带厚度的倒角座板、肋条、桨架
//   船内：3cm 浑浊积水（带落叶）、两支桨（一支搁在桨架上探入水中）、绳圈、背包、防水布、油桶
// 船体本地坐标：+X 船头方向，Y 向上（船舷顶 y=0），Z 横向。UV 以米为单位（沿船长 × 沿截面弧长），不拉伸
import * as THREE from 'three/webgpu';
import { boatPaint, aluminium, oldWood, fabric, bilgeWater } from './materials.js';
import { merge, box, meshOf, mulberry } from './util.js';

const L = 3.7; // 艇长
const W = 0.72; // 最大半宽
const D = 0.46; // 舷深
const T = 0.012; // 壳厚
const NSTRAKE = 7; // 船板列数
const LAP = 0.009; // 搭接台阶高度
const OV = 0.035; // 搭接重叠（截面参数 s 的比例）

// 沿船长的参数 u ∈ [0,1]（0 = 船尾，1 = 船头）
const halfWidth = ( u ) => {

	if ( u < 0.42 ) return W * ( 0.8 + 0.2 * Math.sin( ( u / 0.42 ) * Math.PI / 2 ) );
	const k = ( u - 0.42 ) / 0.58;
	return W * Math.max( 0.025, Math.pow( Math.max( 0, 1 - Math.pow( Math.min( k, 1 ), 2.1 ) ), 0.62 ) );

};
const keelY = ( u ) => - D + 0.24 * Math.pow( Math.max( 0, ( u - 0.55 ) / 0.45 ), 1.8 ) + 0.03 * Math.pow( Math.max( 0, 0.12 - u ) / 0.12, 2 );
const sheerY = ( u ) => 0.11 * Math.pow( Math.max( 0, ( u - 0.5 ) / 0.5 ), 2.2 );

// 截面：θ ∈ [-π/2, π/2]，超椭圆（平底、圆舭）
function section( u, th, inset = 0 ) {

	const w = Math.max( 0.004, halfWidth( u ) - inset );
	const top = sheerY( u );
	const bot = keelY( u ) + inset;
	const d = top - bot;
	const s = Math.sin( th ), c = Math.cos( th );
	const n = 3.2;
	const z = w * Math.sign( s ) * Math.pow( Math.abs( s ), 2 / n );
	const y = top - d * Math.pow( Math.abs( c ), 2 / n );
	return new THREE.Vector3( ( u - 0.5 ) * L, y, z );

}

// 外法线（数值近似：向外扩 1cm 的截面点减原点）
function outward( u, th ) {

	return section( u, th, - 0.01 ).sub( section( u, th, 0 ) ).normalize();

}

// 凹痕：若干个高斯形的浅坑（多年碰撞），在船壳上做 ±6mm 的起伏
const DENTS = ( () => {

	const r = mulberry( 77 );
	return Array.from( { length: 16 }, () => ( { x: ( r() - 0.5 ) * L * 0.9, s: 0.25 + r() * 0.7, side: r() < 0.5 ? - 1 : 1, rad: 0.08 + r() * 0.18, depth: 0.003 + r() * 0.007 } ) );

} )();
function dent( x, s, side ) {

	let d = 0;
	for ( const k of DENTS ) {

		if ( k.side !== side ) continue;
		const dx = ( x - k.x ) / k.rad, ds = ( s - k.s ) * 1.1 / k.rad;
		d += k.depth * Math.exp( - ( dx * dx + ds * ds ) );

	}

	return d;

}

// 船壳上某点（u, s, side）加搭接偏移 off 与凹痕
function hullPoint( u, s, side, off ) {

	const th = side * s * Math.PI / 2;
	const p = section( u, th, 0 );
	const n = outward( u, th );
	const dd = dent( p.x, s, side ) * Math.sin( Math.min( 1, u * 1.2 ) * Math.PI ); // 船头船尾不凹
	return { p: p.addScaledVector( n, off - dd ), n };

}

/**
 * 搭接外壳：每列船板一条网格（顶点不共享 → 板缘是硬边），附加板缘的"唇"面。
 * 自定义属性 wear：板缘/舷边/龙骨处磨损高（油漆剥落），板面中间低
 */
function lapstrakeHull( rivets ) {

	const pos = [], uvs = [], wear = [], idx = [];
	const nu = 72, m = 6;
	let base = 0;
	const push = ( p, u, v, w ) => {

		pos.push( p.x, p.y, p.z ); uvs.push( u, v ); wear.push( w );

	};

	for ( const side of [ - 1, 1 ] ) {

		for ( let k = 0; k < NSTRAKE; k ++ ) {

			const s0 = k === 0 ? 0 : k / NSTRAKE - OV;
			const s1 = ( k + 1 ) / NSTRAKE;
			const offAt = ( j ) => ( k === 0 ? 0 : LAP * ( 1 - j / m ) );
			// 板面
			for ( let i = 0; i <= nu; i ++ ) {

				const u = 0.004 + ( i / nu ) * 0.992;
				for ( let j = 0; j <= m; j ++ ) {

					const s = s0 + ( s1 - s0 ) * ( j / m );
					const { p } = hullPoint( u, s, side, offAt( j ) );
					const e = Math.min( j / m, 1 - j / m );
					const w = Math.max( Math.pow( 1 - Math.min( 1, e * 4 ), 2 ), s > 0.93 ? 1 : 0, s < 0.04 ? 0.8 : 0 );
					push( p, p.x, s * 1.05, w );

				}

			}

			for ( let i = 0; i < nu; i ++ ) for ( let j = 0; j < m; j ++ ) {

				const a = base + i * ( m + 1 ) + j, b = a + m + 1;
				if ( side > 0 ) idx.push( a, b, a + 1, b, b + 1, a + 1 ); else idx.push( a, a + 1, b, b, a + 1, b + 1 );

			}

			base += ( nu + 1 ) * ( m + 1 );

			// 板缘唇面：从偏移 LAP 收回到 0（朝下的窄条），两种绕序都生成，保证从任一侧可见
			if ( k > 0 ) {

				for ( let i = 0; i <= nu; i ++ ) {

					const u = 0.004 + ( i / nu ) * 0.992;
					const a = hullPoint( u, s0, side, LAP ).p, b = hullPoint( u, s0, side, 0 ).p;
					push( a, a.x, s0 * 1.05, 1 ); push( b, b.x, s0 * 1.05 - 0.01, 1 );

				}

				for ( let i = 0; i < nu; i ++ ) {

					const a = base + i * 2, b = a + 2;
					idx.push( a, b, a + 1, b, b + 1, a + 1, a, a + 1, b, b, a + 1, b + 1 );

				}

				base += ( nu + 1 ) * 2;

				// 搭接线上的铆钉（在重叠带中间）
				const sR = s0 + OV * 0.45;
				for ( let x = - L / 2 + 0.06; x < L / 2 - 0.05; x += 0.085 ) {

					const u = x / L + 0.5;
					if ( halfWidth( u ) < 0.08 ) continue;
					const { p, n } = hullPoint( u, sR, side, LAP * ( 1 - ( sR - s0 ) / ( s1 - s0 ) ) + 0.0005 );
					rivets.push( { p, n } );

				}

			}

		}

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setAttribute( 'wear', new THREE.Float32BufferAttribute( wear, 1 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

// 内壳：平滑放样（内侧看不到搭接），wear = 舷边附近高
function loft( inset, flip, nu = 64, nt = 36 ) {

	const pos = [], uvs = [], wear = [], idx = [];
	for ( let i = 0; i <= nu; i ++ ) {

		const u = i / nu;
		let arc = 0, prev = null;
		for ( let j = 0; j <= nt; j ++ ) {

			const th = - Math.PI / 2 + ( j / nt ) * Math.PI;
			const p = section( u, th, inset );
			if ( prev ) arc += p.distanceTo( prev );
			prev = p;
			pos.push( p.x, p.y, p.z );
			uvs.push( p.x, arc );
			wear.push( Math.abs( th ) > 1.42 ? 1 : 0.15 );

		}

	}

	for ( let i = 0; i < nu; i ++ ) for ( let j = 0; j < nt; j ++ ) {

		const a = i * ( nt + 1 ) + j, b = a + nt + 1;
		if ( flip ) idx.push( a, a + 1, b, b, a + 1, b + 1 ); else idx.push( a, b, a + 1, b, b + 1, a + 1 );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setAttribute( 'wear', new THREE.Float32BufferAttribute( wear, 1 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

// 船舷包边：沿舷线的卷边圆管
function gunwale( side ) {

	const pts = [];
	for ( let i = 0; i <= 60; i ++ ) pts.push( section( 0.003 + ( i / 60 ) * 0.994, side * Math.PI / 2, - 0.006 ).add( new THREE.Vector3( 0, 0.004, 0 ) ) );
	return new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts ), 110, 0.019, 10, false );

}

// 尾板：带倒角的厚板，填满 u=0 截面
function transom() {

	const shape = new THREE.Shape();
	const N = 24;
	for ( let j = 0; j <= N; j ++ ) {

		const th = - Math.PI / 2 + ( j / N ) * Math.PI;
		const p = section( 0, th, 0.004 );
		if ( j === 0 ) shape.moveTo( p.z, p.y ); else shape.lineTo( p.z, p.y );

	}

	const g = new THREE.ExtrudeGeometry( shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 } );
	g.rotateY( Math.PI / 2 );
	g.translate( - L / 2 - 0.004, 0, 0 );
	const p = g.attributes.position;
	const uv = new Float32Array( p.count * 2 ), wear = new Float32Array( p.count );
	for ( let i = 0; i < p.count; i ++ ) {

		uv[ i * 2 ] = p.getZ( i ); uv[ i * 2 + 1 ] = p.getY( i );
		wear[ i ] = p.getY( i ) > - 0.04 ? 1 : 0.3;

	}

	g.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
	g.setAttribute( 'wear', new THREE.BufferAttribute( wear, 1 ) );
	return g;

}

// 内侧肋条：沿内壳截面的扁条
function rib( u ) {

	const pts = [];
	for ( let j = 2; j <= 34; j ++ ) pts.push( section( u, - Math.PI / 2 + ( j / 36 ) * Math.PI, T + 0.008 ) );
	return new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts ), 40, 0.013, 5, false );

}

// 船桨：带倒角的木杆 + 弧形桨叶 + 握把
function oar() {

	const shaft = new THREE.CylinderGeometry( 0.02, 0.023, 1.75, 12 );
	shaft.rotateZ( Math.PI / 2 );
	const bs = new THREE.Shape();
	bs.moveTo( 0, - 0.035 ); bs.quadraticCurveTo( 0.25, - 0.085, 0.5, - 0.075 ); bs.quadraticCurveTo( 0.53, 0, 0.5, 0.075 ); bs.quadraticCurveTo( 0.25, 0.085, 0, 0.035 ); bs.closePath();
	const blade = new THREE.ExtrudeGeometry( bs, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 10 } );
	blade.rotateX( Math.PI / 2 );
	blade.translate( - 0.87 - 0.5, 0, 0 );
	const grip = new THREE.CylinderGeometry( 0.025, 0.025, 0.15, 12 );
	grip.rotateZ( Math.PI / 2 );
	grip.translate( 0.95, 0, 0 );
	const collar = new THREE.TorusGeometry( 0.026, 0.008, 6, 14 );
	collar.rotateY( Math.PI / 2 );
	collar.translate( 0.15, 0, 0 );
	const g = merge( [ shaft, blade, grip, collar ] );
	const p = g.attributes.position, uv = g.attributes.uv;
	for ( let i = 0; i < p.count; i ++ ) uv.setXY( i, Math.atan2( p.getZ( i ), p.getY( i ) ) * 0.03 + p.getZ( i ), p.getX( i ) * 1.2 );
	return g;

}

// 绳圈：压扁的螺旋 + 一段甩出的绳头
function ropeCoil() {

	const pts = [];
	const turns = 5;
	for ( let i = 0; i <= turns * 40; i ++ ) {

		const a = ( i / 40 ) * Math.PI * 2;
		const r = 0.09 + ( i / ( turns * 40 ) ) * 0.06 + Math.sin( a * 3 ) * 0.004;
		pts.push( new THREE.Vector3( Math.cos( a ) * r, 0.012 + Math.sin( a * 0.5 + i * 0.01 ) * 0.008 + ( i % 80 < 40 ? 0 : 0.006 ), Math.sin( a ) * r * 0.85 ) );

	}

	for ( let i = 1; i <= 12; i ++ ) pts.push( new THREE.Vector3( 0.15 + i * 0.035, 0.012 + Math.sin( i * 0.7 ) * 0.01, - 0.02 * i + Math.sin( i ) * 0.02 ) );
	const g = new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts ), turns * 120, 0.011, 6, false );
	const uv = g.attributes.uv;
	for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, uv.getX( i ) * 40, uv.getY( i ) * 0.2 );
	return g;

}

// 背包：倒角主体 + 盖布 + 前袋 + 两条肩带
function backpack() {

	const parts = [
		box( 0.3, 0.42, 0.2, 0, 0.21, 0, { bevel: 0.06 } ),
		box( 0.31, 0.06, 0.22, 0, 0.44, 0.0, { bevel: 0.025, rx: 0.15 } ),
		box( 0.26, 0.16, 0.06, 0, 0.36, 0.11, { bevel: 0.025, rx: 0.25 } ),
		box( 0.22, 0.16, 0.07, 0, 0.13, 0.12, { bevel: 0.03 } ),
		box( 0.08, 0.2, 0.08, 0.18, 0.15, 0, { bevel: 0.03 } ),
	];
	for ( const sx of [ - 0.08, 0.08 ] ) {

		const c = new THREE.CatmullRomCurve3( [ new THREE.Vector3( sx, 0.4, - 0.1 ), new THREE.Vector3( sx * 1.1, 0.3, - 0.16 ), new THREE.Vector3( sx * 1.2, 0.12, - 0.15 ), new THREE.Vector3( sx * 1.3, 0.04, - 0.1 ) ] );
		const t = new THREE.TubeGeometry( c, 16, 0.014, 5, false );
		t.scale( 1, 1, 1 );
		parts.push( t );

	}

	const g = merge( parts );
	const p = g.attributes.position, uv = g.attributes.uv;
	for ( let i = 0; i < p.count; i ++ ) uv.setXY( i, ( p.getX( i ) + p.getZ( i ) ) * 2.5, p.getY( i ) * 2.5 );
	return g;

}

// 防水布：细分平面，搭在船头座板上，向两侧垂落并起皱
function tarp() {

	const g = new THREE.PlaneGeometry( 0.95, 1.0, 36, 36 );
	g.rotateX( - Math.PI / 2 );
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {

		const x = p.getX( i ), z = p.getZ( i );
		const fall = Math.max( 0, Math.abs( z ) - 0.12 );
		const y = - Math.pow( fall, 1.4 ) * 0.55 - Math.max( 0, x + 0.15 ) * 0.25 + Math.sin( x * 23 + z * 7 ) * 0.012 + Math.sin( z * 31 - x * 5 ) * 0.008 * ( 1 + fall * 4 );
		p.setY( i, y );
		p.setZ( i, z * ( 1 - fall * 0.25 ) );

	}

	g.computeVertexNormals();
	return g;

}

// 舱底积水：在内壳某一高度处的水平截面（求解超椭圆截面与水平面的交点）
function bilgeShape( level ) {

	const sh = new THREE.Shape();
	const left = [], right = [];
	for ( let i = 0; i <= 60; i ++ ) {

		const u = 0.01 + ( i / 60 ) * 0.97;
		const top = sheerY( u ), bot = keelY( u ) + T;
		if ( level <= bot + 0.002 ) continue;
		const c = Math.pow( ( top - level ) / ( top - bot ), 3.2 / 2 );
		const s = Math.sqrt( Math.max( 0, 1 - c * c ) );
		const z = ( halfWidth( u ) - T - 0.004 ) * Math.pow( s, 2 / 3.2 );
		const x = ( u - 0.5 ) * L;
		right.push( [ x, z ] ); left.push( [ x, - z ] );

	}

	const pts = [ ...right, ...left.reverse() ];
	pts.forEach( ( [ x, z ], i ) => ( i === 0 ? sh.moveTo( x, z ) : sh.lineTo( x, z ) ) );
	sh.closePath();
	const g = new THREE.ShapeGeometry( sh );
	g.rotateX( Math.PI / 2 );
	g.translate( 0, level, 0 );
	// ShapeGeometry 绕 X 旋转 +90° 后法线朝下，翻转
	const idx = g.index.array;
	for ( let i = 0; i < idx.length; i += 3 ) { const t = idx[ i ]; idx[ i ] = idx[ i + 2 ]; idx[ i + 2 ] = t; }

	g.computeVertexNormals();
	return g;

}

export function buildBoat( { leafGeo = null, leafMat = null, jerrycan = null } = {} ) {

	const g = new THREE.Group();
	const paintOut = boatPaint();
	const paintIn = boatPaint( { inner: true } );
	const alu = aluminium();
	const wood = oldWood( { tint: 0x5a4a3a, scale: 1.2 } );

	const rivets = [];
	g.add( meshOf( lapstrakeHull( rivets ), paintOut ) );
	g.add( meshOf( loft( T, true ), paintIn ) );
	g.add( meshOf( transom(), paintOut ) );

	// 包边 + 肋条 + 龙骨 + 桨架：铝
	const aluGeos = [ gunwale( 1 ), gunwale( - 1 ) ];
	const ribU = [ 0.16, 0.3, 0.44, 0.58, 0.72, 0.84 ];
	for ( const u of ribU ) {

		aluGeos.push( rib( u ) );
		// 肋条在外壳上的铆钉列
		for ( const side of [ - 1, 1 ] ) for ( let s = 0.06; s < 0.97; s += 0.055 ) {

			const sm = s * NSTRAKE; const k = Math.floor( sm ); const f = sm - k;
			const off = k === 0 ? 0 : LAP * ( 1 - ( s - ( k / NSTRAKE - OV ) ) / ( 1 / NSTRAKE + OV ) );
			if ( f < 0.12 || f > 0.7 ) continue; // 跳过搭接重叠带（那里外层是上一列船板）
			const { p, n } = hullPoint( u, s, side, Math.max( 0, off ) + 0.0005 );
			rivets.push( { p, n } );

		}

	}

	// 龙骨外条（倒角方条沿龙骨线）
	const keelPts = [];
	for ( let i = 0; i <= 40; i ++ ) keelPts.push( section( 0.02 + ( i / 40 ) * 0.97, 0, - 0.012 ) );
	aluGeos.push( new THREE.TubeGeometry( new THREE.CatmullRomCurve3( keelPts ), 80, 0.016, 6, false ) );
	for ( const side of [ - 1, 1 ] ) {

		const p = section( 0.5, side * Math.PI / 2, 0 );
		const fork = new THREE.TorusGeometry( 0.035, 0.007, 6, 12, Math.PI );
		fork.rotateY( Math.PI / 2 );
		fork.translate( p.x, p.y + 0.07, p.z );
		const stem = new THREE.CylinderGeometry( 0.009, 0.009, 0.08, 6 );
		stem.translate( p.x, p.y + 0.035, p.z );
		const plate = box( 0.12, 0.012, 0.05, p.x, p.y + 0.006, p.z, { bevel: 0.004 } );
		aluGeos.push( fork, stem, plate );

	}

	g.add( meshOf( merge( aluGeos ), alu ) );

	// 铆钉：实例化 1cm 半球
	const rg = new THREE.SphereGeometry( 0.0065, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2 );
	const rv = new THREE.InstancedMesh( rg, alu, rivets.length );
	const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), up = new THREE.Vector3( 0, 1, 0 ), one = new THREE.Vector3( 1, 1, 1 );
	rivets.forEach( ( { p, n }, i ) => {

		_q.setFromUnitVectors( up, n );
		rv.setMatrixAt( i, _m.compose( p, _q, one ) );

	} );
	rv.castShadow = false; rv.receiveShadow = true;
	rv.computeBoundingSphere();
	g.add( rv );

	// 座板：4cm 厚倒角木板 + 两端铝角码
	const woodGeos = [];
	const seatGeos = [];
	for ( const u of [ 0.12, 0.5, 0.8 ] ) {

		const y = sheerY( u ) - 0.13;
		const w = halfWidth( u ) - 0.03;
		woodGeos.push( box( 0.22, 0.04, w * 2 - 0.02, ( u - 0.5 ) * L, y + 0.02, 0, { bevel: 0.012 } ) );
		for ( const s of [ - 1, 1 ] ) seatGeos.push( box( 0.2, 0.08, 0.025, ( u - 0.5 ) * L, y - 0.02, s * ( w - 0.03 ), { bevel: 0.006 } ) );
		seatGeos.push( box( 0.03, 0.1, w * 1.6, ( u - 0.5 ) * L, y - 0.06, 0, { bevel: 0.006 } ) );

	}

	g.add( meshOf( merge( seatGeos ), alu ) );
	const seatWood = merge( woodGeos );
	const p = seatWood.attributes.position, uv = seatWood.attributes.uv;
	for ( let i = 0; i < p.count; i ++ ) uv.setXY( i, p.getZ( i ) * 0.9, p.getX( i ) * 0.9 + p.getY( i ) );
	g.add( meshOf( seatWood, wood ) );

	// 舱底积水（约 3cm 深）
	const bilgeY = keelY( 0.4 ) + T + 0.035;
	const bilge = new THREE.Mesh( bilgeShape( bilgeY ), bilgeWater() );
	bilge.receiveShadow = true;
	g.add( bilge );
	// 积水上漂浮的落叶
	if ( leafGeo && leafMat ) {

		const r = mulberry( 99 );
		const lm = [];
		for ( let i = 0; i < 70; i ++ ) {

			const u = 0.08 + r() * 0.6;
			const z = ( r() - 0.5 ) * ( halfWidth( u ) * 0.9 );
			_q.setFromEuler( new THREE.Euler( - Math.PI / 2 + ( r() - 0.5 ) * 0.2, 0, r() * 6.28 ) );
			const s = 0.05 + r() * 0.05;
			lm.push( new THREE.Matrix4().compose( new THREE.Vector3( ( u - 0.5 ) * L, bilgeY + 0.003, z ), _q, new THREE.Vector3( s, s, s ) ) );

		}

		const lf = new THREE.InstancedMesh( leafGeo, leafMat, lm.length );
		lm.forEach( ( m, i ) => lf.setMatrixAt( i, m ) );
		lf.computeBoundingSphere();
		g.add( lf );

	}

	// 船桨：一支躺在座板上，一支搁在右舷桨架上、桨叶探入水中
	const oarGeo = oar();
	const o1 = meshOf( oarGeo, wood );
	o1.position.set( 0.05, sheerY( 0.5 ) - 0.07, - 0.22 );
	o1.rotation.set( 0.08, 0.12, - 0.05 );
	const o2 = meshOf( oarGeo, wood );
	const lock = section( 0.5, Math.PI / 2, 0 );
	o2.position.set( lock.x - 0.12, lock.y + 0.05, lock.z + 0.15 );
	o2.rotation.set( 0, - 1.25, 0.19 ); // 桨叶朝外下方伸入水里
	g.add( o1, o2 );

	// 绳圈（船尾座板前的舱底）、背包（中座）、防水布（船头）
	const rope = meshOf( ropeCoil(), fabric( { tint: 0x6b5a3e, scale: 1, rough: 0.95 } ) );
	rope.position.set( ( 0.25 - 0.5 ) * L, keelY( 0.25 ) + T + 0.03, 0.18 );
	rope.rotation.y = 0.6;
	const pack = meshOf( backpack(), fabric( { tint: 0x3a4030, scale: 1, rough: 0.92 } ) );
	pack.position.set( ( 0.5 - 0.5 ) * L + 0.02, sheerY( 0.5 ) - 0.09, 0.28 );
	pack.rotation.set( - 1.25, 0.4, 0.15 );
	const tarpM = meshOf( tarp(), fabric( { tint: 0x2c3a44, scale: 2, rough: 0.6, side: THREE.DoubleSide } ) );
	tarpM.position.set( ( 0.8 - 0.5 ) * L + 0.05, sheerY( 0.8 ) - 0.08, 0 );
	g.add( rope, pack, tarpM );
	if ( jerrycan ) {

		jerrycan.position.set( ( 0.04 - 0.5 ) * L + 0.25, keelY( 0.1 ) + T + 0.005, - 0.3 );
		jerrycan.rotation.set( 0, 0.4, 0.12 );
		g.add( jerrycan );

	}

	return g;

}

export const BOAT = { L, W, D };
