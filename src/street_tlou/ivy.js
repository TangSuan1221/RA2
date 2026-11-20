// 常春藤：沿立面"表面行走"生长的藤蔓 + 沿藤蔓实例化的叶簇卡片（体积感来自多层离墙偏移）
// 生长规则（每面墙在 2D 墙面坐标 (u, h) 中模拟，再映射回世界）：
//   1. 种子：墙根（成簇）、窗台（向下垂挂 + 向上攀爬）、落水管（竖直一线）、屋檐（向下垂帘）
//   2. 每步 8cm：方向 = 上一步方向 + 重力/向上倾向 + 随机游走 + 窗台/腰线吸引（遇到水平线条沿其横走）
//   3. 避开窗洞（进入窗洞的概率很低，进入后改为垂挂越过）；沿途按概率分叉
//   4. 叶簇沿藤蔓分布：离根越近越厚（离墙偏移更大、层数更多）；颜色按层深压暗（自遮蔽），外层偏亮偏黄
//   5. 覆盖率：每面墙光栅化到 0.25m 网格统计，目标 40–70%（不足则补种，超出则停止生长）
import * as THREE from 'three/webgpu';
import { float, vec3, mix, smoothstep, positionWorld, normalWorld, instanceIndex, hash, uv, texture, cameraPosition, max, dot, normalize, abs, sin, time, positionLocal } from 'three/tsl';
import { rng, fbm, smooth } from './noise.js';
import { makeIvyTexture } from './textures.js';
import { SHADOW_LAYER } from './atmosphere.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3( 0, 1, 0 ), _n = new THREE.Vector3(), _basis = new THREE.Matrix4(), _e = new THREE.Euler();

export const ivyStats = { walls: [] };

export class IvySystem {

	constructor() {

		this.mats = []; this.cols = []; this.stems = [];

	}

