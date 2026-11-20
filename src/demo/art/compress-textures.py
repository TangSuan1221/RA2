"""Build web versions of the full-resolution road and architecture maps used by the demo."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[3]
assets = root / 'public/assets'
out = assets / 'evac-art' / 'surfaces'
out.mkdir(exist_ok=True)
requested = json.loads((root / 'shots/evac/inspection/asset-paths.json').read_text(encoding='utf-8'))
# On later inspections the served path already points to the optimized map.
manifest = root / 'src/demo/art/surface-files.json'
paths = set(json.loads(manifest.read_text()) if manifest.exists() else [])
paths.update(p for p in requested if p.startswith('/assets/textures/') and p.endswith('.jpg'))
original_bytes = encoded_bytes = 0
for p in sorted(paths):
    src = root / 'public' / p.lstrip('/')
    dest = out / (src.stem + '.webp')
    with Image.open(src) as im:
        im.convert('RGB').save(dest, 'WEBP', quality=95 if '_nor_' in src.name else 90, method=3)
    original_bytes += src.stat().st_size
    encoded_bytes += dest.stat().st_size
manifest.write_text(json.dumps(sorted(paths), indent=2) + '\n', encoding='utf-8')
print(f'{len(paths)} textures: {original_bytes} -> {encoded_bytes} bytes')
