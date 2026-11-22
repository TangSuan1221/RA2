"""Blender --background --python retarget-tps.py -- path/to/player.glb"""
import bpy
import json
import math
import struct
import sys
from pathlib import Path
from mathutils import Quaternion, Vector

out = Path(__file__).resolve().parents[2] / 'public/data/combat'
rig = json.loads((out / 'bones.json').read_text())
bones = rig['bones']
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
unv = sys.argv[-1].lower().endswith('.blend')
if unv:
    bpy.ops.wm.open_mainfile(filepath=sys.argv[-1],use_scripts=False)
    scene=bpy.context.scene
else:
    bpy.ops.import_scene.gltf(filepath=sys.argv[-1])
arm = next(o for o in scene.objects if o.type == 'ARMATURE' and 'hips' in o.data.bones)
anim = arm.animation_data
actions = {t.name: (t.strips[0].action, t.strips[0].action_slot) for t in anim.nla_tracks if t.strips}
for t in anim.nla_tracks:
    t.mute = True
mapping = dict(pelvis='hips', spine_01='spine1', spine_02='spine2', spine_03='chest', neck_01='neck', Head='head.001')
for side in 'lr':
    for dst, src in dict(clavicle='shoulder', upperarm='upper_arm', lowerarm='forearm', hand='hand', thigh='thigh', calf='shin', foot='foot', ball='toe').items():
        mapping[f'{dst}_{side}'] = f'{src}.{side.upper()}'
    for finger in ['thumb', 'index', 'middle', 'ring']:
        for n in range(1,4):
            prefix = '' if finger == 'thumb' else 'f_'
            mapping[f'{finger}_0{n}_{side}'] = f'{prefix}{finger}.0{n}.{side.upper()}'
if unv:
    mapping.update(spine_01='spine',spine_03='ribs',Head='head')
    del mapping['spine_02']
    mapping={k:v.replace('f_', 'finger_') for k,v in mapping.items() if v.replace('f_', 'finger_') in arm.data.bones}
rests = []
positions = []
for b in bones:
    x,y,z,w = b['rotation']
    q = Quaternion((w,x,y,z))
    v = Vector(b['translation'])
    p = b['parent']
    positions.append(positions[p] + rests[p] @ v if p >= 0 else v)
    rests.append(rests[p] @ q if p >= 0 else q)
# Align lateral axes in the target's Y-up character space.
up = Quaternion((1,0,0), -math.pi/2)
def rest_pos(name):
    return up @ (arm.matrix_world @ arm.data.bones[name].head_local)
side = rest_pos('upper_arm.L') - rest_pos('upper_arm.R')
target_side = positions[8] - positions[next(i for i,b in enumerate(bones) if b['name']=='upperarm_r')]
axis = Quaternion((0,1,0), math.atan2(target_side.x,target_side.z)-math.atan2(side.x,side.z)) @ up
basis = axis @ arm.matrix_world.to_quaternion()
scale = (positions[1].y / max(.001,rest_pos('hips').y))
selection = {'Idlecombat-cycle':'Idle','walking_gun-cycle':'Walk','running_gun-cycle':'Run','running_aiming':'Aim_Run','strafe_front-cycle':'Strafe_Forward','strafe_back-cycle':'Strafe_Back','strafe_left-cycle':'Strafe_Left','strafe_right-cycle':'Strafe_Right','AIM-Up':'Aim_Up','AIM-Down':'Aim_Down','AIM-Center':'Aim_Center'}
if unv:
    selection={'stand':'Idle','walk':'Walk','run':'Run','rifle_crouch_forward':'CrouchWalk','attack':'Fire','rifle_delta':'Hold'}
    ranges={'stand':(200,60),'walk':(70,60),'run':(90,120),'rifle_crouch_forward':(89,60),'attack':(16,60),'rifle_delta':(1,60)}
entries=[]
for source,label in selection.items():
    action,slot=(bpy.data.actions[source],bpy.data.actions[source].slots[0]) if unv else actions[source]
    anim.action=action
    anim.action_slot=slot
    start,end=action.frame_range
    frames=max(2, round(end-start)+1)
    if unv:frames=max(2,round(ranges[source][0]*30/ranges[source][1])+1)
    rotations=[]; translations=[]; last={}
    for f in range(frames):
        scene.frame_set(min(ranges[source][0],round(f*ranges[source][1]/30)) if unv else round(start)+f)
        world=[]
        for i,b in enumerate(bones):
            name=b['name']; parent=b['parent']; mapped=mapping.get(name)
            relative=rests[parent].inverted() @ rests[i] if parent>=0 else rests[i]
            q=relative
            v=Vector(b['translation'])
            if mapped:
                src=arm.pose.bones[mapped]
                delta=basis @ src.matrix.to_quaternion() @ src.bone.matrix_local.to_quaternion().inverted() @ basis.inverted()
                orient=delta @ rests[i]
                if unv:
                    orient=Quaternion((0,1,0), math.pi) @ orient
                q=world[parent].inverted() @ orient
                if name=='pelvis':
                    dy=(axis @ (arm.matrix_world @ src.head)).y-rest_pos('hips').y
                    v+=world[parent].inverted() @ Vector((0,dy*scale,0))
            q.normalize()
            if i in last:q.make_compatible(last[i])
            last[i]=q.copy()
            world.append(world[parent] @ q if parent>=0 else q)
            rotations.extend((q.x,q.y,q.z,q.w));translations.extend(v)
    id=('Unv_Rifle_' if unv else 'TPS_LongGun_')+label
    loop=(label in ('Idle','Walk','Run','CrouchWalk')) if unv else source.endswith('-cycle') or label=='Aim_Run'
    data=struct.pack('<4sHIHIfB',b'ANIM',1,rig['skeletonId'],len(bones),frames,30,loop)
    for values in (rotations,translations):data+=struct.pack(f'<{len(values)}f',*values)
    data+=bytes(2+12*frames)
    (out/'anim'/f'{id}.bin').write_bytes(data)
    entries.append(dict(id=id,source=source,frames=frames,loop=loop))
(out/('unv-rifle.json' if unv else 'tps-longgun.json')).write_text(json.dumps(entries,indent=2))
print('Baked',len(entries),'clips')
