// 苔藓小巷：右侧凹槽护墙板高墙 + 厚苔藓（遮罩 = 凹槽空腔 + 顶部滴水 + fbm）+ 苔藓团 + 落水管 + 屋顶
// 坐标：+Y 上；巷子沿 -Z 方向延伸；右侧苔藓墙面在 x = L.WALL_X（朝 -X）
import * as THREE from 'three/webgpu';
import { L } from './materials.js';
import { grassClump } from './ground.js';
import { rng, fbm2, noise2, smooth, merge, worldUV, bevelBox, xf, T, dataTex, lumpGeometry, instanced, paint, taperTube, mergeIndexed } from './util.js';

const BOARD = 0.34, GROOVE = 0.026, GDEPTH = 0.016, CH = 0.005;
// 第 k 条凹槽的中心高度
export const grooveY = ( k ) => k * BOARD + BOARD - GROOVE / 2;

export function buildWall( mats ) {

	const H = L.WALL_H;
	const s = new THREE.Shape();
	s.moveTo( 0.35, 0 );
	s.lineTo( 0, 0 );
	let y = 0;
	while ( y + BOARD < H - 0.01 ) {

		const top = y + BOARD - GROOVE;
		s.lineTo( 0, top - CH );
		s.lineTo( CH, top );
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
	for ( let z = L.Z1 + 2; z > L.Z0 - 1; z -= PANEL ) {

		const len = PANEL - SEAM;
		const g = new THREE.ExtrudeGeometry( s, { depth: len, bevelEnabled: false, curveSegments: 1 } );
		g.translate( L.WALL_X, 0, z - len );
		const ng = g.index ? g.toNonIndexed() : g;
		ng.computeVertexNormals();
		worldUV( ng, 2.4 );
		parts.push( ng );

	}

	const group = new THREE.Group();
	const wall = new THREE.Mesh( merge( parts ), mats.wall );
	wall.castShadow = wall.receiveShadow = true;
	group.add( wall );

	// 接缝后面的黑色衬底
	const back = new THREE.Mesh( new THREE.PlaneGeometry( 60, H ), mats.dark );
	back.rotation.y = - Math.PI / 2;
	back.position.set( L.WALL_X + 0.03, H / 2, - 16 );
	group.add( back );

	// 墙顶压顶（挑出 8cm，带滴水槽）
	const cap = bevelBox( 0.52, 0.24, 52, 0.02 );
	xf( cap, T( L.WALL_X + 0.18, H + 0.1, - 17 ) );
	worldUV( cap, 2.0 );
	const capM = new THREE.Mesh( cap, mats.cap );
	capM.castShadow = capM.receiveShadow = true;
	group.add( capM );
	return group;

}

// ———————————————————————— 苔藓遮罩烘焙 + 位移网格 + 苔藓团 ————————————————————————
export function buildMoss( mats, makeMat ) {

	const H = L.WALL_H, LEN = L.Z1 - L.Z0;
	const TW = 2048, TH = 512;
	const mask = new Float32Array( TW * TH );
	const cavity = ( y ) => {

		// 凹槽下方 0~14cm：水沿凹槽积存，苔藓从这里往下长
		const k = Math.floor( ( y - ( BOARD - GROOVE ) ) / BOARD );
		const g = k * BOARD + BOARD - GROOVE / 2;
		const d = y - g; // 正 = 凹槽上方
		const below = d < 0 ? - d : ( y - ( g + BOARD ) ) * - 1;
		const dd = Math.min( Math.abs( d ), Math.abs( y - ( g + BOARD ) ) );
		return Math.max( Math.exp( - Math.pow( dd / 0.03, 2 ) ), d < 0 ? Math.exp( - below / 0.12 ) * 0.7 : 0 );

	};

	for ( let j = 0; j < TH; j ++ ) {

		const y = ( j + 0.5 ) / TH * H;
		const cav = cavity( y );
		for ( let i = 0; i < TW; i ++ ) {

			const z = L.Z0 + ( i + 0.5 ) / TW * LEN;
			const big = fbm2( z * 0.2, y * 0.13 + 3.1, 5 );
			// 顶部滴水遮罩：竖向拉长噪声，从压顶往下衰减
			const dripN = fbm2( z * 1.3 + 40, y * 0.05, 4 );
			const drip = smooth( 0.5, 0.68, dripN ) * smooth( H - 5.5, H - 0.6, y );
			const det = fbm2( z * 3.3, y * 3.3 + 11, 3 );
			// 高度偏好：墙根（藤蔓后面）与中上部
			const hb = 0.08 * smooth( 1.5, 4.0, y ) - 0.1 * smooth( 6.6, 7.2, y ) + 0.08 * smooth( 1.4, 0.3, y );
			const v = big * 0.8 + cav * 0.08 * ( big + 0.2 ) + drip * 0.2 + ( det - 0.5 ) * 0.16 + hb;
			mask[ j * TW + i ] = smooth( 0.40, 0.49, v );

		}

	}

	// 晕染（模糊）与「苔藓下方水痕」（自上而下累积衰减）
	const blur = boxBlur( mask, TW, TH, 10 );
	const below = new Float32Array( TW * TH );
	for ( let i = 0; i < TW; i ++ ) {

		let acc = 0;
		for ( let j = TH - 1; j >= 0; j -- ) {

			const k = j * TW + i;
			acc = Math.max( acc * 0.988, mask[ k ] );
			below[ k ] = acc * ( 1 - mask[ k ] );

		}

	}

	const tex = dataTex( TW, TH, ( d ) => {

		for ( let k = 0; k < TW * TH; k ++ ) {

			d[ k * 4 ] = mask[ k ] * 255;
			d[ k * 4 + 1 ] = Math.min( 1, blur[ k ] * 1.5 ) * 255;
			d[ k * 4 + 2 ] = below[ k ] * 255;
			d[ k * 4 + 3 ] = 255;

		}

	} );

	const sampleM = ( z, y ) => {

		const fx = ( z - L.Z0 ) / LEN * TW - 0.5, fy = y / H * TH - 0.5;
		const ix = Math.max( 0, Math.min( TW - 2, Math.floor( fx ) ) ), iy = Math.max( 0, Math.min( TH - 2, Math.floor( fy ) ) );
		const tx = Math.min( 1, Math.max( 0, fx - ix ) ), ty = Math.min( 1, Math.max( 0, fy - iy ) );
		const a = mask[ iy * TW + ix ], b = mask[ iy * TW + ix + 1 ], c = mask[ ( iy + 1 ) * TW + ix ], d = mask[ ( iy + 1 ) * TW + ix + 1 ];
		return ( a * ( 1 - tx ) + b * tx ) * ( 1 - ty ) + ( c * ( 1 - tx ) + d * tx ) * ty;

	};

	// 位移网格：4cm 网格，只在有苔藓的格子生成三角形；厚度 = 垫状鼓包 + 凹槽下方更厚
	const STEP = 0.04;
	const NZ = Math.ceil( LEN / STEP ), NY = Math.ceil( H / STEP );
	const pos = [], idx = [], uvs = [], vm = [];
	const vid = new Int32Array( ( NZ + 1 ) * ( NY + 1 ) ).fill( - 1 );
	const mv = new Float32Array( ( NZ + 1 ) * ( NY + 1 ) );
	for ( let j = 0; j <= NY; j ++ ) for ( let i = 0; i <= NZ; i ++ ) mv[ j * ( NZ + 1 ) + i ] = sampleM( L.Z1 - i * STEP, Math.min( H - 0.02, j * STEP ) );
	const vert = ( i, j ) => {

		const k = j * ( NZ + 1 ) + i;
		if ( vid[ k ] >= 0 ) return vid[ k ];
		const z = L.Z1 - i * STEP, y = Math.min( H - 0.02, j * STEP );
		const m = mv[ k ];
		const lump = fbm2( z * 5.0, y * 5.0 + 5, 3 );
		const cav = cavity( y );
		const th = Math.pow( m, 0.55 ) * ( 0.02 + 0.075 * lump * lump + 0.025 * cav ) - 0.006;
		// 厚苔藓略微下垂
		pos.push( L.WALL_X - th, y - th * 0.4, z );
		uvs.push( z, y );
		vm.push( m * ( 0.4 + lump ) );
		vid[ k ] = pos.length / 3 - 1;
		return vid[ k ];

	};

	for ( let j = 0; j < NY; j ++ ) {

		for ( let i = 0; i < NZ; i ++ ) {

			const a = mv[ j * ( NZ + 1 ) + i ], b = mv[ j * ( NZ + 1 ) + i + 1 ], c = mv[ ( j + 1 ) * ( NZ + 1 ) + i ], d = mv[ ( j + 1 ) * ( NZ + 1 ) + i + 1 ];
			if ( Math.max( a, b, c, d ) < 0.02 ) continue;
			const v00 = vert( i, j ), v10 = vert( i + 1, j ), v01 = vert( i, j + 1 ), v11 = vert( i + 1, j + 1 );
			idx.push( v00, v01, v10, v10, v01, v11 );

		}

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	const mesh = new THREE.Mesh( g, makeMat( tex ) );
	mesh.castShadow = true;
	mesh.receiveShadow = true;

	const r = rng( 404 );
	const lumps = [ lumpGeometry( 11, 1, 0.55 ), lumpGeometry( 12, 1, 0.7 ), lumpGeometry( 13, 1, 0.5 ) ];
	const lists = lumps.map( () => ( { m: [], c: [] } ) );
	const q = new THREE.Quaternion(), e = new THREE.Euler();

	// —— 苔藓壳层（fuzz shells）：同一网格沿法线外推 0.5/1.0/1.5cm，alphaTest 按「绒毛噪声 × 厚度」镂空 ——
	// 只在厚苔藓处保留，形成毛茸茸的轮廓与层间自遮蔽
	const shellList = [];
	const sIdx = [];
	for ( let i = 0; i < idx.length; i += 3 ) if ( Math.min( vm[ idx[ i ] ], vm[ idx[ i + 1 ] ], vm[ idx[ i + 2 ] ] ) > 0.62 ) sIdx.push( idx[ i ], idx[ i + 1 ], idx[ i + 2 ] );
	for ( let s2 = 1; s2 <= 2; s2 ++ ) {

		const sg = new THREE.BufferGeometry();
		const src = g.attributes.position, nn = g.attributes.normal;
		const pa = new Float32Array( src.count * 3 ), ca = new Float32Array( src.count * 3 );
		const k = 0.007 * s2;
		for ( let i = 0; i < src.count; i ++ ) {

			pa[ i * 3 ] = src.getX( i ) + nn.getX( i ) * k; pa[ i * 3 + 1 ] = src.getY( i ) + nn.getY( i ) * k; pa[ i * 3 + 2 ] = src.getZ( i ) + nn.getZ( i ) * k;
			ca[ i * 3 ] = s2 / 2;

		}

		sg.setAttribute( 'position', new THREE.BufferAttribute( pa, 3 ) );
		sg.setAttribute( 'normal', nn.clone() );
		sg.setAttribute( 'uv', g.attributes.uv.clone() );
		sg.setAttribute( 'color', new THREE.BufferAttribute( ca, 3 ) );
		sg.setIndex( sIdx );
		shellList.push( sg );

	}

	// 压顶上沿的苔藓垫（俯视可见）
	for ( let z = L.Z1 + 1; z > L.Z0 - 1; z -= 0.05 + r() * 0.05 ) {

		const k = fbm2( z * 0.4, 7.7, 3 );
		if ( k < 0.36 ) continue;
		// 连续的苔藓垫：每 5~10cm 两三团相互重叠，铺满压顶宽度的一部分
		for ( let t = 0; t < 3; t ++ ) {

			if ( r() > ( k - 0.3 ) * 2.5 ) continue;
			const li = Math.floor( r() * lumps.length );
			const s = 0.08 + r() * 0.1;
			lists[ li ].m.push( new THREE.Matrix4().compose( new THREE.Vector3( L.WALL_X + 0.02 + r() * 0.44, H + 0.205, z + ( r() - 0.5 ) * 0.06 ), q.setFromEuler( e.set( 0, r() * 6, 0 ) ), new THREE.Vector3( s, s * 0.28, s * 1.5 ) ) );
			const c = new THREE.Color().setRGB( 0.07 + r() * 0.04, 0.1 + r() * 0.04, 0.03 );
			if ( r() < 0.15 ) c.setRGB( 0.11, 0.1, 0.05 );
			lists[ li ].c.push( c );

		}

	}

	const clumps = new THREE.Group();
	let count = 0;
	lumps.forEach( ( lg, i ) => { count += lists[ i ].m.length; if ( lists[ i ].m.length ) clumps.add( instanced( lg, mats.mossClump, lists[ i ].m, lists[ i ].c, { cast: true } ) ); } );

	const shells = new THREE.Mesh( mergeIndexed( shellList ), mats.mossShell( tex ) );
	shells.receiveShadow = true;
	return { mesh, clumps, shells, tex, sampleM, clumpCount: count, lumps };

}

function boxBlur( src, w, h, r ) {

	const tmp = new Float32Array( w * h ), out = new Float32Array( w * h );
	for ( let y = 0; y < h; y ++ ) {

		let s = 0;
		const row = y * w;
		for ( let x = - r; x <= r; x ++ ) s += src[ row + Math.min( w - 1, Math.max( 0, x ) ) ];
		for ( let x = 0; x < w; x ++ ) {

			tmp[ row + x ] = s / ( 2 * r + 1 );
			s += src[ row + Math.min( w - 1, x + r + 1 ) ] - src[ row + Math.max( 0, x - r ) ];

		}

	}

	for ( let x = 0; x < w; x ++ ) {

		for ( let y = 0; y < h; y ++ ) {

			// 竖向模糊偏向下方（水把藻类往下带）
			let s = 0, n = 0;
			for ( let k = - r; k <= r * 3; k += 2 ) { const yy = y + k; if ( yy >= 0 && yy < h ) { s += tmp[ yy * w + x ]; n ++; } }
			out[ y * w + x ] = s / n;

		}

	}

	return out;

}

// ———————————————————————— 落水管（锈蚀）+ 墙面电箱/线管 + 涂鸦 ————————————————————————
export function buildWallDressing( mats ) {

	const H = L.WALL_H;
	const pipes = [], brackets = [];
	const X = L.WALL_X - 0.09;
	for ( const z of L.PIPES ) {

		// 竖管 + 顶部鹅颈弯接天沟 + 底部出水弯头
		const pts = [ new THREE.Vector3( X - 0.12, 0.2, z ), new THREE.Vector3( X - 0.02, 0.32, z ), new THREE.Vector3( X, 0.5, z ), new THREE.Vector3( X, H - 0.55, z ), new THREE.Vector3( X + 0.04, H - 0.3, z ), new THREE.Vector3( X + 0.25, H - 0.12, z ), new THREE.Vector3( X + 0.3, H + 0.15, z ) ];
		const c = new THREE.CatmullRomCurve3( pts, false, 'catmullrom', 0.1 );
		pipes.push( new THREE.TubeGeometry( c, 64, 0.048, 10, false ) );
		for ( let y = 1.0; y < H - 0.6; y += 1.75 ) {

			const b = new THREE.TorusGeometry( 0.053, 0.008, 4, 14 );
			b.rotateX( Math.PI / 2 );
			b.translate( X, y, z );
			brackets.push( b );
			const plate = new THREE.BoxGeometry( 0.06, 0.012, 0.03 );
			plate.translate( X + 0.065, y, z );
			brackets.push( plate );

		}

		// 管子接口套环
		for ( let y = 2.2; y < H - 0.6; y += 2.2 ) {

			const s = new THREE.CylinderGeometry( 0.054, 0.054, 0.07, 12 );
			s.translate( X, y, z );
			brackets.push( s );

		}

	}

	const group = new THREE.Group();
	const pm = new THREE.Mesh( mergeIndexed( [ ...pipes, ...brackets.map( ( b ) => b.index ? b : b ) ] ), mats.pipe );
	pm.castShadow = pm.receiveShadow = true;
	group.add( pm );

	// 电箱 + 线管（墙上，z≈-11）
	const box = [];
	const eb = bevelBox( 0.16, 0.62, 0.48, 0.012 );
	xf( eb, T( L.WALL_X - 0.085, 1.55, - 11.2 ) );
	box.push( eb );
	const eb2 = bevelBox( 0.12, 0.34, 0.3, 0.01 );
	xf( eb2, T( L.WALL_X - 0.065, 1.45, - 11.75 ) );
	box.push( eb2 );
	const conduits = [];
	for ( const [ dz, y0 ] of [ [ - 0.12, 1.86 ], [ 0.1, 1.86 ], [ - 0.55, 1.62 ] ] ) {

		const pts = [];
		for ( let y = y0; y < H + 0.1; y += 0.25 ) pts.push( new THREE.Vector3( L.WALL_X - 0.03, y, - 11.2 + dz ) );
		conduits.push( new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts ), 24, 0.016, 6, false ) );

	}

	const ebm = new THREE.Mesh( merge( box ), mats.metalBox );
	ebm.castShadow = ebm.receiveShadow = true;
	group.add( ebm );
	const cm = new THREE.Mesh( mergeIndexed( conduits ), mats.pipe );
	cm.castShadow = true;
	group.add( cm );

	// 喷漆标记：WLF 狼头符号 + 天疤人（Seraphite）圆环记号
	const decal = new THREE.Mesh( new THREE.PlaneGeometry( 1.6, 0.8 ), mats.graffiti );
	decal.rotation.y = - Math.PI / 2;
	decal.position.set( L.WALL_X - 0.003, 1.75, - 7.3 );
	group.add( decal );
	return group;

}

