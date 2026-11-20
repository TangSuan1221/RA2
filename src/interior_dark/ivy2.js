// 程序化常春藤 v2（第四轮重建）：先长“茎”，叶子只长在茎节上 → 叶团天然聚集在茎周围，茎之间露出墙面
// 1) 墙面攀爬茎：从墙根水线/门框/裂缝出发，带惯性的随机游走 + 朝高密度区转向 + 分叉；茎是粗细渐变的管（木质主茎 1~2cm）
// 2) 茎节生叶：叶柄把叶片撑离墙面 2~15cm；叶面法线 = 墙法线向上/侧向倾斜 20~40°；叶尖朝下（重力）
// 3) 外伸枝：成熟常春藤的非攀援枝从墙面伸出 15~50cm 后下垂，提供轮廓剪影与体积
// 4) 垂帘：从吊顶边缘/门楣/塌落处垂下的藤条
// 叶片：2×2 图集（五裂 / 三裂幼叶 / 心形成叶 / 宽五裂），每实例随机取一格；色相/明度/尺寸抖动；离墙越近越暗（墙面 AO）
import * as THREE from 'three/webgpu';
import {
	vec2, vec3, vec4, float, mix, smoothstep, mx_fractal_noise_float, positionWorld, uv, texture, normalWorld, normalize, dot, max,
	hash, instanceIndex, floor,
} from 'three/tsl';
import { flashAt, FL } from './flash.js';

// —— 叶片图集 ——
let _atlas = null;
function leafAtlas() {

	if ( _atlas ) return _atlas;
	const S = 512, C = 256;
	const c = document.createElement( 'canvas' );
	c.width = c.height = S;
	const g = c.getContext( '2d' );
	g.clearRect( 0, 0, S, S );
	// 每格：[裂片表(角度°, 长度, 宽度), 叶面亮度, 基础半径]
	const kinds = [
		[ [ [ 90, 1.0, 0.36 ], [ 35, 0.7, 0.3 ], [ 145, 0.7, 0.3 ], [ - 15, 0.48, 0.32 ], [ 195, 0.48, 0.32 ] ], 1.0, 0.3 ], // 五裂
		[ [ [ 90, 1.0, 0.42 ], [ 25, 0.62, 0.36 ], [ 155, 0.62, 0.36 ] ], 1.08, 0.32 ], // 三裂幼叶
		[ [ [ 90, 1.0, 0.75 ], [ 20, 0.62, 0.6 ], [ 160, 0.62, 0.6 ], [ - 30, 0.42, 0.5 ], [ 210, 0.42, 0.5 ] ], 0.88, 0.42 ], // 心形成叶
		[ [ [ 90, 0.92, 0.42 ], [ 40, 0.8, 0.36 ], [ 140, 0.8, 0.36 ], [ - 10, 0.55, 0.36 ], [ 190, 0.55, 0.36 ] ], 0.95, 0.34 ], // 宽五裂
	];
	kinds.forEach( ( [ lobes, bright, r0 ], k ) => {

		const ox = ( k % 2 ) * C, oy = Math.floor( k / 2 ) * C;
		const rad = ( a ) => {

			let r = r0;
			for ( const [ la, lr, w ] of lobes ) {

				const d = Math.abs( ( ( a - la * Math.PI / 180 ) + Math.PI * 3 ) % ( Math.PI * 2 ) - Math.PI );
				r = Math.max( r, lr * Math.exp( - ( d * d ) / ( w * w ) ) );

			}

			return r;

		};

		const cx = ox + C / 2, cy = oy + C * 0.6, R = C * 0.4;
		g.save();
		g.beginPath();
		for ( let i = 0; i <= 200; i ++ ) {

			const a = i / 200 * Math.PI * 2;
			const r = rad( a ) * R * ( 1 + 0.025 * Math.sin( a * 19 + k ) );
			const x = cx + Math.cos( a ) * r, y = cy - Math.sin( a ) * r;
			if ( i === 0 ) g.moveTo( x, y ); else g.lineTo( x, y );

		}

		g.closePath();
		const b = Math.round( 215 * bright );
		const grd = g.createRadialGradient( cx, cy - R * 0.25, R * 0.05, cx, cy, R );
		grd.addColorStop( 0, `rgb(${b},${b},${b})` );
		grd.addColorStop( 0.65, `rgb(${b * 0.8 | 0},${b * 0.8 | 0},${b * 0.8 | 0})` );
		grd.addColorStop( 1, `rgb(${b * 0.55 | 0},${b * 0.55 | 0},${b * 0.55 | 0})` );
		g.fillStyle = grd;
		g.fill();
		g.lineWidth = 2;
		g.strokeStyle = '#4c4c4c';
		g.stroke();
		g.clip();
		// 叶脉（浅色）
		g.strokeStyle = 'rgba(240,240,225,0.7)';
		for ( const [ la, lr ] of lobes ) {

			const a = la * Math.PI / 180;
			g.lineWidth = la === 90 ? 2.6 : 1.8;
			g.beginPath();
			g.moveTo( cx, cy );
			g.quadraticCurveTo( cx + Math.cos( a ) * R * lr * 0.5, cy - Math.sin( a ) * R * lr * 0.55 - 3, cx + Math.cos( a ) * R * lr * 0.92, cy - Math.sin( a ) * R * lr * 0.92 );
			g.stroke();

		}

		// 斑驳（霉点、虫洞阴影）
		for ( let i = 0; i < 14; i ++ ) {

			const a = ( i * 2.399 + k ) % ( Math.PI * 2 ), rr = R * 0.6 * ( ( i * 0.37 + k * 0.13 ) % 1 );
			g.fillStyle = `rgba(40,40,30,${0.12 + ( i % 3 ) * 0.05})`;
			g.beginPath(); g.arc( cx + Math.cos( a ) * rr, cy - Math.sin( a ) * rr, 2 + ( i % 4 ) * 2, 0, 7 ); g.fill();

		}

		g.restore();
		// 叶柄
		g.strokeStyle = '#5e5e50';
		g.lineWidth = 3;
		g.beginPath(); g.moveTo( cx, cy ); g.lineTo( cx, oy + C - 6 ); g.stroke();

	} );

	_atlas = new THREE.CanvasTexture( c );
	_atlas.colorSpace = THREE.NoColorSpace;
	_atlas.generateMipmaps = true;
	_atlas.minFilter = THREE.LinearMipmapLinearFilter;
	_atlas.anisotropy = 4;
	return _atlas;

}

