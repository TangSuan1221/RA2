// 道具：程序化书本（3 种几何变体，实例化）、展示柜台、收银机、纸张（卷曲 + 接触阴影）、海报
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
	vec2, vec3, vec4, float, mix, smoothstep, attribute, positionWorld, positionGeometry, normalGeometry, uv, texture,
	mx_noise_float, hash, instanceIndex, luminance,
} from 'three/tsl';
import { rng } from './kit.js';

const n01 = ( p ) => mx_noise_float( p ).mul( 0.5 ).add( 0.5 );

// 盒子 + 每顶点 aPage（1 = 书页）
function pageBox( w, h, d, cx, cy, cz, pageFn ) {

	const g = new THREE.BoxGeometry( w, h, d );
	g.translate( cx, cy, cz );
	const n = g.attributes.normal, a = new Float32Array( n.count );
	for ( let i = 0; i < n.count; i ++ ) a[ i ] = pageFn( n.getX( i ), n.getY( i ), n.getZ( i ) );
	g.setAttribute( 'aPage', new THREE.BufferAttribute( a, 1 ) );
	g.deleteAttribute( 'uv' );
	return g;

}

// 单位书（宽 1 × 高 1 × 深 1，底面 y=0，书脊朝 +z）
function bookGeometries() {

	// 精装：封面板 + 内缩书页块 + 书脊
	const hard = mergeGeometries( [
		pageBox( 0.1, 1, 1, - 0.45, 0.5, 0, () => 0 ),
		pageBox( 0.1, 1, 1, 0.45, 0.5, 0, () => 0 ),
		pageBox( 1, 1, 0.07, 0, 0.5, 0.465, () => 0 ),
		pageBox( 0.82, 0.94, 0.93, 0, 0.5, - 0.035, () => 1 ),
	] );
	// 平装：单盒，顶/底/前切口为书页
	const soft = pageBox( 1, 1, 1, 0, 0.5, 0, ( x, y, z ) => ( Math.abs( y ) > 0.5 || z < - 0.5 ? 1 : 0 ) );
	// 圆脊精装：书脊为半圆柱
	const cyl = new THREE.CylinderGeometry( 0.5, 0.5, 1, 8, 1, false, 0, Math.PI );
	cyl.rotateY( Math.PI / 2 ); cyl.scale( 1, 1, 0.16 ); cyl.translate( 0, 0.5, 0.44 );
	cyl.deleteAttribute( 'uv' );
	cyl.setAttribute( 'aPage', new THREE.BufferAttribute( new Float32Array( cyl.attributes.position.count ), 1 ) );
	const round = mergeGeometries( [
		pageBox( 0.1, 1, 0.92, - 0.45, 0.5, - 0.02, () => 0 ),
		pageBox( 0.1, 1, 0.92, 0.45, 0.5, - 0.02, () => 0 ),
		cyl,
		pageBox( 0.82, 0.94, 0.86, 0, 0.5, - 0.04, () => 1 ),
	].map( ( g ) => ( g.index ? g.toNonIndexed() : g ) ) );
	return [ hard, soft, round ];

}

function bookMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.85, metalness: 0 } );
	const col = attribute( 'aCol', 'vec3' );
	const page = attribute( 'aPage', 'float' );
	const g = positionGeometry;
	// 书页：泛黄 + 横纹（纸张叠层）
	const pageC = vec3( 0.48, 0.42, 0.31 ).mul( mix( float( 0.75 ), float( 1.0 ), n01( g.mul( vec3( 3, 260, 3 ) ) ) ) );
	// 书脊烫金/色带
	const spine = smoothstep( 0.4, 0.6, normalGeometry.z );
	const band = smoothstep( 0.0, 0.01, g.y.sub( 0.1 ).abs().sub( 0.025 ).negate() ).max( smoothstep( 0.0, 0.01, g.y.sub( 0.84 ).abs().sub( 0.02 ).negate() ) );
	let c = col.mul( float( 1 ).add( band.mul( spine ).mul( 0.6 ) ) );
	// 褪色与污渍：书脊被阳光晒褪色（顶部更浅），世界噪声
	const wear = n01( positionWorld.mul( 23 ) );
	c = mix( c, vec3( luminance( c ) ).mul( 1.2 ), wear.mul( 0.35 ) );
	c = c.mul( mix( float( 0.7 ), float( 1.05 ), n01( positionWorld.mul( 61 ) ) ) );
	m.colorNode = mix( c, pageC, page );
	m.roughnessNode = mix( float( 0.65 ), float( 0.95 ), page.max( wear.mul( 0.5 ) ) );
	return m;

}

