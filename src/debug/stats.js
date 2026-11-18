// 性能面板：FPS、帧时间、GPU 时间（WebGPU 时间戳查询）、绘制调用、三角面、显存
export function createStats( renderer, show = true ) {

	const el = show ? document.getElementById( 'hud' ) : null;
	const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2（回退）';
	let acc = 0, frames = 0, fps = 0, ms = 0, gpu = null;
	const out = {};

	setInterval( async () => {

		try {

			const t = await renderer.resolveTimestampsAsync( 'render' );
			if ( typeof t === 'number' && t > 0 ) gpu = t;

		} catch { /* 不支持时间戳查询 */ }

	}, 500 );

	return {
		stats: out,
		update( dt ) {

			acc += dt; frames ++;
			if ( acc < 0.5 ) return;
			fps = frames / acc; ms = ( acc / frames ) * 1000; acc = 0; frames = 0;
			const r = renderer.info.render, m = renderer.info.memory;
			Object.assign( out, { fps, ms, gpu, drawCalls: r.drawCalls, triangles: r.triangles, mem: m.total } );
			window.__stats = { ...out };
			if ( ! el ) return;
			el.textContent =
				`后端      ${backend}\n` +
				`FPS       ${fps.toFixed( 0 )}   (${ms.toFixed( 2 )} ms)\n` +
				`GPU       ${gpu ? gpu.toFixed( 2 ) + ' ms' : '—'}\n` +
				`绘制调用  ${r.drawCalls}\n` +
				`三角面    ${( r.triangles / 1e6 ).toFixed( 2 )} M\n` +
				`显存估算  ${( m.total / 1048576 ).toFixed( 0 )} MB`;

		},
	};

}