	/**
	 * 在一面墙上生长常春藤
	 * @param {number[]} o 墙左下角 [x, y, z]
	 * @param {number[]} t 沿墙水平方向（单位向量）
	 * @param {number[]} n 墙外法线
	 * @param {number} width 墙宽
	 * @param {number} height 墙高
	 * @param {object} opt cover：目标覆盖率；seed；openings：[{u0,u1,h0,h1}] 窗洞；ledges：[h] 水平线脚高度；pipes：[u] 落水管位置
	 */
	addWall( o, t, n, width, height, { cover = 0.55, seed = 1, openings = [], ledges = [], pipes = [], hang = 1, climb = 1, density = 1, y0 = 0, name = '' } = {} ) {

		const r = rng( seed * 7919 + 13 );
		const CELL = 0.25;
		const gw = Math.max( 1, Math.ceil( width / CELL ) ), gh = Math.max( 1, Math.ceil( height / CELL ) );
		const grid = new Uint8Array( gw * gh );
		let filled = 0;
		const target = cover * gw * gh;
		const inOpen = ( u, h ) => openings.some( ( w ) => u > w.u0 && u < w.u1 && h > w.h0 && h < w.h1 );
		const gu0 = o[ 0 ] * t[ 0 ] + o[ 2 ] * t[ 2 ]; // 世界中的墙面 u 偏移（噪声连续）

		// 覆盖倾向场（低频）：决定藤蔓更愿意往哪长，形成大块覆盖 + 裸墙空档
		const want = ( u, h ) => {

			const a = fbm( ( gu0 + u ) * 0.09, h * 0.07, 3, seed + 3 );
			const climbH = height * ( Math.pow( fbm( ( gu0 + u ) * 0.045, seed * 0.37, 3, seed ), 1.6 ) * 1.9 ) * climb;
			const fromBottom = 1 - smooth( climbH - 2, climbH + 1.5, h );
			const hangL = height * Math.max( 0, fbm( ( gu0 + u ) * 0.07, 9.1, 3, seed + 5 ) * 1.6 - 0.45 ) * hang;
			const fromTop = smooth( height - hangL - 1.5, height - hangL + 1, h );
			return Math.max( fromBottom, fromTop ) * ( 0.45 + a * 0.9 );

		};

		const leaf = ( u, h, depth, k, big ) => {

			const nOff = 0.03 + depth * ( 0.08 + r() * 0.28 ) + k * 0.06;
			_p.set( o[ 0 ] + t[ 0 ] * u + n[ 0 ] * nOff, o[ 1 ] + h, o[ 2 ] + t[ 2 ] * u + n[ 2 ] * nOff );
			_q.setFromRotationMatrix( _basis );
			// 叶面大致贴墙，向外上方翻起；外层翻起更多
			_q2.setFromEuler( _e.set( - ( 0.25 + r() * 0.65 ) * ( 0.6 + depth * 0.8 ), ( r() - 0.5 ) * 0.7, r() * Math.PI * 2, 'XZY' ) );
			_q.multiply( _q2 );
			const s = ( 0.32 + r() * 0.3 ) * ( 0.75 + depth * 0.55 ) * big;
			_s.set( s, s, s );
			this.mats.push( _m.compose( _p, _q, _s ).clone() );
			// 颜色：内层深（自遮蔽），外层亮；沿墙低频色相变化；少量偏黄/偏红的老叶
			const hueN = fbm( ( gu0 + u ) * 0.15, h * 0.15, 2, seed + 17 );
			const v = ( 0.38 + r() * 0.3 ) * ( 0.55 + depth * 0.6 ) * ( 0.9 + 0.2 * h / Math.max( height, 1 ) );
			const yel = r() < 0.06 ? 1.35 : 1;
			const hv = 0.85 + hueN * 0.3;
			this.cols.push( new THREE.Color( v * yel * 0.88 * hv, v, v * 0.78 / hv ) );
			const gi = Math.min( gw - 1, Math.max( 0, Math.floor( u / CELL ) ) ), gj = Math.min( gh - 1, Math.max( 0, Math.floor( h / CELL ) ) );
			if ( ! grid[ gj * gw + gi ] ) { grid[ gj * gw + gi ] = 1; filled ++; }

		};

		_x.set( ...t ); _n.set( ...n );
		_basis.makeBasis( _x, _y, _n );
		const stems = this.stems;

		// 一根藤蔓的表面行走
		const walk = ( u, h, du, dh, gravity, life, gen ) => {

			let age = 0;
			let ledgeRun = 0;
			const pts = [];
			while ( life -- > 0 && filled < target * 1.12 ) {

				// 方向更新
				du += ( r() - 0.5 ) * 0.5; dh += gravity * 0.25 + ( r() - 0.5 ) * 0.25;
				// 线脚吸引：接近水平线脚时沿其横走一段
				if ( ledgeRun <= 0 ) for ( const lh of ledges ) if ( Math.abs( h - lh ) < 0.12 && r() < 0.08 ) { ledgeRun = 6 + r() * 20; du = r() < 0.5 ? - 1 : 1; }
				if ( ledgeRun > 0 ) { ledgeRun --; dh *= 0.2; h += ( ( ledges.find( ( lh ) => Math.abs( h - lh ) < 0.3 ) ?? h ) - h ) * 0.3; }
				const l = Math.hypot( du, dh ) || 1; du /= l; dh /= l;
				const nu = u + du * 0.08, nh = h + dh * 0.08;
				if ( nu < 0.05 || nu > width - 0.05 || nh < y0 || nh > height + 0.15 ) break;
				// 窗洞：大多绕开（反向横走），少量直接越过
				if ( inOpen( nu, nh ) && r() < 0.85 ) { du = - du + ( r() - 0.5 ); dh *= 0.3; continue; }
				u = nu; h = nh; age ++;
				const w = want( u, h );
				if ( w < 0.42 && r() < 0.2 ) break; // 走出倾向区：枯止
				// 叶簇
				if ( age % 2 === 0 ) {

					const depth = Math.min( 1, w * 0.9 * ( gen === 0 ? 1 : 0.75 ) * ( 0.6 + 0.4 * Math.min( 1, age / 25 ) ) );
					const layers = depth > 0.62 ? 2 + ( r() < 0.4 ? 1 : 0 ) : 1;
					for ( let k = 0; k < layers; k ++ ) leaf( u + ( r() - 0.5 ) * 0.28, h + ( r() - 0.5 ) * 0.22, depth * ( 0.7 + 0.3 * r() ), k, inOpen( u, h ) ? 0.75 : 1 );

				}

				if ( age % 6 === 0 ) pts.push( u, h );
				// 分叉
				if ( gen < 3 && r() < 0.035 ) walk( u, h, ( r() < 0.5 ? - 1 : 1 ) * ( 0.6 + r() * 0.4 ), dh * 0.5, gravity * ( r() < 0.3 ? - 1 : 1 ), life * 0.6, gen + 1 );

			}

			if ( pts.length > 6 ) stems.push( { o, t, n, pts } );

		};

		// —— 种子 ——
		const seeds = [];
		// 墙根：成簇，间距 0.3–0.9m
		for ( let u = 0.2; u < width; u += 0.3 + r() * 0.6 ) if ( want( u, 0.5 ) > 0.55 ) seeds.push( [ u, y0 + 0.05, 0, 1, 0.55, 260 ] );
		// 落水管：竖直上爬
		for ( const pu of pipes ) seeds.push( [ pu, y0 + 0.05, 0, 1, 1.4, 500 ] );
		// 窗台：向下垂挂、向上攀爬
		for ( const w of openings ) if ( r() < 0.35 * cover / 0.55 && want( ( w.u0 + w.u1 ) / 2, w.h0 ) > 0.5 ) {

			seeds.push( [ w.u0 + r() * ( w.u1 - w.u0 ), w.h0 - 0.05, 0, - 1, - 1.0, 90 ] );
			if ( r() < 0.5 ) seeds.push( [ w.u0 - 0.1, w.h0, 0, 1, 0.8, 120 ] );

		}

		// 屋檐：垂帘
		for ( let u = 0.2; u < width; u += 0.25 + r() * 0.5 ) if ( want( u, height - 0.3 ) > 0.6 ) seeds.push( [ u, height - 0.05, 0, - 1, - 1.2, 50 + r() * 140 ] );
		// 打乱顺序，均匀推进覆盖
		for ( let i = seeds.length - 1; i > 0; i -- ) { const j = Math.floor( r() * ( i + 1 ) ); [ seeds[ i ], seeds[ j ] ] = [ seeds[ j ], seeds[ i ] ]; }
		for ( const s of seeds ) { if ( filled >= target ) break; walk( s[ 0 ], s[ 1 ], s[ 2 ], s[ 3 ], s[ 4 ], s[ 5 ] * density, 0 ); }
		// 补种：覆盖不足时从已覆盖区边缘再长
		let guard = 0;
		while ( filled < target * 0.92 && guard ++ < 400 ) {

			const u = r() * width, h = y0 + r() * ( height - y0 );
			if ( want( u, h ) < 0.6 ) continue;
			walk( u, h, ( r() - 0.5 ), r() < 0.5 ? 1 : - 1, r() < 0.5 ? 0.6 : - 1, 120 * density, 1 );

		}

		ivyStats.walls.push( { name, cover: + ( filled / ( gw * gh ) ).toFixed( 2 ), target: cover } );

	}