/**
 * 书本收集器：put(矩阵, 颜色, 变体)；矩阵已含书本尺寸缩放
 */
export class Books {

	constructor( seed = 9 ) {

		this.r = rng( seed );
		this.items = [ [], [], [] ];
		this.palette = [ 0x4a2a1e, 0x283846, 0x5a4a2a, 0x3c2224, 0x253224, 0x6a5a40, 0x7a6a50, 0x2a2a2e, 0x5c3a26, 0x3a4a3a, 0x6e2e22, 0x8a7a5a ].map( ( c ) => new THREE.Color( c ) );
		this._o = new THREE.Object3D();

	}

	color() {

		const r = this.r;
		return this.palette[ Math.floor( r() * this.palette.length ) ].clone().multiplyScalar( 0.55 + r() * 0.6 );

	}

	put( m, col = this.color(), v = null ) {

		const r = this.r;
		this.items[ v ?? ( r() < 0.55 ? 0 : r() < 0.6 ? 1 : 2 ) ].push( [ m, col ] );

	}

	/**
	 * 在书架一层上排书：M = 该层局部坐标（x 沿书架，y 向上，书脊朝 +z，z=0 为层板前沿）
	 * width 可用宽度，maxH 层高，fill 填充率
	 */
	shelfRow( M, width, maxH, depth, fill = 0.8 ) {

		const r = this.r;
		let x = - width / 2 + 0.01;
		const end = width / 2 - 0.01;
		while ( x < end ) {

			if ( r() > fill ) { x += 0.05 + r() * 0.25; continue; }
			const roll = r();
			const run = 3 + Math.floor( r() * 14 ); // 一套书：同色同高
			const col = this.color(), bh = Math.min( maxH - 0.02, 0.17 + r() * 0.13 ), bd = Math.min( depth - 0.02, 0.13 + r() * 0.08 );
			const v = r() < 0.55 ? 0 : r() < 0.6 ? 1 : 2;
			if ( roll < 0.1 ) {

				// 平放的一摞
				const n = 2 + Math.floor( r() * 5 );
				const bw = 0.16 + r() * 0.08;
				if ( x + bw > end ) break;
				let y = 0;
				for ( let i = 0; i < n; i ++ ) {

					const t = 0.025 + r() * 0.03;
					const m = M.clone().multiply( new THREE.Matrix4().compose( new THREE.Vector3( x + bw / 2, y + t, - bd / 2 - 0.01 ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, ( r() - 0.5 ) * 0.2, Math.PI / 2 ) ), new THREE.Vector3( t, bw, bd ) ) );
					this.put( m, this.color(), v );
					y += t;
					if ( y > maxH - 0.05 ) break;

				}

				x += bw + 0.01;
				continue;

			}

			for ( let i = 0; i < run; i ++ ) {

				const bw = 0.022 + r() * 0.03;
				const h = bh * ( 0.92 + r() * 0.08 );
				if ( x + bw > end ) break;
				const m = M.clone().multiply( new THREE.Matrix4().compose( new THREE.Vector3( x + bw / 2, 0, - bd / 2 - 0.005 - r() * 0.015 ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, ( r() - 0.5 ) * 0.06, 0 ) ), new THREE.Vector3( bw, h, bd ) ) );
				this.put( m, col.clone().multiplyScalar( 0.9 + r() * 0.2 ), v );
				x += bw + 0.001;

			}

			// 一套书末尾：偶尔有一本斜靠在前一本上（以左下角为支点，顶部靠向 -x）
			if ( r() < 0.3 ) {

				const a = 0.25 + r() * 0.35, bw = 0.025 + r() * 0.025, h = Math.min( maxH - 0.03, bh );
				const x0 = x + h * Math.sin( a );
				if ( x0 + bw * Math.cos( a ) < end ) {

					const m = M.clone().multiply( new THREE.Matrix4().compose( new THREE.Vector3( x0, 0, - bd / 2 - 0.01 ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, 0, a ) ), new THREE.Vector3( bw, h, bd ) ) ).multiply( new THREE.Matrix4().makeTranslation( 0.5, 0, 0 ) );
					this.put( m, this.color(), v );
					x = x0 + bw * Math.cos( a ) + 0.01;

				}

