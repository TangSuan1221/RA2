// 地面植被：全部按地面信息图摆放 —— 裂缝里一线草、路缘排水沟/墙根成带、洼地边缘苔藓、车辆与路障周围堆积
//   1. 草丛卡片（3 交叉竖片，根部收拢）：密度 = 裂缝距离衰减 + 堆积物 + 路缘带；开阔路面不允许孤立草团
//   2. 阔叶杂草卡片（自绘，十字交叉 + 斜插）：墙根、路缘
//   3. Poly Haven 蕨类/荨麻/灌木：法线朝上（避免俯视下背面发黑成"黑星"），只在墙根与空地
//   4. 苔藓垫（贴地低矮卡片，顶点抬升）：裂缝两侧与湿区边缘
//   5. 地面碎屑：落叶图集（自绘）、纸张、报纸 —— 贴地
import * as THREE from 'three/webgpu';
import { float, vec3, mix, positionLocal, uv, sin, time, positionWorld, transformNormalToView, normalView, texture, normalize } from 'three/tsl';
import { rng, fbm } from './noise.js';
import { makeGrassTexture, makeLitterTexture, makeWeedTexture } from './textures.js';
import { SHADOW_LAYER } from './atmosphere.js';
import { L, onRoad, onWalk, groundY } from './layout.js';
import { sampleGM } from './groundmap.js';

// 草丛：3 张交叉竖片，根部收拢
function clumpGeo( n = 3, curl = 0.15 ) {

	const geos = [];
	for ( let i = 0; i < n; i ++ ) {

		const g = new THREE.PlaneGeometry( 1, 1, 1, 3 );
		g.translate( 0, 0.5, 0 );
		const p = g.attributes.position;
		for ( let k = 0; k < p.count; k ++ ) {

			const y = p.getY( k );
			p.setX( k, p.getX( k ) * ( 0.3 + y * 0.95 ) );
			p.setZ( k, y * y * curl );

		}

		g.rotateY( i * Math.PI / n );
		geos.push( g.toNonIndexed() );

	}

	const out = new THREE.BufferGeometry();
	const cnt = geos.reduce( ( a, g ) => a + g.attributes.position.count, 0 );
	const pos = new Float32Array( cnt * 3 ), nor = new Float32Array( cnt * 3 ), uvs = new Float32Array( cnt * 2 );
	let o = 0;
	for ( const g of geos ) {

		pos.set( g.attributes.position.array, o * 3 );
		uvs.set( g.attributes.uv.array, o * 2 );
		// 法线统一朝上偏（卡片侧面不发黑，草丛像体积一样受天光）
		for ( let k = 0; k < g.attributes.position.count; k ++ ) nor.set( [ 0, 1, 0 ], ( o + k ) * 3 );
		o += g.attributes.position.count;

	}

	out.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
	out.setAttribute( 'normal', new THREE.BufferAttribute( nor, 3 ) );
	out.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
	return out;

}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const mat4 = ( x, y, z, rx, ry, rz, sx, sy, sz, order = 'XYZ' ) => _m.compose( _v.set( x, y, z ), _q.setFromEuler( _e.set( rx, ry, rz, order ) ), _s.set( sx, sy, sz ) ).clone();

