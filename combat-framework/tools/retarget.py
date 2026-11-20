"""Run in the connected Blender. Retarget real CC0 motion, preserving target proportions."""
import bpy, json, math
from pathlib import Path
from mathutils import Matrix

BASE = Path(r'C:\Users\Lenovo\Desktop\the last rule')
scene = bpy.data.scenes['CombatAssetLab']
bpy.context.window.scene = scene
source = bpy.data.objects[globals().get('SOURCE_OBJECT','UAL_Source')]
target = bpy.data.objects['Combat_Female']
original_actions = [strip.action for track in source.animation_data.nla_tracks for strip in track.strips]
for track in source.animation_data.nla_tracks:
    track.mute = True
target.animation_data_create()
names = [b.name for b in target.data.bones]
ratio = target.data.bones['pelvis'].head_local.z / source.data.bones['pelvis'].head_local.z
fps = globals().get('SOURCE_FPS',24)  # FPS at import, not the output sampling rate.
scene.render.fps = fps
target.animation_data.action = None
if not globals().get('APPEND',False):
    for track in list(target.animation_data.nla_tracks):
        target.animation_data.nla_tracks.remove(track)
    for action in list(bpy.data.actions):
        if action.name.startswith('RT_') and action.users == 0:
            bpy.data.actions.remove(action)
report = []
for action in original_actions:
    clip_name = action.name.rsplit('.',1)[0] if action.name[-3:].isdigit() else action.name
    if any(track.name == clip_name for track in target.animation_data.nla_tracks):
        continue
    source.animation_data.action = action
    source.animation_data.action_slot = action.slots[0]
    out = bpy.data.actions.new('RT_' + clip_name)
    target.animation_data.action = out
    duration = (action.frame_range[1] - action.frame_range[0]) / fps
    count = math.floor(duration * 30 + 1e-4) + 1
    for i in range(count):
        frame = action.frame_range[0] + i / 30 * fps
        scene.frame_set(math.floor(frame), subframe=frame % 1)
        desired = {}
        for name in names:
            sb = source.pose.bones[name]
            tb = target.pose.bones[name]
            # Source rotation delta in armature space, applied to target rest axes.
            delta = sb.matrix.to_quaternion() @ sb.bone.matrix_local.to_quaternion().inverted()
            rotation = delta @ tb.bone.matrix_local.to_quaternion()
            if tb.parent:
                rest_local = tb.parent.bone.matrix_local.inverted() @ tb.bone.matrix_local
                location = desired[tb.parent.name] @ rest_local.translation
            else:
                location = tb.bone.head_local.copy()
            if name in ('root', 'pelvis'):
                displacement = sb.matrix.translation - sb.bone.matrix_local.translation
                location += displacement * ratio
            matrix = rotation.to_matrix().to_4x4()
            matrix.translation = location
            desired[name] = matrix
            if tb.parent:
                basis = rest_local.inverted() @ desired[tb.parent.name].inverted() @ matrix
            else:
                basis = tb.bone.matrix_local.inverted() @ matrix
            tb.rotation_mode = 'QUATERNION'
            tb.location = basis.to_translation()
            tb.rotation_quaternion = basis.to_quaternion()
            tb.keyframe_insert('rotation_quaternion', frame=i)
            tb.keyframe_insert('location', frame=i)
        bpy.context.view_layer.update()
    track = target.animation_data.nla_tracks.new()
    track.name = clip_name
    strip = track.strips.new(clip_name, 0, out)
    strip.action_frame_start = 0
    strip.action_frame_end = count - 1
    track.mute = True
    report.append({'id':clip_name, 'frames':count, 'duration':(count-1)/30, 'sourceDuration':duration})
target.animation_data.action = None
scene.render.fps = 30
scene.frame_set(0)
for obj in scene.objects:
    obj.select_set(False)
target.select_set(True)
for obj in target.children_recursive:
    if obj.type == 'MESH': obj.select_set(True)
bpy.context.view_layer.objects.active = target
for track in target.animation_data.nla_tracks:
    track.mute = False
options = bpy.ops.export_scene.gltf.get_rna_type().properties['export_animation_mode'].enum_items
assert 'NLA_TRACKS' in [x.identifier for x in options]
bpy.ops.export_scene.gltf(filepath=str(BASE/'public/assets/combat/character-female.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_animation_mode='NLA_TRACKS', export_frame_range=False, export_force_sampling=True)
(BASE/('combat-framework/assets-source/retarget-report'+('-ual2' if globals().get('APPEND',False) else '')+'.json')).write_text(json.dumps({'source':source.name,'target':'Superhero_Female_FullBody.gltf','boneCount':len(names),'rootScale':ratio,'sampleHz':30,'clips':report},indent=2),encoding='utf-8')
for track in target.animation_data.nla_tracks: track.mute=True
target.animation_data.action=bpy.data.actions['RT_Idle_Loop']
target.animation_data.action_slot=target.animation_data.action.slots[0]
scene.frame_set(12)
print(json.dumps({'retargeted':len(report),'frames':sum(x['frames'] for x in report),'file':'public/assets/combat/character-female.glb'}))
