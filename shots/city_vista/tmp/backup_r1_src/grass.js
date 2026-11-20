// 城市远景：实例化野草（带风）
//   · 每个实例是一簇 N 片草叶（真实几何，叶片弯曲、由宽到尖），
//   · 密度随离机位距离递减，草簇尺寸相应放大以保持覆盖率（远处少而大，近处多而细）
//   · 法线向上偏折（草地整体受光像一块柔软的表面，而不是一片片纸）
//   · 风：世界空间低频噪声驱动的弯曲 + 高频抖动，叶尖位移最大
import * as THREE from 'three/webgpu';
import {
	Fn, uniform, float, vec2, vec3, vec4, mix, smoothstep, uv, attribute, positionLocal, positionWorld,
	mx_noise_float, time, sin, transformNormalToView, normalize, instanceColor, max, dot, pow, varying, cameraPosition, length,
} from 'three/tsl';
import { rng, fbm2 } from './util.js';
import { fieldAt } from './layout.js';
import { terrainH } from './ground.js';
import { air } from './atmos.js';

export const grassLook = {
	base: uniform( new THREE.Color( 0.012, 0.022, 0.004 ) ),
	mid: uniform( new THREE.Color( 0.035, 0.065, 0.016 ) ),
	tip: uniform( new THREE.Color( 0.085, 0.14, 0.05 ) ),
	dry: uniform( new THREE.Color( 0.15, 0.135, 0.065 ) ),
	wind: uniform( 0.35 ),
	translucency: uniform( 0.55 ),
};

// 一簇草的几何：blades 片叶子，每片 SEG 段；uv.y = 叶片高度参数，uv.x = 横向
function clumpGeometry( blades, seed, { h = 1, spread = 0.22 } = {} ) {

	const r = rng( seed );
	const SEG = 4;
	const pos = [], nor = [], uvs = [], idx = [], rnd = [];
	for ( let b = 0; b < blades; b ++ ) {

		const ang = r() * Math.PI * 2;
		const rad = Math.sqrt( r() ) * spread;
		const ox = Math.cos( ang ) * rad, oz = Math.sin( ang ) * rad;
		const face = r() * Math.PI * 2; // 叶片朝向
		const fx = Math.cos( face ), fz = Math.sin( face );
		const bh = h * ( 0.5 + r() * 0.8 );
		const bw = 0.02 + r() * 0.026;
		const lean = ( 0.15 + r() * 0.45 ) * bh; // 向外倾斜/下垂
		const lx = Math.cos( ang + ( r() - 0.5 ) ), lz = Math.sin( ang + ( r() - 0.5 ) );
		const seedV = r();
		const base = pos.length / 3;
		for ( let s = 0; s <= SEG; s ++ ) {

			const t = s / SEG;
			const w = bw * ( 1 - Math.pow( t, 1.4 ) ) + 0.0015;
			const bend = lean * t * t;
			const cx = ox + lx * bend, cz = oz + lz * bend, cy = bh * t * ( 1 - 0.18 * t * ( lean / bh ) );
			// 叶片横向沿 face 方向
			const px = - fz * w, pz = fx * w;
			pos.push( cx - px, cy, cz - pz, cx + px, cy, cz + pz );
			// 法线：叶面法线与竖直方向混合
			const n = new THREE.Vector3( fx * 0.45 + lx * 0.2, 1.0, fz * 0.45 + lz * 0.2 ).normalize();
			nor.push( n.x, n.y, n.z, n.x, n.y, n.z );
			uvs.push( 0, t, 1, t );
			rnd.push( seedV, seedV );

		}

		for ( let s = 0; s < SEG; s ++ ) {

			const a = base + s * 2;
			idx.push( a, a + 1, a + 2, a + 1, a + 3, a + 2 );

		}

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'normal', new THREE.Float32BufferAttribute( nor, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setAttribute( 'bladeRnd', new THREE.Float32BufferAttribute( rnd, 1 ) );
	g.setIndex( idx );
	g.computeBoundingSphere();
	return g;

}

function grassMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.75, metalness: 0, side: THREE.DoubleSide } );
	const t = uv().y;
	const br = attribute( 'bladeRnd', 'float' );
	// 风：世界坐标低频噪声（阵风）+ 每片叶子相位不同的抖动
	const wp = positionLocal; // 实例化后已在世界空间（网格本身为单位矩阵）
	const gust = mx_noise_float( vec3( wp.x.mul( 0.06 ).add( time.mul( 0.35 ) ), wp.z.mul( 0.06 ), time.mul( 0.1 ) ) ).mul( 0.5 ).add( 0.5 );
	const flutter = sin( time.mul( 2.3 ).add( br.mul( 30 ) ).add( wp.x.mul( 0.7 ) ) ).mul( 0.25 );
	const amp = grassLook.wind.mul( t.mul( t ) ).mul( gust.add( 0.2 ).add( flutter ) );
	m.positionNode = positionLocal.add( vec3( amp.mul( 0.8 ), amp.mul( - 0.25 ), amp.mul( 0.35 ) ) );

	// 颜色：根部深、尖部浅，部分叶子枯黄；实例色控制每簇色相
	const dryK = smoothstep( 0.72, 0.95, br ).mul( 0.8 );
	const grad = mix( mix( vec3( grassLook.base ), vec3( grassLook.mid ), smoothstep( 0.0, 0.45, t ) ), vec3( grassLook.tip ), smoothstep( 0.4, 1.0, t ) );
	const col = mix( grad, vec3( grassLook.dry ).mul( mix( float( 0.4 ), float( 1.0 ), t ) ), dryK );
	m.colorNode = vec4( col, 1 );
	// 法线不随背面翻转（否则背面草叶发黑）
	m.normalNode = transformNormalToView( attribute( 'normal', 'vec3' ) ).normalize();
	// 逆光透射：背对太阳观看时叶尖发亮
	const viewDir = normalize( positionWorld.sub( cameraPosition ) );
	const back = pow( max( dot( viewDir, vec3( air.sunDir ).negate() ), 0 ), 3 ).add( 0.15 );
	m.emissiveNode = col.mul( vec3( 1.0, 0.95, 0.7 ) ).mul( back.mul( grassLook.translucency ).mul( t ) ).mul( 0.9 );
	// 地面接缝：根部再压暗模拟自遮蔽
	m.aoNode = mix( float( 0.35 ), float( 1 ), smoothstep( 0.0, 0.6, t ) );
	void instanceColor; void varying; void length; void vec2;
	return m;

}

