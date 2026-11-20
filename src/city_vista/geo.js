// 城市远景：几何拼装器
//   把大量小构件（盒子、柱、圆柱、管道）直接写进同一组顶点数组，最后生成一个 BufferGeometry → 1 次绘制调用。
//   · 每个构件可带自定义顶点属性（构件类型 kind、立面网格尺寸、建筑参数等），供着色器区分材质
//   · 立面 UV 以「米」为单位，并以整栋建筑的坐标系为基准（退台/切块后窗格仍然对齐）
//   · setMatrix() 设置当前变换（整栋楼的旋转与平移），之后写入的顶点都会被变换
import * as THREE from 'three/webgpu';

const _v = new THREE.Vector3(), _n = new THREE.Vector3();

export class GeoBuilder {

	/** @param {Record<string, number>} attrs 额外属性名 → 分量数 */
	constructor( attrs = {} ) {

		this.attrs = attrs;
		this.pos = []; this.nor = []; this.uv = []; this.idx = [];
		this.ex = {};
		for ( const k in attrs ) this.ex[ k ] = [];
		this.cur = {}; // 当前属性值
		for ( const k in attrs ) this.cur[ k ] = new Array( attrs[ k ] ).fill( 0 );
		this.m = new THREE.Matrix4();
		this.nm = new THREE.Matrix3();

	}

	setMatrix( m ) {

		this.m.copy( m );
		this.nm.getNormalMatrix( m );
		return this;

	}

	set( vals ) {

		for ( const k in vals ) this.cur[ k ] = Array.isArray( vals[ k ] ) ? vals[ k ] : [ vals[ k ] ];
		return this;

	}

	vert( x, y, z, nx, ny, nz, u, v, over ) {

		_v.set( x, y, z ).applyMatrix4( this.m );
		_n.set( nx, ny, nz ).applyMatrix3( this.nm ).normalize();
		this.pos.push( _v.x, _v.y, _v.z );
		this.nor.push( _n.x, _n.y, _n.z );
		this.uv.push( u, v );
		for ( const k in this.attrs ) {

			const val = over && over[ k ] !== undefined ? ( Array.isArray( over[ k ] ) ? over[ k ] : [ over[ k ] ] ) : this.cur[ k ];
			for ( let i = 0; i < this.attrs[ k ]; i ++ ) this.ex[ k ].push( val[ i ] ?? 0 );

		}

		return this.pos.length / 3 - 1;

	}

	// 四边形（p0..p3 逆时针，从法线方向看）
	quad( p0, p1, p2, p3, n, uvs, over ) {

		const a = this.vert( ...p0, ...n, ...uvs[ 0 ], over );
		const b = this.vert( ...p1, ...n, ...uvs[ 1 ], over );
		const c = this.vert( ...p2, ...n, ...uvs[ 2 ], over );
		const d = this.vert( ...p3, ...n, ...uvs[ 3 ], over );
		this.idx.push( a, b, c, a, c, d );

	}

