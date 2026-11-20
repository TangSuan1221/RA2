// 程序化常春藤：沿墙面生长的藤蔓 + 实例化叶片（有体积，不是贴图染绿）
// 算法：在墙面二维坐标 (u 水平, v 竖直) 上从种子点出发做带惯性的随机游走，
//      向上为主、可分叉、可下垂；沿茎每隔几厘米交替生叶，叶片离墙 2~8cm（团块处更远）分层堆叠形成体积。
// 叶片：Canvas 程序化绘制的五裂常春藤叶（albedo + alpha + 叶脉），贴在略带卷曲的网格上；
//      实例色相/明度 ±15% 抖动；背光透射只来自手电（解析计算），手电外的叶子几乎全黑。
import * as THREE from 'three/webgpu';
import {
	vec3, vec4, float, mix, smoothstep, mx_fractal_noise_float, positionWorld, uv, texture, instanceColor, normalWorld, normalize, dot, max,
} from 'three/tsl';
import { flashAt, FL } from './flash.js';

export function mulberry( seed ) {

	let a = seed >>> 0;
	return () => {

		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

// —— 常春藤叶贴图（RGB：叶面明暗与叶脉；A：轮廓）——
let _leafTex = null;
function ivyLeafTexture() {

	if ( _leafTex ) return _leafTex;
	const S = 256;
	const c = document.createElement( 'canvas' );
	c.width = c.height = S;
	const g = c.getContext( '2d' );
	g.clearRect( 0, 0, S, S );
	// 五裂掌状轮廓：极坐标半径函数（主裂片朝上 = 画布上方）
	const lobes = [ [ 90, 1.0, 0.36 ], [ 35, 0.7, 0.3 ], [ 145, 0.7, 0.3 ], [ - 15, 0.48, 0.32 ], [ 195, 0.48, 0.32 ] ];
	const rad = ( a ) => {

		let r = 0.3;
		for ( const [ la, lr, w ] of lobes ) {

			let d = Math.abs( ( ( a - la * Math.PI / 180 ) + Math.PI * 3 ) % ( Math.PI * 2 ) - Math.PI );
			r = Math.max( r, lr * Math.exp( - ( d * d ) / ( w * w ) ) );

		}

		return r;

	};

	const cx = S / 2, cy = S * 0.6, R = S * 0.42;
	g.beginPath();
	for ( let i = 0; i <= 180; i ++ ) {

		const a = i / 180 * Math.PI * 2;
		const r = rad( a ) * R * ( 1 + 0.02 * Math.sin( a * 23 ) );
		const x = cx + Math.cos( a ) * r, y = cy - Math.sin( a ) * r;
		if ( i === 0 ) g.moveTo( x, y ); else g.lineTo( x, y );

	}

	g.closePath();
	// 叶面：中心略亮、边缘暗的径向渐变
	const grd = g.createRadialGradient( cx, cy - R * 0.2, R * 0.05, cx, cy, R * 1.0 );
	grd.addColorStop( 0, '#d8d8d8' );
	grd.addColorStop( 0.6, '#b0b0b0' );
	grd.addColorStop( 1, '#7a7a7a' );
	g.fillStyle = grd;
	g.fill();
	// 边缘描深
	g.lineWidth = 2;
	g.strokeStyle = '#555';
	g.stroke();
	// 叶脉：从叶柄放射到各裂片尖端，浅色
	g.save();
	g.clip();
	g.strokeStyle = 'rgba(245,245,235,0.8)';
	for ( const [ la, lr ] of lobes ) {

		const a = la * Math.PI / 180;
		g.lineWidth = la === 90 ? 3 : 2;
		g.beginPath();
		g.moveTo( cx, cy );
		g.quadraticCurveTo( cx + Math.cos( a ) * R * lr * 0.5, cy - Math.sin( a ) * R * lr * 0.55 - 4, cx + Math.cos( a ) * R * lr * 0.95, cy - Math.sin( a ) * R * lr * 0.95 );
		g.stroke();
		// 次级侧脉
		g.lineWidth = 1;
		for ( let k = 1; k < 4; k ++ ) {

			const t = k / 4;
			const bx = cx + Math.cos( a ) * R * lr * t * 0.9, by = cy - Math.sin( a ) * R * lr * t * 0.9;
			for ( const s of [ - 1, 1 ] ) {

				const a2 = a + s * 0.8;
				g.beginPath();
				g.moveTo( bx, by );
				g.lineTo( bx + Math.cos( a2 ) * R * 0.18 * ( 1 - t * 0.5 ), by - Math.sin( a2 ) * R * 0.18 * ( 1 - t * 0.5 ) );
				g.stroke();

			}

		}

	}

	g.restore();
	// 叶柄
	g.strokeStyle = '#6a6a5a';
	g.lineWidth = 4;
	g.beginPath(); g.moveTo( cx, cy ); g.lineTo( cx, S - 4 ); g.stroke();

	_leafTex = new THREE.CanvasTexture( c );
	_leafTex.colorSpace = THREE.NoColorSpace;
	_leafTex.generateMipmaps = true;
	_leafTex.minFilter = THREE.LinearMipmapLinearFilter;
	_leafTex.anisotropy = 4;
	return _leafTex;

}

// 叶片几何：3×3 细分的卡片，中脉折起、边缘下卷；原点在叶柄根部，叶尖朝 +Y，叶面朝 +Z
function leafGeometry() {

	const g = new THREE.PlaneGeometry( 1, 1, 3, 3 );
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {

		const x = p.getX( i ), y = p.getY( i ) + 0.5; // 0..1
		const z = Math.abs( x ) * 0.22 - x * x * 0.35 + Math.sin( y * Math.PI ) * 0.06 - y * y * 0.08;
		p.setXYZ( i, x, y, z );

	}

	g.computeVertexNormals();
	return g;

}

/**
 * 叶片材质：贴图 alpha 轮廓（alphaToCoverage）、实例色、蜡质高光，手电背光透射
 */
function leafMaterial( { dry = false } = {} ) {

	const m = new THREE.MeshStandardNodeMaterial( { side: THREE.DoubleSide, roughness: 0.5, metalness: 0, alphaTest: 0.5 } );
	m.alphaToCoverage = true;
	const t = texture( ivyLeafTexture(), uv() );
	const n = mx_fractal_noise_float( positionWorld.mul( 1.3 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	// 暗绿去饱和基色（约 0x2b3a1e 的线性值），实例色负责 ±15% 色相/明度抖动
	const baseCol = dry ? vec3( 0.06, 0.045, 0.02 ) : vec3( 0.024, 0.042, 0.013 );
	const col = baseCol.mul( t.r.mul( 2.6 ) ).mul( mix( 0.8, 1.15, n ) );
	m.colorNode = vec4( col, t.a );
	// 叶面偏哑光（只在叶脉/蜡质处略有高光），避免远处叶团变成一片闪烁的白点
	m.roughnessNode = mix( float( 0.55 ), float( 0.9 ), t.r.oneMinus().add( n.mul( 0.3 ) ).clamp() );
	// 透射：wrap 漫反射 + 背光项（手电从叶片背面照过来时透出暗黄绿，正面也有少量次表面散射）
	const L = normalize( FL.pos.sub( positionWorld ) );
	const nl = dot( normalWorld, L );
	const back = max( nl.negate(), 0 ).add( max( nl.add( 0.4 ).div( 1.4 ), 0 ).mul( 0.25 ) );
	m.emissiveNode = flashAt( positionWorld ).mul( back ).mul( 0.3 ).mul( dry ? vec3( 0.06, 0.04, 0.015 ) : vec3( 0.05, 0.075, 0.015 ) ).mul( t.r );
	return m;

}

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _bm = new THREE.Matrix4();
const _q = new THREE.Quaternion();
// 由叶面法线 n 与叶尖方向 t 构造实例矩阵
export function leafMatrix( p, n, t, s ) {

	_z.copy( n ).normalize();
	_y.copy( t ).addScaledVector( _z, - t.dot( _z ) ).normalize();
	_x.crossVectors( _y, _z );
	_bm.makeBasis( _x, _y, _z );
	_q.setFromRotationMatrix( _bm );
	return new THREE.Matrix4().compose( p, _q, new THREE.Vector3( s, s, s ) );

}

// 在单位向量 v 附近随机抖动（最大角 maxA 弧度）
function jitterDir( v, maxA, rng ) {

	const a = ( rng() * 2 - 1 ) * maxA, b = ( rng() * 2 - 1 ) * maxA;
	const t1 = Math.abs( v.y ) < 0.9 ? new THREE.Vector3( 0, 1, 0 ) : new THREE.Vector3( 1, 0, 0 );
	const u = new THREE.Vector3().crossVectors( v, t1 ).normalize();
	const w = new THREE.Vector3().crossVectors( v, u );
	return v.clone().applyAxisAngle( u, a ).applyAxisAngle( w, b ).normalize();

}

/**
 * 在一面墙上生长常春藤。
 * wall: { origin（墙面左下角，世界）, uDir（水平单位向量）, normal（朝房间内）, width, height }
 * opt: seeds: [[u, v], ...]；density(u, v) → 0~1；rng；shade：整体明度
 * out: { leaves: Matrix4[], colors: Color[], stems: Matrix4[] }
 */
export function growIvy( wall, { seeds, density = () => 1, rng, steps = 160, leafScale = 0.085, droop = 0.15, thick = 1, shade = 1, bulge = null, leafRate = 1 }, out ) {

	const { origin, uDir, normal, width, height } = wall;
	const vDir = new THREE.Vector3( 0, 1, 0 );
	const toWorld = ( u, v, d ) => origin.clone().addScaledVector( uDir, u ).addScaledVector( vDir, v ).addScaledVector( normal, d );
	const q = new THREE.Quaternion();
	out.colors ||= [];

	const queue = seeds.map( ( [ u, v ] ) => ( { u, v, ang: Math.PI / 2 + ( rng() - 0.5 ) * 0.6, life: steps, depth: 0 } ) );
	let guard = 0;
	while ( queue.length && guard ++ < 4000 ) {

		const b = queue.pop();
		let { u, v, ang, life } = b;
		const step = 0.045;
		let prev = toWorld( u, v, 0.008 );
		for ( let i = 0; i < life; i ++ ) {

			const dens = density( u, v );
			if ( dens <= 0.02 && rng() < 0.3 ) break;
			const upPull = v > height - 0.3 ? - 0.6 : 0.12;
			ang += ( rng() - 0.5 ) * 0.5 + ( Math.PI / 2 - ang ) * upPull * 0.15;
			if ( rng() < droop * 0.02 ) ang = - Math.PI / 2 + ( rng() - 0.5 ) * 0.5;
			u += Math.cos( ang ) * step;
			v += Math.sin( ang ) * step;
			if ( u < 0.02 || u > width - 0.02 || v < 0 || v > height - 0.02 ) break;
			const cur = toWorld( u, v, 0.008 );

			// 茎：细柱连接相邻两点（贴墙）
			const mid = prev.clone().add( cur ).multiplyScalar( 0.5 );
			const dir = cur.clone().sub( prev );
			const len = dir.length();
			q.setFromUnitVectors( vDir, dir.normalize() );
			out.stems.push( new THREE.Matrix4().compose( mid, q, new THREE.Vector3( 0.005 * thick, len * 1.05, 0.005 * thick ) ) );
			prev = cur;

			// 叶片：密度越高叶子越多、离墙越远（团块体积）
			const nLeaves = rng() < dens ? Math.floor( ( 1 + rng() * ( 1 + dens * 3 ) ) * leafRate ) : 0;
			// 团块隆起：茎从墙面抽出的枝条把叶团撑离墙面（0~bulge 米），形成有体积的轮廓
			const bz = bulge ? bulge( u, v ) : 0;
			for ( let k = 0; k < nLeaves; k ++ ) {

				const side = rng() < 0.5 ? - 1 : 1;
				const off = 0.015 + rng() * 0.05 + bz * 0.3;
				const lu = u + Math.cos( ang + side * Math.PI / 2 ) * off;
				const lv = v + Math.sin( ang + side * Math.PI / 2 ) * off;
				// 叶柄根部离墙 2~8cm，团块处更远
				const depth = 0.02 + rng() * 0.06 + Math.pow( rng(), 2 ) * 0.07 * dens * thick + bz * Math.sqrt( rng() );
				const p = toWorld( lu, lv, depth );
				// 叶面法线：墙法线 ±30° 抖动，略微朝下（叶子在重力下低垂）
				const n = jitterDir( normal.clone().addScaledVector( vDir, - 0.25 ).normalize(), 0.52, rng );
				// 叶尖方向：大致向下/侧向（叶柄朝上、叶片下垂）
				const tAng = - Math.PI / 2 + side * ( 0.4 + rng() * 0.9 );
				const tip = uDir.clone().multiplyScalar( Math.cos( tAng ) ).addScaledVector( vDir, Math.sin( tAng ) * 0.8 + 0.2 );
				const s = leafScale * ( 0.6 + rng() * 0.7 ) * ( 0.85 + dens * 0.3 );
				out.leaves.push( leafMatrix( p.addScaledVector( tip.clone().normalize(), - s * 0.15 ), n, tip, s ) );
				// 实例色：±15% 明度，轻微色相漂移（偏黄/偏蓝绿），少量枯叶
				const vv = ( 0.85 + rng() * 0.3 ) * shade;
				const c = new THREE.Color( 1 + ( rng() - 0.5 ) * 0.3, 1, 1 + ( rng() - 0.5 ) * 0.3 ).multiplyScalar( vv );
				if ( rng() < 0.05 ) c.setRGB( 2.4, 1.3, 1.2 ).multiplyScalar( vv ); // 枯黄老叶
				out.colors.push( c );

			}

			// 分叉
			if ( rng() < 0.035 * ( 0.4 + dens ) && b.depth < 4 && queue.length < 600 ) {

				queue.push( { u, v, ang: ang + ( rng() < 0.5 ? - 1 : 1 ) * ( 0.5 + rng() * 0.8 ), life: Math.floor( life * 0.6 ), depth: b.depth + 1 } );

			}

		}

	}

}

// 由收集到的矩阵生成 InstancedMesh（叶片 + 茎）
export function buildIvyMeshes( out ) {

	const group = new THREE.Group();
	const leafGeo = leafGeometry();
	const leaves = new THREE.InstancedMesh( leafGeo, leafMaterial(), out.leaves.length );
	out.leaves.forEach( ( m, i ) => leaves.setMatrixAt( i, m ) );
	out.leaves.forEach( ( m, i ) => leaves.setColorAt( i, out.colors?.[ i ] || new THREE.Color( 1, 1, 1 ) ) );
	leaves.castShadow = leaves.receiveShadow = true;
	leaves.computeBoundingSphere();
	group.add( leaves );

	if ( out.stems.length ) {

		const stemGeo = new THREE.CylinderGeometry( 1, 1, 1, 4, 1, true );
		const stemMat = new THREE.MeshStandardNodeMaterial( { color: 0x1c160e, roughness: 0.9 } );
		const stems = new THREE.InstancedMesh( stemGeo, stemMat, out.stems.length );
		out.stems.forEach( ( m, i ) => stems.setMatrixAt( i, m ) );
		stems.castShadow = false; stems.receiveShadow = true;
		stems.computeBoundingSphere();
		group.add( stems );

	}

	return group;

}

export { leafGeometry, leafMaterial, instanceColor };
