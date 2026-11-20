# Indoor continuation — 2026-11-19

## Implemented
- New `hospital` scene: two articulated hospital-bed assemblies with rounded end panels, inset controls, rails and casters; wrinkled cloth, privacy screens, scanned wheelchair/cabinet/chairs/bin; actual courtyard opening, plants, tree trunks and distant facade; worn plaster, fractured plaster chips, utility outlets, flashlight lighting; human-height and cutaway cameras.
- Flooded atrium: wider rectangular broken entry; lower, nearer reference camera; repositioned boat and matching water mask; smaller, decayed lily geometry with a corrected boat exclusion zone; nearer outdoor fence/vegetation; reduced white reflection and haze; real scanned fuel can; foreground ferns.
- Corrected four `vec3(new THREE.Color(...))` material conversions in `src/flooded_atrium/materials.js`. Explicit `.r/.g/.b` components restore the intended material color. Hospital A/B diagnostic proves black cloth/plaster was a color construction defect rather than AO. `hospital_noao.jpg`, `hospital_plain.jpg`, `hospital_r4.jpg` preserve the diagnosis.

## Validation
- Hospital completed six screenshot iterations, plus cutaway. r6: zero console/page errors, ~60 fps, GPU 0.74 ms, 198 calls, 800,943 triangles.
- Flooded atrium completed five screenshot iterations, plus final pass. r5b: zero console/page errors, GPU 2.84 ms, 299 calls, 13,655,194 triangles; actual wall-clock performance ~5.6 fps remains poor despite low GPU timestamp.
- `flooded_r5.jpg` is invalid (blank frame following HMR); do not use it as evidence.
- `final-report.json` contains the final capture results.

## Honest remaining gaps
Independent review has NOT approved either scene as AAA or a 1:1 reproduction. Hospital assets retain procedural form and repetition; the reference has finer bespoke geometry, wear, clutter, and indirect lighting. Flooded architecture still differs from the reference and foliage distribution is too regular; boat fabrication and water need additional art work. No ripped Naughty Dog assets were used. Existing Poly Haven CC0 assets were reused; no new remote asset license obligations introduced.
