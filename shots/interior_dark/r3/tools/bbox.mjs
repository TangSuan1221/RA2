// 读 glTF 访问器 min/max，估算模型包围盒（不含节点变换嵌套的精确处理，只取根节点平移/缩放）
import { readFileSync } from 'node:fs';
for ( const id of process.argv.slice( 2 ) ) {
	const g = JSON.parse( readFileSync( `public/assets/models/${id}/${id}.gltf`, 'utf8' ) );
	const mn = [ 1e9, 1e9, 1e9 ], mx = [ - 1e9, - 1e9, - 1e9 ];
	const walk = ( ni, T = [ 0, 0, 0 ] ) => {
		const n = g.nodes[ ni ]; const t = n.translation || [ 0, 0, 0 ]; const s = n.scale || [ 1, 1, 1 ];
		const TT = [ T[ 0 ] + t[ 0 ], T[ 1 ] + t[ 1 ], T[ 2 ] + t[ 2 ] ];
		if ( n.mesh !== undefined ) for ( const p of g.meshes[ n.mesh ].primitives ) { const a = g.accessors[ p.attributes.POSITION ]; for ( let i = 0; i < 3; i ++ ) { mn[ i ] = Math.min( mn[ i ], a.min[ i ] * s[ i ] + TT[ i ] ); mx[ i ] = Math.max( mx[ i ], a.max[ i ] * s[ i ] + TT[ i ] ); } }
		for ( const c of n.children || [] ) walk( c, TT );
	};
	for ( const r of g.scenes[ 0 ].nodes ) walk( r );
	console.log( id, 'min', mn.map( ( v ) => v.toFixed( 2 ) ).join( ',' ), 'max', mx.map( ( v ) => v.toFixed( 2 ) ).join( ',' ), 'nodes', g.scenes[ 0 ].nodes.map( ( i ) => g.nodes[ i ].name ).slice( 0, 8 ).join( '/' ) );
}