// 叶片几何：中脉折起、边缘下卷、叶尖略垂；原点在叶柄根部，叶尖朝 +Y，叶面朝 +Z
function leafGeo() {

	const g = new THREE.PlaneGeometry( 1, 1, 3, 3 );
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {

		const x = p.getX( i ), y = p.getY( i ) + 0.5;
		p.setXYZ( i, x, y, Math.abs( x ) * 0.25 - x * x * 0.4 + Math.sin( y * Math.PI ) * 0.07 - y * y * 0.12 );

	}

	g.computeVertexNormals();
	return g;

}

function leafMat() {

	const m = new THREE.MeshStandardNodeMaterial( { side: THREE.DoubleSide, roughness: 0.55, metalness: 0, alphaTest: 0.5 } );
	m.alphaToCoverage = true;
	const v = floor( hash( instanceIndex.add( 11 ) ).mul( 4 ) );
	const off = vec2( v.mod( 2 ).mul( 0.5 ), floor( v.div( 2 ) ).mul( 0.5 ) );
	const t = texture( leafAtlas(), uv().mul( 0.5 ).add( off ) );
	const n = mx_fractal_noise_float( positionWorld.mul( 1.3 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	// 暗绿去饱和（实例色负责色相、明度与墙面 AO）
	const col = vec3( 0.026, 0.044, 0.014 ).mul( t.r.mul( 2.6 ) ).mul( mix( 0.8, 1.15, n ) );
	m.colorNode = vec4( col, t.a );
	m.roughnessNode = mix( float( 0.42 ), float( 0.85 ), t.r.oneMinus().add( n.mul( 0.3 ) ).clamp() );
	// 薄片透射：手电从叶背照过来时透出暗黄绿（≈0.3 透射）
	const L = normalize( FL.pos.sub( positionWorld ) );
	const nl = dot( normalWorld, L );
	const back = max( nl.negate(), 0 ).mul( 0.3 ).add( max( nl.add( 0.4 ).div( 1.4 ), 0 ).mul( 0.06 ) );
	m.emissiveNode = flashAt( positionWorld ).mul( back ).mul( vec3( 0.06, 0.085, 0.02 ) ).mul( t.r );
	return m;

}

function stemMat() {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.85, metalness: 0 } );
	const n = mx_fractal_noise_float( positionWorld.mul( 14 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	// 木质茎：深褐带灰，粗茎上有气生根的毛糙感（噪声明暗）
	m.colorNode = mix( vec3( 0.035, 0.026, 0.017 ), vec3( 0.07, 0.06, 0.045 ), n );
	return m;

}

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
function leafMatrix( p, n, tip, s ) {

	_z.copy( n ).normalize();
	_y.copy( tip ).addScaledVector( _z, - tip.dot( _z ) );
	if ( _y.lengthSq() < 1e-6 ) _y.set( 0, - 1, 0 ).addScaledVector( _z, _z.y );
	_y.normalize();
	_x.crossVectors( _y, _z );
	_m.makeBasis( _x, _y, _z );
	_q.setFromRotationMatrix( _m );
	return new THREE.Matrix4().compose( p, _q, new THREE.Vector3( s, s, s ) );

}

export class Ivy {

	constructor( rng ) {

		this.rng = rng;
		this.leaves = [];
		this.colors = [];
		this.tubes = []; // { pts: Vector3[], rs: number[] }

	}

	// 一片叶子：pos 叶柄根；wallN 墙法线（或局部“外侧”方向）；depth 离墙距离（用于 AO）
	addLeaf( pos, wallN, s, depth, shade = 1 ) {

		const rng = this.rng;
		const up = new THREE.Vector3( 0, 1, 0 );
		// 叶面朝向：墙法线向上仰 20~40°，再左右偏 ±35°
		const side = new THREE.Vector3().crossVectors( up, wallN );
		if ( side.lengthSq() < 1e-4 ) side.set( 1, 0, 0 );
		side.normalize();
		const n = wallN.clone().applyAxisAngle( side, - ( 0.35 + rng() * 0.35 ) ).applyAxisAngle( up, ( rng() - 0.5 ) * 1.2 );
		// 叶尖：向下 ±70°
		const tip = new THREE.Vector3( 0, - 1, 0 ).applyAxisAngle( n, ( rng() - 0.5 ) * 2.4 );
		this.leaves.push( leafMatrix( pos.clone().addScaledVector( tip, - s * 0.1 ), n, tip, s ) );
		// 实例色：明度 ±15%、色相漂移；离墙越近越暗（AO）；少量枯黄老叶
		const ao = 0.4 + 0.6 * Math.min( 1, depth / 0.13 );
		const vv = ( 0.85 + rng() * 0.3 ) * ao * shade;
		const c = new THREE.Color( 1 + ( rng() - 0.5 ) * 0.35, 1, 1 + ( rng() - 0.5 ) * 0.4 ).multiplyScalar( vv );
		if ( rng() < 0.06 ) c.setRGB( 2.3, 1.4, 1.0 ).multiplyScalar( vv );
		this.colors.push( c );

	}

	/**
	 * 墙面攀爬。wall: { origin, uDir, normal, width, height }
	 * seeds: [[u, v, r0]]；density(u, v) 0~1；bulge(u, v) 叶团额外离墙距离（米）
	 */
	growWall( wall, { seeds, density = () => 1, bulge = () => 0, steps = 90, leafScale = 0.09, shoot = 0.05, leafRate = 1, shade = 1, hangTop = 0.4 } ) {

		const rng = this.rng;
		const { origin, uDir, normal, width, height } = wall;
		const vDir = new THREE.Vector3( 0, 1, 0 );
		const W = ( u, v, d ) => origin.clone().addScaledVector( uDir, u ).addScaledVector( vDir, v ).addScaledVector( normal, d );
		const queue = seeds.map( ( [ u, v, r ] ) => ( { u, v, ang: Math.PI / 2 + ( rng() - 0.5 ) * 0.5, r: r ?? 0.012, life: steps, gen: 0, turn: rng() < 0.5 ? - 1 : 1 } ) );
		const step = 0.04;
		let guard = 0;
		while ( queue.length && guard ++ < 6000 ) {

			const b = queue.pop();
			let { u, v, ang, r } = b;
			const pts = [ W( u, v, r + 0.003 ) ], rs = [ r ];
			const phase = rng() * 10;
			for ( let i = 0; i < b.life; i ++ ) {

				const d = density( u, v );
				// 朝高密度区转向（左右各探 15cm）
				const dl = density( u + Math.cos( ang + 0.6 ) * 0.15, v + Math.sin( ang + 0.6 ) * 0.15 );
				const dr = density( u + Math.cos( ang - 0.6 ) * 0.15, v + Math.sin( ang - 0.6 ) * 0.15 );
				ang += ( rng() - 0.5 ) * 0.42 + ( dl - dr ) * 0.5 + ( Math.PI / 2 - ang ) * 0.04;
				if ( v > height - 0.3 ) ang += b.turn * 0.12; // 顶到天花板后横向爬
				u += Math.cos( ang ) * step;
				v += Math.sin( ang ) * step;
				if ( u < 0.02 || u > width - 0.02 || v < 0 || v > height - 0.03 ) break;
				if ( d < 0.04 && rng() < 0.3 ) break;
				r = Math.max( 0.0022, r * 0.992 );
				// 茎偶尔拱离墙面 0~2cm（气生根松脱）
				const arch = Math.max( 0, Math.sin( i * 0.23 + phase ) ) * 0.015;
				pts.push( W( u, v, r + 0.003 + arch ) );
				rs.push( r );
				const young = 1 - 0.4 * Math.max( 0, ( i - b.life + 12 ) / 12 ); // 枝梢的叶子小
				// 茎节生叶
				if ( rng() < ( 0.15 + 0.6 * d ) * leafRate ) {

					const nL = 1 + ( rng() < d * 0.7 ? 1 : 0 ) + ( rng() < d * 0.35 ? 1 : 0 );
					const bz = bulge( u, v );
					for ( let k = 0; k < nL; k ++ ) {

						const sd = rng() < 0.5 ? - 1 : 1;
						const lat = 0.01 + rng() * 0.06;
						const depth = 0.02 + rng() * 0.05 + rng() * d * 0.08 + bz * Math.sqrt( rng() );
						const p = W( u + Math.cos( ang + sd * 1.57 ) * lat, v + Math.sin( ang + sd * 1.57 ) * lat - rng() * 0.02, depth );
						this.addLeaf( p, normal, leafScale * ( 0.55 + rng() * 0.7 ) * ( 0.85 + d * 0.3 ) * young, depth, shade );

					}

				}

				// 分叉
				if ( rng() < 0.015 + 0.028 * d && b.gen < 4 && queue.length < 400 ) {

					queue.push( { u, v, ang: ang + ( rng() < 0.5 ? - 1 : 1 ) * ( 0.5 + rng() * 0.8 ), r: r * 0.7, life: Math.floor( ( b.life - i ) * 0.85 ), gen: b.gen + 1, turn: rng() < 0.5 ? - 1 : 1 } );

				}

				// 外伸枝（体积与剪影）
				if ( rng() < shoot * d ) this.shoot( pts[ pts.length - 1 ], normal, uDir, leafScale * 1.1, 0.12 + rng() * 0.35 * ( 0.5 + d ), shade );
				// 顶部垂帘：爬到顶的茎有一定概率垂下一条
				if ( v > height - 0.32 && rng() < hangTop * 0.08 ) this.hang( pts[ pts.length - 1 ].clone().addScaledVector( normal, 0.02 ), normal, 0.4 + rng() * 1.2, leafScale * 0.9, shade );

			}

			if ( pts.length > 2 ) this.tubes.push( { pts, rs } );

		}

	}

	// 外伸枝：离开墙面后在重力下弯垂
	shoot( start, normal, uDir, leafScale, len, shade = 1 ) {

		const rng = this.rng;
		const a = 0.5 + rng() * 0.6;
		const dir = normal.clone().multiplyScalar( Math.cos( a ) ).addScaledVector( new THREE.Vector3( 0, 1, 0 ), Math.sin( a ) * ( rng() < 0.75 ? 1 : - 0.5 ) ).addScaledVector( uDir, ( rng() - 0.5 ) * 0.8 ).normalize();
		const p = start.clone();
		const pts = [ p.clone() ], rs = [ 0.004 ];
		const n = Math.max( 3, Math.round( len / 0.03 ) );
		for ( let i = 0; i < n; i ++ ) {

			dir.y -= 0.06 + i * 0.006;
			dir.addScaledVector( new THREE.Vector3( rng() - 0.5, rng() - 0.5, rng() - 0.5 ), 0.2 ).normalize();
			p.addScaledVector( dir, 0.03 );
			pts.push( p.clone() ); rs.push( 0.004 * ( 1 - i / n * 0.5 ) );
			if ( rng() < 0.85 ) {

				const out = normal.clone().addScaledVector( dir, 0.5 ).normalize();
				const lp = p.clone().add( new THREE.Vector3( ( rng() - 0.5 ) * 0.05, ( rng() - 0.5 ) * 0.03, ( rng() - 0.5 ) * 0.05 ) );
				const depth = 0.08 + p.clone().sub( start ).dot( normal );
				this.addLeaf( lp, out, leafScale * ( 0.6 + rng() * 0.6 ), depth, shade );

			}

		}

		this.tubes.push( { pts, rs } );

	}

	// 垂帘：从 start 下垂 len 米，轻微摆动、略微外凸
	hang( start, normal, len, leafScale, shade = 1, minY = 0.55 ) {

		const rng = this.rng;
		const pts = [ start.clone() ], rs = [ 0.0035 ];
		const ph = rng() * 6, sw = 0.02 + rng() * 0.04;
		const side = new THREE.Vector3().crossVectors( new THREE.Vector3( 0, 1, 0 ), normal ).normalize();
		for ( let s = 1; s * 0.04 < len; s ++ ) {

			const t = s * 0.04;
			const p = start.clone().addScaledVector( side, Math.sin( t * 3 + ph ) * sw ).addScaledVector( normal, Math.sin( Math.min( 1, t / len ) * Math.PI ) * 0.06 );
			p.y -= t;
			if ( p.y < minY ) break;
			pts.push( p ); rs.push( 0.003 );
			if ( rng() < 0.75 ) {

				const az = ( rng() - 0.5 ) * 2.6;
				const out = normal.clone().applyAxisAngle( new THREE.Vector3( 0, 1, 0 ), az );
				this.addLeaf( p.clone().addScaledVector( out, 0.012 ), out, leafScale * ( 0.55 + rng() * 0.6 ), 0.1, shade );

			}

		}

		this.tubes.push( { pts, rs } );

	}

	// 生成网格：叶片 InstancedMesh（1 次绘制）+ 所有茎合并成一个变径管网格（1 次绘制）
	build() {

		const group = new THREE.Group();
		const leaves = new THREE.InstancedMesh( leafGeo(), leafMat(), this.leaves.length );
		this.leaves.forEach( ( m, i ) => { leaves.setMatrixAt( i, m ); leaves.setColorAt( i, this.colors[ i ] ); } );
		leaves.castShadow = leaves.receiveShadow = true;
		leaves.computeBoundingSphere();
		group.add( leaves );

		const SEG = 5;
		let nv = 0, ni = 0;
		for ( const t of this.tubes ) { nv += t.pts.length * SEG; ni += ( t.pts.length - 1 ) * SEG * 6; }
		const pos = new Float32Array( nv * 3 ), nor = new Float32Array( nv * 3 ), uvs = new Float32Array( nv * 2 );
		const idx = new Uint32Array( ni );
		let vo = 0, io = 0;
		const T = new THREE.Vector3(), N = new THREE.Vector3( 0, 0, 1 ), B = new THREE.Vector3(), d = new THREE.Vector3();
		for ( const { pts, rs } of this.tubes ) {

			const n = pts.length;
			N.set( 0.3, 0.2, 1 ).normalize();
			const base = vo;
			for ( let i = 0; i < n; i ++ ) {

				T.subVectors( pts[ Math.min( n - 1, i + 1 ) ], pts[ Math.max( 0, i - 1 ) ] ).normalize();
				N.addScaledVector( T, - N.dot( T ) );
				if ( N.lengthSq() < 1e-6 ) N.set( T.y, - T.x, 0 );
				N.normalize();
				B.crossVectors( T, N );
				for ( let j = 0; j < SEG; j ++ ) {

					const a = j / SEG * Math.PI * 2;
					d.copy( N ).multiplyScalar( Math.cos( a ) ).addScaledVector( B, Math.sin( a ) );
					const k = vo + j;
					pos[ k * 3 ] = pts[ i ].x + d.x * rs[ i ]; pos[ k * 3 + 1 ] = pts[ i ].y + d.y * rs[ i ]; pos[ k * 3 + 2 ] = pts[ i ].z + d.z * rs[ i ];
					nor[ k * 3 ] = d.x; nor[ k * 3 + 1 ] = d.y; nor[ k * 3 + 2 ] = d.z;
					uvs[ k * 2 ] = j / SEG; uvs[ k * 2 + 1 ] = i * 0.04;

				}

				vo += SEG;

			}

			for ( let i = 0; i < n - 1; i ++ ) for ( let j = 0; j < SEG; j ++ ) {

				const a = base + i * SEG + j, b2 = base + i * SEG + ( j + 1 ) % SEG, c = a + SEG, e = b2 + SEG;
				idx[ io ++ ] = a; idx[ io ++ ] = c; idx[ io ++ ] = b2;
				idx[ io ++ ] = b2; idx[ io ++ ] = c; idx[ io ++ ] = e;

			}

		}

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
		g.setAttribute( 'normal', new THREE.BufferAttribute( nor, 3 ) );
		g.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
		g.setIndex( new THREE.BufferAttribute( idx, 1 ) );
		const stems = new THREE.Mesh( g, stemMat() );
		stems.castShadow = true; stems.receiveShadow = true;
		group.add( stems );
		group.userData.count = { leaves: this.leaves.length, stemVerts: nv };
		return group;

	}

}