	// 地面/墙根的藤蔓堆（灌木状）
	addMound( x, y, z, radius, count, seed = 1 ) {

		const r = rng( seed * 31 + 7 );
		for ( let i = 0; i < count; i ++ ) {

			const a = r() * Math.PI * 2, d = Math.sqrt( r() ) * radius;
			const hgt = ( 1 - d / radius ) * radius * 0.55 * ( 0.4 + 0.6 * r() );
			_p.set( x + Math.cos( a ) * d, y + hgt + 0.04, z + Math.sin( a ) * d );
			_q.setFromEuler( _e.set( - Math.PI / 2 + ( r() - 0.5 ) * 1.6, r() * 6.28, ( r() - 0.5 ) * 1.4, 'YXZ' ) );
			const s = 0.35 + r() * 0.35;
			_s.set( s, s, s );
			this.mats.push( _m.compose( _p, _q, _s ).clone() );
			const v = ( 0.35 + r() * 0.35 ) * ( 0.6 + 0.5 * hgt / Math.max( radius * 0.55, 0.01 ) );
			this.cols.push( new THREE.Color( v * 0.9, v, v * 0.76 ) );

		}

	}

	build() {

		const { map: tex, alphaMap } = makeIvyTexture();
		const geo = new THREE.PlaneGeometry( 0.8, 0.8 );
		const mat = new THREE.MeshPhysicalNodeMaterial( { map: tex, alphaMap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0, specularIntensity: 0.4 } );
		// 透光：背光侧（视线与天空同侧）叶片透出黄绿；湿叶镜面高光由低粗糙度给出
		const ndv = abs( dot( normalWorld, normalize( cameraPosition.sub( positionWorld ) ) ) );
		mat.emissiveNode = texture( tex ).rgb.mul( vec3( 0.55, 0.75, 0.25 ) ).mul( float( 1 ).sub( ndv ).mul( 0.06 ).add( 0.015 ) );
		// 微风：叶片外缘轻摆

		const meshes = new THREE.Group();
		const n = this.mats.length;
		// 每个图集格一个 InstancedMesh（UV 偏移烘进几何体），共 4 次绘制
		for ( let q = 0; q < 4; q ++ ) {

			const g = geo.clone();
			const uvA = g.attributes.uv;
			for ( let i = 0; i < uvA.count; i ++ ) uvA.setXY( i, ( q % 2 ) * 0.5 + uvA.getX( i ) * 0.5, 1 - ( Math.floor( q / 2 ) * 0.5 ) - ( 1 - uvA.getY( i ) ) * 0.5 );
			const ids = [];
			for ( let i = q; i < n; i += 4 ) ids.push( i );
			if ( ! ids.length ) continue;
			const im = new THREE.InstancedMesh( g, mat, ids.length );
			ids.forEach( ( id, j ) => { im.setMatrixAt( j, this.mats[ id ] ); im.setColorAt( j, this.cols[ id ] ); } );
			im.castShadow = false; im.receiveShadow = true;
			im.computeBoundingSphere();
			meshes.add( im );

		}

		// 主茎：叶簇稀疏处可见的深褐色藤（细四边形条带，贴墙）
		const pos = [], idx = [];
		for ( const { o, t, n: nn, pts } of this.stems ) {

			const base = pos.length / 3;
			for ( let i = 0; i < pts.length; i += 2 ) {

				const u = pts[ i ], h = pts[ i + 1 ];
				const w = 0.012 + 0.01 * ( 1 - i / pts.length );
				for ( const s of [ - 1, 1 ] ) pos.push( o[ 0 ] + t[ 0 ] * ( u + s * w ) + nn[ 0 ] * 0.02, o[ 1 ] + h, o[ 2 ] + t[ 2 ] * ( u + s * w ) + nn[ 2 ] * 0.02 );

			}

			for ( let k = 0; k < pts.length / 2 - 1; k ++ ) { const a = base + k * 2; idx.push( a, a + 1, a + 2, a + 1, a + 3, a + 2 ); }

		}

		if ( pos.length ) {

			const sg = new THREE.BufferGeometry();
			sg.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
			sg.setIndex( idx );
			sg.computeVertexNormals();
			const sm = new THREE.Mesh( sg, new THREE.MeshStandardNodeMaterial( { color: 0x1d1810, roughness: 0.9, side: THREE.DoubleSide } ) );
			meshes.add( sm );

		}

		meshes.userData.count = n;
		return meshes;

	}

}