				x += 0.03 + r() * 0.15;

			}

		}

	}

	build() {

		const group = new THREE.Group();
		const mat = bookMaterial();
		bookGeometries().forEach( ( g, k ) => {

			const list = this.items[ k ];
			if ( ! list.length ) return;
			const cols = new Float32Array( list.length * 3 );
			list.forEach( ( [ , c ], i ) => c.toArray( cols, i * 3 ) );
			g.setAttribute( 'aCol', new THREE.InstancedBufferAttribute( cols, 3 ) );
			const mesh = new THREE.InstancedMesh( g, mat, list.length );
			list.forEach( ( [ m ], i ) => mesh.setMatrixAt( i, m ) );
			mesh.castShadow = mesh.receiveShadow = true;
			mesh.computeBoundingSphere();
			group.add( mesh );

		} );
		group.userData.count = this.items.reduce( ( a, l ) => a + l.length, 0 );
		return group;

	}

}

// —— 纸张：卷曲几何 + 印刷纹理 + 污渍；下方接触阴影贴花 ——
function paperTexture() {

	const c = document.createElement( 'canvas' );
	c.width = 512; c.height = 256;
	const g = c.getContext( '2d' );
	const r = rng( 77 );
	for ( let k = 0; k < 4; k ++ ) {

		const ox = ( k % 4 ) * 128;
		g.fillStyle = [ '#d8cfba', '#cfc2a2', '#e0d8c4', '#c8b894' ][ k ];
		g.fillRect( ox, 0, 128, 256 );
		g.fillStyle = 'rgba(40,34,28,0.55)';
		// 标题 + 文字行
		g.fillRect( ox + 14, 18, 60 + r() * 40, 10 );
		for ( let y = 40; y < 236; y += 7 ) {

			if ( r() < 0.12 ) { y += 8; continue; }
			g.fillRect( ox + 12, y, 100 * ( 0.6 + r() * 0.4 ), 2.4 );

		}

		if ( k === 1 ) { g.fillStyle = 'rgba(60,50,40,0.5)'; g.fillRect( ox + 20, 60, 86, 60 ); }
		// 水渍
		for ( let i = 0; i < 3; i ++ ) {

			const x = ox + r() * 128, y = r() * 256, rr = 10 + r() * 30;
			const gr = g.createRadialGradient( x, y, rr * 0.6, x, y, rr );
			gr.addColorStop( 0, 'rgba(120,90,50,0.12)' ); gr.addColorStop( 0.85, 'rgba(110,80,40,0.35)' ); gr.addColorStop( 1, 'rgba(110,80,40,0)' );
			g.fillStyle = gr; g.fillRect( x - rr, y - rr, rr * 2, rr * 2 );

		}

	}

	const t = new THREE.CanvasTexture( c );
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 8;
	return t;

}

export function papers( list ) {

	const r = rng( 31 );
	const tex = paperTexture();
	const geos = [], shadows = [];
	for ( const [ x, y, z, ry, s = 1 ] of list ) {

		const w = 0.21 * s, h = 0.29 * s;
		const g = new THREE.PlaneGeometry( w, h, 6, 6 );
		g.rotateX( - Math.PI / 2 );
		// 卷曲：边缘翘起（受潮翘边）+ 轻微对折
		const p = g.attributes.position, u = g.attributes.uv;
		const k = Math.floor( r() * 4 ), curl = 0.01 + r() * 0.03, fold = ( r() - 0.5 ) * 0.02;
		for ( let i = 0; i < p.count; i ++ ) {

			const px = p.getX( i ), pz = p.getZ( i );
			const ex = Math.abs( px ) / ( w / 2 ), ez = Math.abs( pz ) / ( h / 2 );
			p.setY( i, Math.pow( Math.max( ex, ez ), 3 ) * curl + Math.abs( px ) * fold * 2 + 0.002 );
			u.setX( i, ( u.getX( i ) + k ) / 4 );

		}

		g.computeVertexNormals();
		g.applyMatrix4( new THREE.Matrix4().compose( new THREE.Vector3( x, y, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, ry, 0 ) ), new THREE.Vector3( 1, 1, 1 ) ) );
		geos.push( g );
		const sg = new THREE.PlaneGeometry( w * 1.25, h * 1.2 );
		sg.rotateX( - Math.PI / 2 );
		sg.applyMatrix4( new THREE.Matrix4().compose( new THREE.Vector3( x, y + 0.0008, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, ry, 0 ) ), new THREE.Vector3( 1, 1, 1 ) ) );
		shadows.push( sg );

	}

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.9, side: THREE.DoubleSide } );
	const tc = texture( tex, uv() ).rgb;
	// 反照率约 0.45~0.6（旧纸），不是纯白
	m.colorNode = tc.mul( 0.62 ).mul( mix( float( 0.8 ), float( 1.0 ), n01( positionWorld.mul( 14 ) ) ) );
	const mesh = new THREE.Mesh( mergeGeometries( geos ), m );
	mesh.castShadow = true; mesh.receiveShadow = true;
	const sm = new THREE.MeshBasicNodeMaterial( { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: - 2 } );
	const d = uv().sub( 0.5 ).abs().mul( 2 );
	sm.colorNode = vec4( 0, 0, 0, smoothstep( 1.0, 0.6, d.x.max( d.y ) ).mul( 0.55 ) );
	const sh = new THREE.Mesh( mergeGeometries( shadows ), sm );
	sh.renderOrder = 1;
	const group = new THREE.Group();
	group.add( sh, mesh );
	return group;

}

