// 淹水中庭：程序化植被
//   1. 垂挂常春藤帘幕：从夹层楼板边缘/天花垂下的长藤条，沿藤条交替生叶（实例化叶片，有体积）
//   2. 墙面常春藤：墙面二维随机游走生长
//   3. 睡莲叶：带缺口的圆叶，成簇漂浮
import * as THREE from 'three/webgpu';
import {
	vec3, float, mix, smoothstep, mx_fractal_noise_float, positionWorld, instanceIndex, hash, uv, positionLocal, cameraPosition, normalize, dot, max, pow,
	sin, time, vec2, normalLocal, attribute,
} from 'three/tsl';

// 常春藤叶：五裂掌状，中脉略折、边缘微卷（原点在叶柄处，叶尖朝 +Y，叶面朝 +Z）
export function ivyLeafGeometry() {

	const lobes = [ [ 90, 1.0 ], [ 60, 0.5 ], [ 36, 0.66 ], [ 10, 0.4 ], [ - 18, 0.52 ], [ - 48, 0.24 ] ];
	const pts = [ ...lobes ];
	for ( let i = lobes.length - 2; i >= 1; i -- ) pts.push( [ 180 - lobes[ i ][ 0 ], lobes[ i ][ 1 ] ] );
	pts.push( [ 228, 0.24 ] );
	const outline = pts.map( ( [ a, r ] ) => {

		const rad = THREE.MathUtils.degToRad( a );
		return [ Math.cos( rad ) * r * 0.85, Math.sin( rad ) * r ];

	} );
	const pos = [ 0, 0.2, 0.03 ], uvs = [ 0.5, 0.5 ];
	for ( const [ x, y ] of outline ) {

		pos.push( x, y + 0.2, Math.abs( x ) * 0.3 - ( x * x + y * y ) * 0.06 );
		uvs.push( 0.5 + x * 0.5, 0.5 + y * 0.5 );

	}

	const idx = [];
	const n = outline.length;
	for ( let i = 0; i < n; i ++ ) idx.push( 0, 1 + i, 1 + ( ( i + 1 ) % n ) );
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

// 叶片材质：深绿蜡质、实例间色相/明度抖动、少量枯黄叶，叶脉中心略亮
export function leafMaterial( { dryRatio = 0.1, bright = 1, sway = 0, backLight = null } = {} ) {

	const m = new THREE.MeshStandardNodeMaterial( { side: THREE.DoubleSide, roughness: 0.5, metalness: 0 } );
	const h = hash( instanceIndex );
	const h2 = hash( instanceIndex.add( 7919 ) );
	const n = mx_fractal_noise_float( positionWorld.mul( 0.8 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
	const deep = vec3( 0.045, 0.085, 0.025 );
	const fresh = vec3( 0.11, 0.17, 0.04 );
	const yellow = vec3( 0.17, 0.13, 0.045 );
	let col = mix( deep, fresh, h.mul( 0.7 ).add( n.mul( 0.45 ) ).clamp() );
	col = mix( col, yellow, smoothstep( 1 - dryRatio, 1 - dryRatio * 0.4, h2 ) );
	const r = uv().sub( 0.5 ).length();
	col = col.mul( mix( 1.15, 0.65, smoothstep( 0.08, 0.5, r ) ) ).mul( bright );
	m.colorNode = col;
	m.roughnessNode = mix( float( 0.32 ), float( 0.75 ), h2 );
	if ( backLight ) {

		// 叶片透光近似：视线穿过叶片指向明亮光源（出口/天窗）时，叶片呈现透射的黄绿色
		const V = normalize( positionWorld.sub( cameraPosition ) );
		const L = normalize( vec3( ...backLight.pos ).sub( positionWorld ) );
		const fall = smoothstep( backLight.range, 0.0, vec3( ...backLight.pos ).sub( positionWorld ).length() );
		const tr = pow( max( dot( V, L ), 0 ), 6 ).mul( fall ).mul( backLight.k );
		m.emissiveNode = col.mul( vec3( 1.3, 1.6, 0.7 ) ).mul( tr ).mul( mix( 0.5, 1.2, h ) );

	}
	if ( sway > 0 ) {

		// 极轻微的气流摆动（按世界高度和实例相位）
		const ph = h.mul( 6.28 );
		m.positionNode = positionLocal.add( vec3( sin( time.mul( 0.9 ).add( ph ) ).mul( sway ), 0, sin( time.mul( 0.7 ).add( ph.mul( 1.3 ) ) ).mul( sway ) ) );

	}

	return m;

}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();

/**
 * 垂挂藤条：anchor 起点（世界），length 长度，rng；藤条带轻微 S 形摆动和螺旋，越往下叶越稀小
 * out.leaves / out.stems 收集矩阵
 */
export function hangStrand( anchor, length, rng, out, { leafScale = 0.085, density = 1, curl = 0.25 } = {} ) {

	const steps = Math.floor( length / 0.04 );
	const ph = rng() * 6.28, ph2 = rng() * 6.28;
	const amp = 0.04 + rng() * 0.12;
	let prev = anchor.clone();
	const up = new THREE.Vector3( 0, 1, 0 );
	for ( let i = 1; i <= steps; i ++ ) {

		const t = i / steps;
		const y = anchor.y - t * length;
		const sway = Math.sin( t * 4.0 + ph ) * amp * t;
		const cur = new THREE.Vector3( anchor.x + sway + Math.sin( t * 9 + ph2 ) * 0.015, y, anchor.z + Math.cos( t * 3.1 + ph2 ) * amp * 0.7 * t );
		// 茎
		const mid = prev.clone().add( cur ).multiplyScalar( 0.5 );
		const dir = cur.clone().sub( prev );
		const len = dir.length();
		_q.setFromUnitVectors( up, dir.normalize() );
		out.stems.push( new THREE.Matrix4().compose( mid, _q, new THREE.Vector3( 0.005, len * 1.08, 0.005 ) ) );
		prev = cur;
		// 叶：上部茂密成团，下部稀疏、叶更小（藤条尖端）
		const taper = 1 - Math.pow( t, 2.2 ) * 0.6;
		const nL = rng() < density * ( 0.95 - t * 0.35 ) ? 1 + ( rng() < 0.45 * density * ( 1 - t ) ? 1 : 0 ) : 0;
		for ( let k = 0; k < nL; k ++ ) {

			const a = rng() * Math.PI * 2;
			const off = 0.02 + rng() * 0.05 * ( 1 + ( 1 - t ) * 1.5 );
			const p = cur.clone().add( new THREE.Vector3( Math.cos( a ) * off, ( rng() - 0.5 ) * 0.03, Math.sin( a ) * off ) );
			// 叶面朝外（远离藤条），叶尖朝下垂，随机扭转
			_e.set( - 0.4 - rng() * curl * 3, a + Math.PI / 2 + ( rng() - 0.5 ) * 0.8, Math.PI + ( rng() - 0.5 ) * 1.4, 'YXZ' );
			_q.setFromEuler( _e );
			const s = leafScale * ( 0.6 + rng() * 0.7 ) * taper;
			_m.compose( p, _q, new THREE.Vector3( s, s, s ) );
			out.leaves.push( _m.clone() );

		}

	}

}

/**
 * 墙面常春藤：wall = { origin（左下角）, uDir, normal, width, height }，seeds [[u,v]]，density(u,v)
 */
export function growWallIvy( wall, { seeds, density = () => 1, rng, steps = 160, leafScale = 0.08, droop = 0.2, thick = 1 }, out ) {

	const { origin, uDir, normal, width, height } = wall;
	const vDir = new THREE.Vector3( 0, 1, 0 );
	const toWorld = ( u, v, d ) => origin.clone().addScaledVector( uDir, u ).addScaledVector( vDir, v ).addScaledVector( normal, d );
	const basis = new THREE.Matrix4().makeBasis( uDir, vDir, normal );
	const qBase = new THREE.Quaternion().setFromRotationMatrix( basis );
	const queue = seeds.map( ( [ u, v, a ] ) => ( { u, v, ang: a ?? Math.PI / 2 + ( rng() - 0.5 ) * 0.6, life: steps, depth: 0 } ) );
	let guard = 0;
	while ( queue.length && guard ++ < 3000 ) {

		const b = queue.pop();
		let { u, v, ang } = b;
		let prev = toWorld( u, v, 0.01 );
		for ( let i = 0; i < b.life; i ++ ) {

			const dens = density( u, v );
			if ( dens <= 0.02 && rng() < 0.3 ) break;
			const upPull = v > height - 0.3 ? - 0.6 : 0.12;
			ang += ( rng() - 0.5 ) * 0.5 + ( Math.PI / 2 - ang ) * upPull * 0.15;
			if ( rng() < droop * 0.02 ) ang = - Math.PI / 2 + ( rng() - 0.5 ) * 0.5;
			u += Math.cos( ang ) * 0.045;
			v += Math.sin( ang ) * 0.045;
			if ( u < 0.02 || u > width - 0.02 || v < 0.02 || v > height - 0.02 ) break;
			const cur = toWorld( u, v, 0.012 );
			const mid = prev.clone().add( cur ).multiplyScalar( 0.5 );
			const dir = cur.clone().sub( prev );
			const len = dir.length();
			_q.setFromUnitVectors( vDir, dir.normalize() );
			out.stems.push( new THREE.Matrix4().compose( mid, _q, new THREE.Vector3( 0.006 * thick, len * 1.05, 0.006 * thick ) ) );
			prev = cur;
			const nLeaves = rng() < dens ? 1 + Math.floor( rng() * ( 1 + dens * 3 ) ) : 0;
			for ( let k = 0; k < nLeaves; k ++ ) {

				const side = rng() < 0.5 ? - 1 : 1;
				const off = 0.02 + rng() * 0.05;
				const lu = u + Math.cos( ang + side * Math.PI / 2 ) * off;
				const lv = v + Math.sin( ang + side * Math.PI / 2 ) * off;
				const depth = 0.015 + Math.pow( rng(), 1.6 ) * 0.17 * dens * thick;
				const p = toWorld( lu, lv, depth );
				_e.set( - 0.6 - rng() * 0.9, ( rng() - 0.5 ) * 0.9, Math.PI + ( rng() - 0.5 ) * 2.2 );
				const q = qBase.clone().multiply( new THREE.Quaternion().setFromEuler( _e ) );
				const s = leafScale * ( 0.55 + rng() * 0.75 ) * ( 0.8 + dens * 0.4 );
				_m.compose( p, q, new THREE.Vector3( s, s, s ) );
				out.leaves.push( _m.clone() );

			}

			if ( rng() < 0.035 * ( 0.4 + dens ) && b.depth < 4 && queue.length < 500 ) {

				queue.push( { u, v, ang: ang + ( rng() < 0.5 ? - 1 : 1 ) * ( 0.5 + rng() * 0.8 ), life: Math.floor( b.life * 0.6 ), depth: b.depth + 1 } );

			}

		}

	}

}

export function buildFoliage( out, { sway = 0, dryRatio = 0.1, bright = 1, backLight = null } = {} ) {

	const group = new THREE.Group();
	if ( out.leaves.length ) {

		const leaves = new THREE.InstancedMesh( ivyLeafGeometry(), leafMaterial( { sway, dryRatio, bright, backLight } ), out.leaves.length );
		out.leaves.forEach( ( m, i ) => leaves.setMatrixAt( i, m ) );
		leaves.castShadow = leaves.receiveShadow = true;
		leaves.computeBoundingSphere();
		group.add( leaves );

	}

	if ( out.stems.length ) {

		const stems = new THREE.InstancedMesh( new THREE.CylinderGeometry( 1, 1, 1, 4, 1, true ), new THREE.MeshStandardNodeMaterial( { color: 0x1f1810, roughness: 0.9 } ), out.stems.length );
		out.stems.forEach( ( m, i ) => stems.setMatrixAt( i, m ) );
		stems.castShadow = false; stems.receiveShadow = true;
		stems.computeBoundingSphere();
		group.add( stems );

	}

	return group;

}

// 睡莲叶：圆形 + 一个 V 形缺口，叶缘略上翘；叶脉放射状（着色器）
export function lilyGeometry() {

	const N = 28, notch = 0.32;
	const pos = [ 0, 0.004, 0 ], uvs = [ 0.5, 0.5 ];
	for ( let i = 0; i <= N; i ++ ) {

		const a = notch / 2 + ( i / N ) * ( Math.PI * 2 - notch );
		const x = Math.cos( a ), z = Math.sin( a );
		pos.push( x, 0.035 + Math.sin( a * 3 ) * 0.008, z );
		uvs.push( 0.5 + x * 0.5, 0.5 + z * 0.5 );

	}

	const idx = [];
	for ( let i = 0; i < N; i ++ ) idx.push( 0, i + 2, i + 1 );
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

export function lilyMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { side: THREE.DoubleSide, metalness: 0 } );
	const h = hash( instanceIndex );
	const h2 = hash( instanceIndex.add( 331 ) );
	const c = uv().sub( 0.5 );
	const r = c.length().mul( 2 );
	const ang = c.y.atan( c.x );
	// 放射叶脉
	const vein = smoothstep( 0.9, 1.0, sin( ang.mul( 18 ) ).abs() ).mul( smoothstep( 0.05, 0.3, r ) ).mul( 0.25 );
	const base = mix( vec3( 0.05, 0.1, 0.02 ), vec3( 0.1, 0.16, 0.035 ), h );
	// 叶缘泛红褐、部分叶片腐烂发黄
	let col = mix( base, vec3( 0.12, 0.06, 0.03 ), smoothstep( 0.82, 1.0, r ).mul( 0.6 ) );
	col = mix( col, vec3( 0.16, 0.13, 0.05 ), smoothstep( 0.85, 0.97, h2 ) );
	const spots = smoothstep( 0.62, 0.7, mx_fractal_noise_float( positionWorld.mul( 9 ), 2, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 ) );
	col = mix( col, col.mul( 0.45 ), spots );
	m.colorNode = col.mul( float( 1 ).add( vein ) );
	// 蜡质叶面：较光滑，有湿亮的高光
	m.roughnessNode = mix( float( 0.38 ), float( 0.7 ), spots.add( h2.mul( 0.3 ) ) );
	return m;

}