// 涂鸦贴图（Canvas 绘制，带喷漆飞溅与褪色）
export function graffitiTexture() {

	const cv = document.createElement( 'canvas' );
	cv.width = 1024; cv.height = 512;
	const c = cv.getContext( '2d' );
	const r = rng( 9 );
	c.clearRect( 0, 0, 1024, 512 );
	const spray = ( draw, col, w ) => {

		c.save();
		c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
		c.shadowColor = col; c.shadowBlur = 10;
		c.beginPath(); draw(); c.stroke();
		c.restore();

	};

	// 「WLF」字母（手写喷漆）
	const red = 'rgba(150,40,30,0.9)';
	spray( () => {

		c.moveTo( 80, 150 ); c.lineTo( 120, 370 ); c.lineTo( 170, 220 ); c.lineTo( 215, 370 ); c.lineTo( 260, 150 );
		c.moveTo( 320, 150 ); c.lineTo( 315, 370 ); c.lineTo( 420, 365 );
		c.moveTo( 480, 370 ); c.lineTo( 485, 150 ); c.lineTo( 590, 155 ); c.moveTo( 482, 255 ); c.lineTo( 560, 258 );

	}, red, 26 );
	// 流挂
	for ( let i = 0; i < 9; i ++ ) {

		const x = 90 + r() * 500, y = 360 + r() * 10;
		spray( () => { c.moveTo( x, y ); c.lineTo( x + ( r() - 0.5 ) * 4, y + 30 + r() * 90 ); }, 'rgba(130,35,25,0.7)', 5 );

	}

	// 天疤人记号：圆圈 + 竖划（白漆，褪色）
	spray( () => { c.arc( 800, 250, 110, 0, Math.PI * 2 ); }, 'rgba(200,200,190,0.55)', 16 );
	spray( () => { c.moveTo( 800, 120 ); c.lineTo( 800, 390 ); c.moveTo( 735, 200 ); c.lineTo( 865, 300 ); }, 'rgba(200,200,190,0.5)', 14 );
	// 飞溅点
	for ( let i = 0; i < 1600; i ++ ) {

		const x = r() * 1024, y = r() * 512;
		c.fillStyle = r() < 0.6 ? 'rgba(150,40,30,0.35)' : 'rgba(200,200,190,0.25)';
		c.fillRect( x, y, 1.5, 1.5 );

	}

	// 褪色擦除：随机块状降低 alpha
	c.globalCompositeOperation = 'destination-out';
	for ( let i = 0; i < 260; i ++ ) {

		c.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.4})`;
		c.beginPath(); c.arc( r() * 1024, r() * 512, 8 + r() * 40, 0, Math.PI * 2 ); c.fill();

	}

	const t = new THREE.CanvasTexture( cv );
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 8;
	return t;

}

// ———————————————————————— 右侧屋顶：女儿墙、卷材、砾石、空调机组、通风帽、积水、角落苔藓 ————————————————————————
export function buildRoof( mats, mossLumps ) {

	const H = L.WALL_H;
	const r = rng( 77 );
	const RX0 = L.WALL_X + 0.35, RX1 = L.WALL_X + 13, RZ0 = - 44, RZ1 = 10;
	const group = new THREE.Group();
	// 屋面（细分以写入「近女儿墙」顶点色）
	const NXs = 52, NZs = 216;
	const roof = new THREE.PlaneGeometry( RX1 - RX0, RZ1 - RZ0, NXs, NZs );
	roof.rotateX( - Math.PI / 2 );
	roof.translate( ( RX0 + RX1 ) / 2, H + 0.02, ( RZ0 + RZ1 ) / 2 );
	const p = roof.attributes.position;
	const col = new Float32Array( p.count * 3 );
	for ( let i = 0; i < p.count; i ++ ) {

		const x = p.getX( i ), z = p.getZ( i );
		const d = Math.min( x - RX0, RX1 - x );
		col[ i * 3 + 1 ] = smooth( 0.9, 0.0, d ) * 0.9 + smooth( 0.5, 0.0, Math.abs( ( z + 21 ) ) ) * 0.4;
		// 屋面微起伏（积水低洼）
		p.setY( i, H + 0.02 - 0.03 * fbm2( x * 0.35, z * 0.35, 3 ) );

	}

	roof.setAttribute( 'color', new THREE.BufferAttribute( col, 3 ) );
	roof.computeVertexNormals();
	const roofM = new THREE.Mesh( roof, mats.roof );
	roofM.receiveShadow = true;
	group.add( roofM );

	// 女儿墙：远侧 + 一道伸缩缝矮墙
	const par = [];
	const pw = bevelBox( 0.3, 0.9, RZ1 - RZ0, 0.02 );
	xf( pw, T( RX1 + 0.15, H + 0.45, ( RZ0 + RZ1 ) / 2 ) );
	par.push( worldUV( pw, 2 ) );
	const pc = bevelBox( 0.42, 0.08, RZ1 - RZ0, 0.015 );
	xf( pc, T( RX1 + 0.15, H + 0.94, ( RZ0 + RZ1 ) / 2 ) );
	par.push( worldUV( pc, 2 ) );
	const jw = bevelBox( RX1 - RX0, 0.28, 0.35, 0.02 );
	xf( jw, T( ( RX0 + RX1 ) / 2, H + 0.14, - 21 ) );
	par.push( worldUV( jw, 2 ) );
	// 楼梯间小屋
	const stair = bevelBox( 3.2, 2.6, 3.6, 0.03 );
	xf( stair, T( RX0 + 8.5, H + 1.3, - 30 ) );
	par.push( worldUV( stair, 2 ) );
	const pm = new THREE.Mesh( merge( par ), mats.concrete );
	pm.castShadow = pm.receiveShadow = true;
	group.add( pm );

	// 空调机组 / 通风帽 / 管道
	const metal = [], dark = [];
	const hvac = ( x, z, w, h, d, ry ) => {

		const b = bevelBox( w, h, d, 0.025 );
		xf( b, T( x, H + 0.12 + h / 2, z, 0, ry ) );
		metal.push( b );
		// 底座槽钢
		for ( const s of [ - 1, 1 ] ) {

			const rail = bevelBox( w + 0.1, 0.1, 0.08, 0.008 );
			xf( rail, T( x, H + 0.07, z + s * d * 0.38, 0, ry ) );
			metal.push( rail );

		}

		// 顶部风扇格栅（深色圆盘 + 护栏环）
		const nf = w > 1.3 ? 2 : 1;
		for ( let k = 0; k < nf; k ++ ) {

			const ox = nf === 2 ? ( k - 0.5 ) * w * 0.5 : 0;
			const fan = new THREE.CylinderGeometry( Math.min( w, d ) * 0.32, Math.min( w, d ) * 0.32, 0.03, 20 );
			fan.translate( ox, h + 0.005, 0 );
			fan.applyMatrix4( T( x, H + 0.12, z, 0, ry ) );
			dark.push( fan );
			const ring = new THREE.TorusGeometry( Math.min( w, d ) * 0.33, 0.012, 4, 24 );
			ring.rotateX( Math.PI / 2 );
			ring.translate( ox, h + 0.03, 0 );
			ring.applyMatrix4( T( x, H + 0.12, z, 0, ry ) );
			metal.push( ring );

		}

		// 侧面百叶
		for ( let k = 0; k < 6; k ++ ) {

			const l = new THREE.BoxGeometry( 0.02, 0.025, d * 0.7 );
			l.translate( w / 2 + 0.005, h * 0.25 + k * h * 0.09, 0 );
			l.applyMatrix4( T( x, H + 0.12, z, 0.0, ry, - 0.5 ) );
			dark.push( l );

		}

	};

	hvac( RX0 + 3.0, - 6.5, 1.6, 0.9, 1.1, 0.04 );
	hvac( RX0 + 3.2, - 9.2, 1.2, 0.8, 1.0, - 0.03 );
	hvac( RX0 + 6.5, - 15.5, 2.2, 1.2, 1.4, 0.0 );
	hvac( RX0 + 2.6, - 25.5, 1.3, 0.85, 1.0, 0.06 );
	hvac( RX0 + 5.0, 1.0, 1.4, 0.9, 1.0, - 0.05 );
	// 通风帽（蘑菇形）
	for ( const [ x, z ] of [ [ RX0 + 1.4, - 3.2 ], [ RX0 + 5.5, - 12 ], [ RX0 + 1.8, - 18.5 ], [ RX0 + 4.4, - 34 ], [ RX0 + 7.5, - 5 ] ] ) {

		const s = new THREE.CylinderGeometry( 0.09, 0.09, 0.6, 12 );
		s.translate( x, H + 0.3, z );
		metal.push( s );
		const cap = new THREE.ConeGeometry( 0.2, 0.14, 14 );
		cap.translate( x, H + 0.67, z );
		metal.push( cap );
		const fl = new THREE.CylinderGeometry( 0.16, 0.18, 0.05, 14 );
		fl.translate( x, H + 0.04, z );
		dark.push( fl );

	}

	// 管道（支墩上）
	const pp = [ new THREE.Vector3( RX0 + 3.0, H + 0.6, - 7.2 ), new THREE.Vector3( RX0 + 3.0, H + 0.3, - 7.6 ), new THREE.Vector3( RX0 + 4.2, H + 0.3, - 7.6 ), new THREE.Vector3( RX0 + 6.2, H + 0.3, - 14.6 ) ];
	metal.push( new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pp, false, 'catmullrom', 0.05 ), 40, 0.06, 8, false ) );
	for ( let t = 0.15; t < 1; t += 0.25 ) {

		const q = new THREE.Vector3().lerpVectors( pp[ 2 ], pp[ 3 ], t );
		const b = bevelBox( 0.25, 0.22, 0.12, 0.01 );
		xf( b, T( q.x, H + 0.11, q.z ) );
		dark.push( b );

	}

	const mm = new THREE.Mesh( mergeIndexed( metal.map( ( g ) => g ) ), mats.hvac );
	mm.castShadow = mm.receiveShadow = true;
	const dm = new THREE.Mesh( mergeIndexed( dark ), mats.metalDark );
	dm.castShadow = dm.receiveShadow = true;
	group.add( mm, dm );

	// 角落与女儿墙根的苔藓团 + 砾石堆
	const { lumps } = mossLumps;
	const ml = lumps.map( () => ( { m: [], c: [] } ) );
	const add = ( x, z, s, sy, k ) => {

		const li = Math.floor( r() * lumps.length );
		ml[ li ].m.push( new THREE.Matrix4().compose( new THREE.Vector3( x, H + 0.0, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, r() * 6.28, 0 ) ), new THREE.Vector3( s, sy, s * ( 1 + 0.6 * r() ) ) ) );
		ml[ li ].c.push( new THREE.Color().setRGB( ( 0.08 + r() * 0.05 ) * k, ( 0.1 + r() * 0.05 ) * k, 0.026 * k ) );

	};

	for ( let z = RZ1; z > RZ0; z -= 0.08 ) {

		for ( let q = 0; q < 3; q ++ ) {

			if ( fbm2( z * 0.3, 2, 3 ) > 0.4 ) add( RX1 - 0.03 - Math.pow( r(), 2.5 ) * 0.9, z + r() * 0.08, 0.03 + r() * 0.07, 0.02 + r() * 0.03, 1.3 );
			if ( fbm2( z * 0.3, 8, 3 ) > 0.45 ) add( RX0 + 0.03 + Math.pow( r(), 2.5 ) * 0.8, z + r() * 0.08, 0.03 + r() * 0.06, 0.02 + r() * 0.03, 1.2 );

		}

	}

	for ( let x = RX0; x < RX1; x += 0.03 ) if ( r() < 0.7 ) add( x, - 21 + ( r() < 0.5 ? - 0.2 : 0.2 ) - ( r() - 0.5 ) * 0.3, 0.03 + r() * 0.06, 0.02 + r() * 0.03, 1.2 );
	// 设备脚下
	for ( let i = 0; i < 400; i ++ ) add( RX0 + 4.5 + r() * 4, - 17.0 + r() * 3, 0.03 + r() * 0.06, 0.02 + r() * 0.03, 1.1 );
	lumps.forEach( ( g, k ) => ml[ k ].m.length && group.add( instanced( g, mats.mossClump, ml[ k ].m, ml[ k ].c, { cast: false } ) ) );

	// —— 屋面草丛：女儿墙根、伸缩缝、积水边、压顶内侧（俯视镜头的主要信息量）——
	const grass = [ grassClump( 701, 14, 1.1, 2, 0.14 ), grassClump( 702, 9, 0.8, 2, 0.1 ) ];
	const gl = grass.map( () => ( { m: [], c: [] } ) );
	const addG = ( x, z, s ) => {

		const k = r() < 0.5 ? 0 : 1;
		gl[ k ].m.push( new THREE.Matrix4().compose( new THREE.Vector3( x, H + 0.01, z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, r() * 6.28, 0 ) ), new THREE.Vector3( s, s * ( 0.7 + r() * 0.6 ), s ) ) );
		const c = new THREE.Color().setRGB( 0.055 + r() * 0.03, 0.07 + r() * 0.03, 0.025 );
		if ( r() < 0.35 ) c.setRGB( 0.11 + r() * 0.04, 0.09, 0.045 );
		gl[ k ].c.push( c );

	};

	for ( let z = RZ1; z > RZ0; z -= 0.05 ) {

		if ( fbm2( z * 0.3, 2, 3 ) > 0.42 && r() < 0.7 ) addG( RX1 - 0.08 - Math.pow( r(), 2 ) * 0.7, z, 0.3 + r() * 0.4 );
		if ( fbm2( z * 0.25, 5, 3 ) > 0.4 && r() < 0.8 ) addG( RX0 + 0.08 + Math.pow( r(), 2 ) * 0.9, z, 0.3 + r() * 0.45 );

	}

	for ( let x = RX0; x < RX1; x += 0.06 ) if ( r() < 0.6 ) addG( x, - 21 + ( r() - 0.5 ) * 0.7, 0.25 + r() * 0.35 );
	for ( let i = 0; i < 260; i ++ ) addG( RX0 + 4 + r() * 5, - 17.5 + r() * 4, 0.2 + r() * 0.3 );
	grass.forEach( ( g, k ) => gl[ k ].m.length && group.add( instanced( g, mats.grass, gl[ k ].m, gl[ k ].c, { cast: false } ) ) );

	// 屋面杂物：散落的砖块/板材碎片、塌陷的通风管段、旧轮胎
	const deb = [];
	for ( let i = 0; i < 70; i ++ ) {

		const w = 0.08 + r() * 0.35, d = 0.06 + r() * 0.25, h = 0.02 + r() * 0.05;
		const b = bevelBox( w, h, d, 0.006 );
		xf( b, T( RX0 + 0.5 + r() * ( RX1 - RX0 - 1 ), H + h / 2 + 0.005, RZ0 + 4 + r() * ( RZ1 - RZ0 - 6 ), ( r() - 0.5 ) * 0.1, r() * 6.28, ( r() - 0.5 ) * 0.1 ) );
		deb.push( b );

	}

	const dbm = new THREE.Mesh( merge( deb ), mats.concrete );
	dbm.castShadow = dbm.receiveShadow = true;
	group.add( dbm );
	return group;

}