// —— 海报：画布生成（褪色印刷 + 折痕 + 撕角）——
export function posterTexture( kind = 0 ) {

	const c = document.createElement( 'canvas' );
	c.width = 256; c.height = 384;
	const g = c.getContext( '2d' );
	const r = rng( 100 + kind );
	const bg = [ '#7a3a26', '#2f4a5a', '#c8b48a', '#3c4a2e' ][ kind % 4 ];
	g.fillStyle = bg; g.fillRect( 0, 0, 256, 384 );
	g.fillStyle = 'rgba(230,215,180,0.85)';
	g.font = 'bold 44px Georgia, serif';
	g.textAlign = 'center';
	const words = [ [ 'READ', 'MORE' ], [ 'BOOK', 'FAIR' ], [ 'NEW', 'TITLES' ], [ 'LOCAL', 'AUTHORS' ] ][ kind % 4 ];
	g.fillText( words[ 0 ], 128, 80 );
	g.font = 'bold 34px Georgia, serif';
	g.fillText( words[ 1 ], 128, 124 );
	g.fillStyle = 'rgba(20,16,12,0.5)';
	g.beginPath(); g.arc( 128, 236, 62, 0, Math.PI * 2 ); g.fill();
	g.fillStyle = 'rgba(230,215,180,0.6)';
	for ( let y = 320; y < 370; y += 10 ) g.fillRect( 40, y, 176 * ( 0.6 + r() * 0.4 ), 4 );
	// 褪色、水渍、折痕
	const grd = g.createLinearGradient( 0, 0, 0, 384 );
	grd.addColorStop( 0, 'rgba(200,190,160,0.25)' ); grd.addColorStop( 1, 'rgba(60,40,20,0.35)' );
	g.fillStyle = grd; g.fillRect( 0, 0, 256, 384 );
	g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect( 0, 190, 256, 2 ); g.fillRect( 127, 0, 2, 384 );
	// 撕掉的角（透明）
	g.globalCompositeOperation = 'destination-out';
	g.beginPath(); g.moveTo( 256, 384 ); g.lineTo( 256 - 40 - r() * 50, 384 ); g.lineTo( 256, 384 - 40 - r() * 60 ); g.fill();
	const t = new THREE.CanvasTexture( c );
	t.colorSpace = THREE.SRGBColorSpace;
	return t;

}

export function posterMesh( kind, w, h ) {

	const t = posterTexture( kind );
	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.9, alphaTest: 0.5, side: THREE.DoubleSide } );
	const s = texture( t, uv() );
	m.colorNode = vec4( s.rgb.mul( mix( float( 0.55 ), float( 0.8 ), n01( positionWorld.mul( 9 ) ) ) ), s.a );
	const g = new THREE.PlaneGeometry( w, h, 4, 6 );
	// 轻微起伏（受潮鼓包）
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) p.setZ( i, Math.sin( p.getX( i ) * 9 + p.getY( i ) * 5 ) * 0.004 + 0.004 );
	g.computeVertexNormals();
	const mesh = new THREE.Mesh( g, m );
	mesh.receiveShadow = true; mesh.castShadow = false;
	return mesh;

}

// 金属漆面（收集机、罐子）：漆色 + 锈斑
export function paintedMetal( base = 0x3a463e ) {

	const m = new THREE.MeshStandardNodeMaterial( { roughness: 0.6, metalness: 0.3 } );
	const n = n01( positionWorld.mul( 18 ) ), n2 = n01( positionWorld.mul( 70 ) );
	const rust = smoothstep( 0.6, 0.8, n.mul( 0.7 ).add( n2.mul( 0.3 ) ) );
	m.colorNode = mix( vec3( ...new THREE.Color( base ).toArray() ).mul( mix( float( 0.8 ), float( 1.1 ), n2 ) ), vec3( 0.2, 0.1, 0.05 ), rust );
	m.roughnessNode = mix( float( 0.5 ), float( 0.95 ), rust );
	m.metalnessNode = mix( float( 0.4 ), float( 0.0 ), rust );
	return m;

}

export { hash, instanceIndex };

