"""Original prototype clothing derived from the downloaded CC0 weighted base mesh."""
import bpy,bmesh
from pathlib import Path
BASE=Path(r'C:\Users\Lenovo\Desktop\the last rule')
scene=bpy.data.scenes['CombatAssetLab'];bpy.context.window.scene=scene
body=bpy.data.objects['Superhero_Female'];target=bpy.data.objects['Combat_Female']
target.animation_data.action=None
for track in target.animation_data.nla_tracks:track.mute=True
def garment(name,prefixes,color,inflate):
    existing=bpy.data.objects.get(name)
    if existing:bpy.data.objects.remove(existing,do_unlink=True)
    obj=body.copy();obj.data=body.data.copy();obj.name=name;scene.collection.objects.link(obj)
    allowed={g.index for g in obj.vertex_groups if any(g.name.startswith(p) for p in prefixes)}
    keep=set()
    for v in obj.data.vertices:
        weight=sum(g.weight for g in v.groups if g.group in allowed)
        if name=='Combat_Field_Trousers':selected=.10<v.co.z<1.02
        elif name=='Combat_Field_Boots':selected=v.co.z<.19
        else:selected=weight>.25
        if selected:keep.add(v.index)
    bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bm.faces.ensure_lookup_table()
    remove=[f for f in bm.faces if sum(v.index in keep for v in f.verts)<len(f.verts)*.66]
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    bm.normal_update()
    for v in bm.verts:v.co+=v.normal*inflate
    bm.to_mesh(obj.data);bm.free()
    material=bpy.data.materials.new(name+'_fabric');material.use_nodes=True
    shader=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED');shader.inputs['Base Color'].default_value=(*color,1);shader.inputs['Roughness'].default_value=.92
    obj.data.materials.clear();obj.data.materials.append(material)
    for polygon in obj.data.polygons:polygon.material_index=0
    return obj
garment('Combat_Field_Shirt',['spine','clavicle','upperarm','lowerarm'],(.085,.105,.065),.009)
garment('Combat_Field_Trousers',['pelvis','thigh','calf'],(.055,.065,.06),.008)
garment('Combat_Field_Boots',['foot','ball'],(.055,.035,.02),.012)
for obj in scene.objects:obj.select_set(False)
target.select_set(True)
for obj in target.children_recursive:
    if obj.type=='MESH':obj.select_set(True)
for track in target.animation_data.nla_tracks:track.mute=False
bpy.ops.export_scene.gltf(filepath=str(BASE/'public/assets/combat/character-female.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,export_force_sampling=True)
for track in target.animation_data.nla_tracks:track.mute=True
target.animation_data.action=bpy.data.actions['RT_Idle_Loop'];target.animation_data.action_slot=target.animation_data.action.slots[0];scene.frame_set(15)
print('Exported weighted original field clothing')