	/**
	 * 轴对齐盒子（局部坐标）。
	 * opt.frame = {x0,x1,z0,z1}：立面 UV 的参照框（默认为盒子自身）；opt.skip = {top,bottom,px,nx,pz,nz}
	 * opt.over：本构件的属性覆盖；opt.faceOver = {pz:{...},...}：逐面覆盖
	 */
	box( x0, y0, z0, x1, y1, z1, opt = {} ) {

		const f = opt.frame || { x0, x1, z0, z1 };
		const s = opt.skip || {};
		const fo = opt.faceOver || {};
		const ov = ( k ) => ( fo[ k ] ? { ...( opt.over || {} ), ...fo[ k ] } : opt.over );
		const vb = opt.vBase ?? 0; // v 坐标基准（建筑底部）
		// +Z 面：u = x - f.x0
		if ( ! s.pz ) this.quad( [ x0, y0, z1 ], [ x1, y0, z1 ], [ x1, y1, z1 ], [ x0, y1, z1 ], [ 0, 0, 1 ], [ [ x0 - f.x0, y0 - vb ], [ x1 - f.x0, y0 - vb ], [ x1 - f.x0, y1 - vb ], [ x0 - f.x0, y1 - vb ] ], ov( 'pz' ) );
		// -Z 面：u = f.x1 - x
		if ( ! s.nz ) this.quad( [ x1, y0, z0 ], [ x0, y0, z0 ], [ x0, y1, z0 ], [ x1, y1, z0 ], [ 0, 0, - 1 ], [ [ f.x1 - x1, y0 - vb ], [ f.x1 - x0, y0 - vb ], [ f.x1 - x0, y1 - vb ], [ f.x1 - x1, y1 - vb ] ], ov( 'nz' ) );
		// +X 面：u = f.z1 - z
		if ( ! s.px ) this.quad( [ x1, y0, z1 ], [ x1, y0, z0 ], [ x1, y1, z0 ], [ x1, y1, z1 ], [ 1, 0, 0 ], [ [ f.z1 - z1, y0 - vb ], [ f.z1 - z0, y0 - vb ], [ f.z1 - z0, y1 - vb ], [ f.z1 - z1, y1 - vb ] ], ov( 'px' ) );
		// -X 面：u = z - f.z0
		if ( ! s.nx ) this.quad( [ x0, y0, z0 ], [ x0, y0, z1 ], [ x0, y1, z1 ], [ x0, y1, z0 ], [ - 1, 0, 0 ], [ [ z0 - f.z0, y0 - vb ], [ z1 - f.z0, y0 - vb ], [ z1 - f.z0, y1 - vb ], [ z0 - f.z0, y1 - vb ] ], ov( 'nx' ) );
		// 顶面 / 底面：uv 为局部 xz
		if ( ! s.top ) this.quad( [ x0, y1, z1 ], [ x1, y1, z1 ], [ x1, y1, z0 ], [ x0, y1, z0 ], [ 0, 1, 0 ], [ [ x0, z1 ], [ x1, z1 ], [ x1, z0 ], [ x0, z0 ] ], ov( 'top' ) );
		if ( ! s.bottom ) this.quad( [ x0, y0, z0 ], [ x1, y0, z0 ], [ x1, y0, z1 ], [ x0, y0, z1 ], [ 0, - 1, 0 ], [ [ x0, z0 ], [ x1, z0 ], [ x1, z1 ], [ x0, z1 ] ], ov( 'bottom' ) );

	}

	// 以中心与尺寸给出的盒子
	boxC( cx, y0, cz, w, h, d, opt ) {

		this.box( cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, opt );

	}

	/** 追加任意几何体（局部变换 local 之后再叠加当前矩阵） */
	geometry( g, local = null, over = null ) {

		const src = g.index ? g : g;
		const p = src.attributes.position, n = src.attributes.normal, t = src.attributes.uv;
		const lm = local || new THREE.Matrix4();
		const lnm = new THREE.Matrix3().getNormalMatrix( lm );
		const base = this.pos.length / 3;
		const tmp = new THREE.Vector3(), tn = new THREE.Vector3();
		for ( let i = 0; i < p.count; i ++ ) {

			tmp.fromBufferAttribute( p, i ).applyMatrix4( lm );
			tn.fromBufferAttribute( n, i ).applyMatrix3( lnm ).normalize();
			this.vert( tmp.x, tmp.y, tmp.z, tn.x, tn.y, tn.z, t ? t.getX( i ) : 0, t ? t.getY( i ) : 0, over );

		}

		if ( src.index ) for ( let i = 0; i < src.index.count; i ++ ) this.idx.push( base + src.index.getX( i ) );
		else for ( let i = 0; i < p.count; i ++ ) this.idx.push( base + i );

	}

	get vertexCount() {

		return this.pos.length / 3;

	}

	build() {

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( this.pos, 3 ) );
		g.setAttribute( 'normal', new THREE.Float32BufferAttribute( this.nor, 3 ) );
		g.setAttribute( 'uv', new THREE.Float32BufferAttribute( this.uv, 2 ) );
		for ( const k in this.attrs ) g.setAttribute( k, new THREE.Float32BufferAttribute( this.ex[ k ], this.attrs[ k ] ) );
		const big = this.pos.length / 3 > 65535;
		g.setIndex( big ? new THREE.Uint32BufferAttribute( this.idx, 1 ) : new THREE.Uint16BufferAttribute( this.idx, 1 ) );
		g.computeBoundingSphere();
		g.computeBoundingBox();
		return g;

	}

}

// 便捷矩阵：平移 + 绕 Y 旋转 + 缩放 + 绕 X/Z 倾斜
export function mat( x = 0, y = 0, z = 0, ry = 0, s = 1, rx = 0, rz = 0 ) {

	const q = new THREE.Quaternion().setFromEuler( new THREE.Euler( rx, ry, rz, 'YXZ' ) );
	const sc = typeof s === 'number' ? new THREE.Vector3( s, s, s ) : s;
	return new THREE.Matrix4().compose( new THREE.Vector3( x, y, z ), q, sc );

}
