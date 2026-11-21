"""Preview stills of the testing station (run in Blender after build_test_station.py).

Uses temporary bright world light; effects are hidden; restores everything afterwards.
SHOTS: name -> (camera location, target, lens, fridge door deg, bin lid deg)
"""
import math
import os
import bpy
from mathutils import Vector

OUT = r"C:\Users\zazaj\Downloads\RalphLab\station_preview"
os.makedirs(OUT, exist_ok=True)
SHOTS = globals().get("SHOTS") or {
    "overview": ((2.75, -2.25, 1.35), (3.30, -1.05, 0.55), 32, 0, 0),
    "bench": ((3.25, -1.75, 0.95), (3.66, -1.12, 0.62), 45, 0, 0),
    "trays": ((3.42, -1.32, 0.80), (3.70, -1.27, 0.62), 40, 0, 0),
    "rack": ((3.52, -1.00, 0.71), (3.66, -0.88, 0.635), 38, 0, 0),
    "fridge_bin_closed": ((3.75, -0.55, 1.05), (2.72, -1.12, 0.50), 30, 0, 0),
    "fridge_bin_open": ((3.75, -0.55, 1.05), (2.72, -1.12, 0.50), 30, 100, -100),
}

sc = bpy.context.scene
bg = sc.world.node_tree.nodes["Background"]
old = (tuple(bg.inputs[0].default_value), bg.inputs[1].default_value, sc.camera, sc.render.filepath,
       sc.render.resolution_percentage, sc.eevee.taa_render_samples)
bg.inputs[0].default_value = (0.75, 0.80, 0.85, 1)
bg.inputs[1].default_value = 0.9
sc.render.resolution_percentage = 60
sc.eevee.taa_render_samples = 16
fx = [o for o in bpy.data.objects if o.name.startswith("fx_") and o.name != "fx_drop"]
for o in fx:
    o.hide_render = True
hinge = bpy.data.objects["fridge_door_hinge"]
lid = bpy.data.objects["bin_lid_hinge"]
keep = bpy.data.collections.get("glTF_not_exported") or sc.collection


def cam(name, loc, target, lens):
    c = bpy.data.objects.get(name)
    if not c:
        c = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        keep.objects.link(c)
    c.location = loc
    c.data.lens = lens
    c.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return c


try:
    for k, (loc, tgt, lens, door, lidd) in SHOTS.items():
        hinge.rotation_euler = (0, 0, math.radians(door))
        lid.rotation_euler = (0, math.radians(lidd), 0)
        sc.camera = cam("PreviewCam_" + k, loc, tgt, lens)
        sc.render.filepath = os.path.join(OUT, k + ".png")
        bpy.ops.render.render(write_still=True)
finally:
    hinge.rotation_euler = (0, 0, 0)
    lid.rotation_euler = (0, 0, 0)
    for o in fx:
        o.hide_render = False
    bg.inputs[0].default_value = old[0]
    bg.inputs[1].default_value = old[1]
    sc.camera, sc.render.filepath, sc.render.resolution_percentage, sc.eevee.taa_render_samples = old[2:]