/**
 * 在公园范围内撒草。
 * @param {object} opt camPos: 主机位 xz；exclude(x,z) 返回 true 时不长草
 */
export function buildGrass( { camPos = [ 0, 4 ], exclude = () => false, extra = null } = {} ) {

	const group = new THREE.Group();
	const mat = grassMaterial();
	const r = rng( 2024 );
	// 三个距离层：近（细密）/ 中 / 远（稀疏大簇）
	const tiers = [
		{ geo: clumpGeometry( 20, 11, { h: 1.25, spread: 0.26 } ), d0: 0, d1: 34, cell: 0.44 },
		{ geo: clumpGeometry( 26, 12, { h: 1.6, spread: 0.5 } ), d0: 34, d1: 85, cell: 0.8 },
		{ geo: clumpGeometry( 26, 13, { h: 1.7, spread: 0.95 } ), d0: 85, d1: 170, cell: 1.6 },
	];
	const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
	const C = new THREE.Color();
	let total = 0;
	for ( const tier of tiers ) {

		const mats = [], cols = [];
		const X = tier.d1 * 1.05;
		for ( let z = camPos[ 1 ] - tier.d1; z < camPos[ 1 ]; z += tier.cell ) {

			for ( let x = camPos[ 0 ] - X; x < camPos[ 0 ] + X; x += tier.cell ) {

				const px = x + ( r() - 0.5 ) * tier.cell * 1.1, pz = z + ( r() - 0.5 ) * tier.cell * 1.1;
				const d = Math.hypot( px - camPos[ 0 ], ( pz - camPos[ 1 ] ) );
				if ( d < tier.d0 || d > tier.d1 ) continue;
				// 只在镜头前方 ±62° 扇形 + 俯视区域内摆放
				const ang = Math.atan2( px - camPos[ 0 ], camPos[ 1 ] - pz );
				const inTop = px > - 38 && px < 38 && pz > - 75 && pz < - 4;
				if ( Math.abs( ang ) > 1.08 && ! inTop ) continue;
				if ( exclude( px, pz ) ) continue;
				const f = fieldAt( px, pz );
				// 草的出现概率：小径/道路/泥地处稀疏
				let pr = ( 0.35 + 0.65 * f.lush ) * ( 1 - f.path * 0.85 ) * ( 1 - f.road * 0.8 ) * ( 1 - f.dirt * 0.75 );
				if ( r() > pr ) continue;
				const s = ( 0.65 + r() * 0.6 ) * ( 0.7 + f.lush * 0.65 ) * ( 1 - f.path * 0.5 );
				P.set( px, terrainH( px, pz ) - 0.04, pz );
				Q.setFromEuler( E.set( ( r() - 0.5 ) * 0.15, r() * 6.28, ( r() - 0.5 ) * 0.15 ) );
				S.set( s, s * ( 0.85 + r() * 0.4 ), s );
				mats.push( M4.compose( P, Q, S ).clone() );
				// 每簇色相亮度轻微变化（大尺度斑块 + 随机）
				const patch = fbm2( px * 0.05 + 3, pz * 0.05, 3 );
				const shade = 0.45 + 0.8 * fbm2( px * 0.09 - 7, pz * 0.09 + 2, 3 ); // 草浪深浅
				C.setRGB( ( 0.8 + patch * 0.45 + r() * 0.1 ) * shade, ( 0.9 + patch * 0.2 + r() * 0.1 ) * shade, ( 0.7 + r() * 0.15 ) * shade );
				cols.push( C.clone() );

			}

		}

		// 额外的生长面（例如高台上的草丛）：extra(r) 返回 [{x,y,z,s}]，只放进近景层
		if ( extra && tier === tiers[ 0 ] ) for ( const e of extra( r ) ) {

			Q.setFromEuler( E.set( ( r() - 0.5 ) * 0.2, r() * 6.28, ( r() - 0.5 ) * 0.2 ) );
			S.set( e.s, e.s * ( 0.8 + r() * 0.4 ), e.s );
			mats.push( M4.compose( P.set( e.x, e.y, e.z ), Q, S ).clone() );
			cols.push( C.setRGB( 0.8 + r() * 0.3, 0.85 + r() * 0.2, 0.7 + r() * 0.2 ).clone() );

		}

		const mesh = new THREE.InstancedMesh( tier.geo, mat, mats.length );
		mats.forEach( ( m, i ) => mesh.setMatrixAt( i, m ) );
		cols.forEach( ( c, i ) => mesh.setColorAt( i, c ) );
		mesh.castShadow = false;
		mesh.receiveShadow = true;
		mesh.frustumCulled = false;
		mesh.name = 'grass';
		group.add( mesh );
		total += mats.length * tier.geo.index.count / 3;

	}

	group.userData.triangles = total;
	return group;

}