export function buildVegetation( M, { blocked, roofSpots = [], footprints = [] } ) {

	const group = new THREE.Group();
	const r = rng( 2024 );
	const nearFoot = ( x, z, pad ) => footprints.some( ( f ) => {

		const c = Math.cos( f.ry ), s = Math.sin( f.ry );
		const dx = x - f.x, dz = z - f.z;
		const lx = c * dx - s * dz, lz = s * dx + c * dz;
		return Math.abs( lx ) < f.hw + pad && Math.abs( lz ) < f.hd + pad;

	} );

	// —— 1. 草丛 ——
	const { map: grassTex, alphaMap: grassA } = makeGrassTexture();
	// 物理材质：叶片镜面强度低（F90 跟随 specularIntensity），避免掠射角下整片发白
	const gmat = new THREE.MeshPhysicalNodeMaterial( { map: grassTex, alphaMap: grassA, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, specularIntensity: 0.25 } );
	// 风动：按卡片自身的 uv.y（0 根部 → 1 叶尖）加权；positionLocal 在实例化之后已是世界高度，不能用（屋顶草会被甩上天）
	const sway = sin( time.mul( 1.3 ).add( positionLocal.x.mul( 0.4 ) ).add( positionLocal.z.mul( 0.3 ) ) ).mul( 0.05 ).mul( uv().y.pow( 2 ) );
	gmat.positionNode = positionLocal.add( vec3( sway, 0, sway.mul( 0.6 ) ) );
	// 双面卡片的背面会翻转法线（朝下 → 全黑），固定为世界朝上法线
	const upView = transformNormalToView( vec3( 0, 1, 0 ) );
	gmat.normalNode = upView;
	const grass = [], gcol = [];
	const addGrass = ( x, z, s, dry = 0, y = null ) => {

		if ( y === null ) { if ( blocked( x, z ) ) return; y = groundY( x, z ); }
		grass.push( mat4( x, y - 0.02, z, ( r() - 0.5 ) * 0.25, r() * 6.28, ( r() - 0.5 ) * 0.25, s * ( 0.8 + r() * 0.5 ), s * ( 0.75 + r() * 0.5 ), s * ( 0.8 + r() * 0.5 ) ) );
		const v = 0.22 + r() * 0.24;
		gcol.push( new THREE.Color( v * ( 0.8 + dry * 0.6 ), v, v * ( 0.6 - dry * 0.1 ) ) );

	};

	// 密度规则：裂缝（0–6cm 内）+ 堆积物（路缘、墙根、车周）；开阔路面没有裂缝就不长
	let tries = 0;
	while ( grass.length < 29000 && tries ++ < 1400000 ) {

		const x = ( r() - 0.5 ) * 110, z = 44 - r() * 205;
		const g = sampleGM( x, z );
		const road = onRoad( x, z );
		const n = fbm( x * 0.15, z * 0.15, 3, 4 );
		let p = 0;
		const crackK = Math.max( 0, 1 - g.crack / 0.06 );
		p += crackK * ( road ? 0.9 : 0.8 ) * ( 0.4 + n );
		p += Math.max( 0, g.acc - 0.35 ) * 1.6 * ( 0.3 + n );
		if ( ! road && ! onWalk( x, z ) ) p += 0.35 * n; // 空地
		if ( nearFoot( x, z, 0.4 ) ) p *= 0.25; // 车底不长（暗处）但车边长
		else if ( nearFoot( x, z, 1.2 ) ) p += 0.25 * n;
		if ( g.dep > 0.62 ) p *= 0.1; // 水里不长
		if ( r() > p ) continue;
		const s = road && g.acc < 0.45 ? 0.1 + r() * 0.16 : ( 0.28 + r() * 0.45 ) * ( 0.7 + g.acc * 0.8 );
		addGrass( x, z, s, r() < 0.18 ? 1 : 0 );

	}

	// 屋顶：女儿墙脚与积水边成片长草（俯视镜头）
	for ( const rs of roofSpots ) {

		const area = ( rs.x1 - rs.x0 ) * ( rs.z1 - rs.z0 );
		for ( let i = 0; i < area * 0.9; i ++ ) {

			const x = rs.x0 + r() * ( rs.x1 - rs.x0 ), z = rs.z0 + r() * ( rs.z1 - rs.z0 );
			const edge = Math.min( x - rs.x0, rs.x1 - x, z - rs.z0, rs.z1 - z );
			const n = fbm( x * 0.2, z * 0.2, 3, 21 );
			if ( r() > ( edge < 0.8 ? 0.9 : 0.15 ) * n * 1.6 ) continue;
			addGrass( x, z, 0.3 + r() * 0.5, r() < 0.3 ? 1 : 0, rs.y );

		}

	}

	const gi = new THREE.InstancedMesh( clumpGeo(), gmat, grass.length );
	grass.forEach( ( m, i ) => { gi.setMatrixAt( i, m ); gi.setColorAt( i, gcol[ i ] ); } );
	gi.receiveShadow = true; gi.castShadow = false;
	gi.name = 'grass';
	group.add( gi );

	// —— 2. 阔叶杂草（自绘卡片，2×2 图集，每格一种）——
	const { map: weedTex, alphaMap: weedA } = makeWeedTexture();
	const wmat = new THREE.MeshPhysicalNodeMaterial( { map: weedTex, alphaMap: weedA, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6, specularIntensity: 0.3 } );
	wmat.positionNode = positionLocal.add( vec3( sway.mul( 0.6 ), 0, sway.mul( 0.4 ) ) );
	wmat.normalNode = upView;
	const weeds = [ [], [], [], [] ], wcol = [ [], [], [], [] ];
	tries = 0;
	let wc = 0;
	while ( wc < 5000 && tries ++ < 300000 ) {

		const x = ( r() - 0.5 ) * 100, z = 42 - r() * 195;
		if ( blocked( x, z ) ) continue;
		const g = sampleGM( x, z );
		const road = onRoad( x, z );
		const ax = Math.abs( x );
		const wallFoot = ax > L.roadHalf + L.walk - 1.0 && ax < L.roadHalf + L.walk + 0.2;
		const gutter = Math.abs( ax - L.roadHalf ) < 0.5;
		let p = ( wallFoot ? 0.7 : gutter ? 0.35 : 0 ) + Math.max( 0, g.acc - 0.5 ) * 0.8 + ( road ? 0 : 0.05 );
		if ( g.crack < 0.03 && ! road ) p += 0.2;
		p *= fbm( x * 0.12, z * 0.12, 2, 31 ) * 1.6;
		if ( r() > p ) continue;
		const q = Math.floor( r() * 4 );
		const s = 0.35 + r() * 0.55;
		weeds[ q ].push( mat4( x, groundY( x, z ) - 0.01, z, 0, r() * 6.28, 0, s, s * ( 0.8 + r() * 0.4 ), s ) );
		const v = 0.3 + r() * 0.3;
		wcol[ q ].push( new THREE.Color( v * 0.82, v, v * 0.62 ) );
		wc ++;

	}

	const wgeo = clumpGeo( 2, 0.3 );
	weeds.forEach( ( list, q ) => {

		if ( ! list.length ) return;
		const g = wgeo.clone();
		const uvA = g.attributes.uv;
		for ( let i = 0; i < uvA.count; i ++ ) uvA.setXY( i, ( q % 2 ) * 0.5 + uvA.getX( i ) * 0.5, 1 - Math.floor( q / 2 ) * 0.5 - ( 1 - uvA.getY( i ) ) * 0.5 );
		const im = new THREE.InstancedMesh( g, wmat, list.length );
		list.forEach( ( m, i ) => { im.setMatrixAt( i, m ); im.setColorAt( i, wcol[ q ][ i ] ); } );
		im.receiveShadow = true;
		im.name = 'weeds';
		group.add( im );

	} );

	// —— 3. Poly Haven 蕨类 / 灌木 / 荨麻（墙根、空地；法线朝上避免黑星）——
	const batches = [];
	const place = ( id, prefix, count, s0, s1, rule ) => {

		const parts = M[ id ].parts;
		const nodes = Object.keys( parts ).filter( ( n ) => n.startsWith( prefix ) );
		const items = [];
		let t = 0;
		while ( items.length < count && t ++ < count * 60 ) {

			const x = ( r() - 0.5 ) * 110, z = 40 - r() * 175;
			if ( blocked( x, z, 0.3 ) || nearFoot( x, z, 0.3 ) ) continue;
			const ax = Math.abs( x );
			const wallFoot = ax > L.roadHalf + L.walk - 1.3 && ax < L.roadHalf + L.walk + 0.5;
			const road = onRoad( x, z );
			let p = 0.02;
			if ( rule === 'edge' ) p = wallFoot ? 0.9 : road ? 0 : 0.2;
			if ( rule === 'lot' ) p = road ? 0.0 : wallFoot ? 0.5 : 0.3;
			if ( r() > p * fbm( x * 0.1, z * 0.1, 2, 9 ) * 1.8 ) continue;
			items.push( [ nodes[ Math.floor( r() * nodes.length ) ], x, z, s0 + r() * ( s1 - s0 ) ] );

		}

		for ( const [ node, x, z, s ] of items ) for ( const part of parts[ node ] ) {

			let b = batches.find( ( q ) => q.part === part );
			if ( ! b ) batches.push( b = { part, mats: [] } );
			b.mats.push( mat4( x, groundY( x, z ), z, 0, r() * 6.28, 0, s, s, s ).multiply( part.local ) );

		}

	};

	place( 'fern_02', 'fern_02_', 260, 0.9, 1.6, 'edge' );
	place( 'shrub_02', 'shrub_02_', 10, 0.6, 1.0, 'lot' );
	place( 'weed_plant_02', 'weed_plant_02_', 110, 3.0, 5.0, 'edge' );

	const seen = new Map();
	const upN = transformNormalToView( vec3( 0, 1, 0 ) );
	for ( const b of batches ) {

		const src = b.part.material;
		if ( ! seen.has( src ) ) {

			const pm = new THREE.MeshPhysicalNodeMaterial( { map: src.map, alphaMap: src.alphaMap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, specularIntensity: 0.25, color: new THREE.Color( 0.42, 0.52, 0.34 ) } );
			// 法线固定朝上：叶片背面/侧面不会因法线朝下而发黑
			pm.normalNode = upN;
			seen.set( src, pm );

		}

		const m = seen.get( src );

		const im = new THREE.InstancedMesh( b.part.geometry, m, b.mats.length );
		b.mats.forEach( ( mm, i ) => im.setMatrixAt( i, mm ) );
		im.castShadow = false; im.receiveShadow = true;
		im.computeBoundingSphere();
		im.name = 'phveg';
		group.add( im );

	}

	// —— 4. 地面碎屑：落叶（团状）、纸张、报纸 —— 依堆积物与路缘分布 ——
	const { map: lt, alphaMap: la } = makeLitterTexture();
	const lmat = new THREE.MeshStandardNodeMaterial( { map: lt, alphaMap: la, alphaTest: 0.4, roughness: 0.85, side: THREE.DoubleSide } );
	const litter = [ [], [], [], [] ];
	for ( let i = 0; i < 14000; i ++ ) {

		const x = ( r() - 0.5 ) * 64, z = 40 - r() * 160;
		if ( blocked( x, z ) ) continue;
		const g = sampleGM( x, z );
		const p = 0.09 + ( z > 10 && Math.abs( x ) < 7 ? 0.12 : 0 ) + g.acc * 0.7 + ( nearFoot( x, z, 1.5 ) ? 0.25 : 0 ) + Math.max( 0, 0.1 - g.crack ) * 3;
		if ( r() > p || g.dep > 0.6 ) continue;
		const k = r() < 0.18 ? Math.floor( r() * 2 ) : 2 + Math.floor( r() * 2 );
		const s = k < 2 ? 0.22 + r() * 0.18 : 0.45 + r() * 0.5;
		// 纸张：略微卷曲（绕 x 小角度），落叶：平贴
		litter[ k ].push( mat4( x, groundY( x, z ) + 0.008 + r() * 0.004, z, - Math.PI / 2 + ( k < 2 ? ( r() - 0.5 ) * 0.15 : 0 ), r() * 6.28, 0, s, s, s, 'YXZ' ) );

	}

	litter.forEach( ( list, q ) => {

		const g = new THREE.PlaneGeometry( 1, 1 );
		const uvA = g.attributes.uv;
		for ( let i = 0; i < uvA.count; i ++ ) uvA.setXY( i, ( q % 2 ) * 0.5 + uvA.getX( i ) * 0.5, 1 - Math.floor( q / 2 ) * 0.5 - ( 1 - uvA.getY( i ) ) * 0.5 );
		// 平面默认朝 +z，绕 x 转 -90° 后朝 +y
		const im = new THREE.InstancedMesh( g, lmat, list.length );
		list.forEach( ( m, i ) => im.setMatrixAt( i, m ) );
		im.receiveShadow = true;
		im.name = 'litter';
		group.add( im );

	} );

	return group;

}
