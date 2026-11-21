"""Preview-only contact sheets of the analyst station clips, with the station linked in from
Lab2_3room_station.blend and mapped into character space for each standing spot.
Run after ralph_anim_tools.py + build_station_clips.py (uses SOCKET_LOCAL, door functions, ...)."""
import math
import os
from mathutils import Matrix, Vector

STATION = r"C:\Users\zazaj\Downloads\RalphLab\Lab2_3room_station.blend"
OUT = r"C:\Users\zazaj\Downloads\RalphLab\station_preview"
os.makedirs(OUT, exist_ok=True)
arm = arm_obj("Char1_Armature")

if "TestStation" not in bpy.data.collections:
    with bpy.data.libraries.load(STATION, link=False) as (src, dst):
        dst.collections = ["TestStation"]
    bpy.context.scene.collection.children.link(bpy.data.collections["TestStation"])
station = bpy.data.collections["TestStation"]
inst = bpy.data.objects.get("_preview_station")
if inst is None:
    inst = bpy.data.objects.new("_preview_station", None)
    bpy.context.scene.collection.objects.link(inst)
    for o in [x for x in station.all_objects if x]:
        if o.parent is None:
            o.parent = inst
for o in [x for x in station.all_objects if x]:
    if o.name.startswith("fx_"):
        o.hide_render = True


def place_station(root_xy, yaw):
    """Station (room units) -> character space for an agent standing at root_xy with Blender yaw."""
    inst.matrix_world = (Matrix.Scale(U, 4) @ Matrix.Rotation(-yaw, 4, "Z")
                         @ Matrix.Translation((-root_xy[0], -root_xy[1], -0.269)))
    bpy.context.view_layer.update()


# a stand-in for the held prop (vial) at the hand socket
def make_vial(name, r, h, color):
    o = bpy.data.objects.get(name)
    if o:
        return o
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=r, radius2=r, depth=h)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


held = make_vial("_preview_held", 0.0075 * U, 0.035 * U, (0.3, 0.75, 0.7))
held.hide_render = True


def hold(side, on, offset_z=0.0):
    held.hide_render = not on
    if on:
        hb = arm.pose.bones[f"{side}Hand"]
        held.matrix_world = Matrix.Translation(hb.matrix @ SOCKET_LOCAL[side] + Vector((0, 0, offset_z)))


SHEETS = [x for x in [
    # name, clip, root (room), yaw, frames, hand, (grab, release) frames, camera loc, target
    ("pick_rack", "Station_Pick", "rack_slot_skin_approach", math.pi / 2, [0, 12, 20, 26, 29, 36, 44, 56], "Left", (29, 999),
     (1.25, -1.55, 1.45), (0.0, -0.40, 0.85)),
    ("dispense_skin", "Station_Dispense", "tray_skin_approach", math.pi / 2, [0, 18, 25, 36, 50, 62, 80, 97, 108, 120],
     "Right", (25, 97), (1.15, -1.65, 1.55), (-0.02, -0.45, 0.88)),
    ("fridge_open", "Fridge_Open", "fridge_door_open_approach", -math.pi / 2, [0, 10, 16, 22, 28, 32, 38, 48], "Right", (-1, -1),
     (-1.45, 0.35, 1.45), (-0.15, -0.40, 0.95)),
    ("fridge_close", "Fridge_Close", "fridge_door_close_approach", 0.0, [0, 10, 16, 22, 28, 32, 40, 48], "Right", (-1, -1),
     (-1.45, 0.45, 1.5), (-0.1, -0.50, 0.95)),
    ("bin_release", "Bin_Release", "bin_approach", -math.pi / 2, [0, 8, 14, 18, 20, 24, 32, 44], "Left", (0, 20),
     (-1.45, 0.1, 1.4), (0.0, -0.38, 0.72)),
] if not globals().get("SHEET_ONLY") or x[0] in SHEET_ONLY]
door_hinge = None


def run():
    global door_hinge
    made = []
    keep = {o.name for o in station.all_objects if o} | {"_preview_held", "_preview_station"}
    others = [o for o in bpy.data.objects if o.type == "MESH" and o.name not in keep
              and not (o.parent and o.parent.name == "Char1_Armature")]
    for o in others:
        o.hide_render = True
    for o in [x for x in station.all_objects if x]:
        o.hide_render = o.name.startswith("fx_")
    for name, clip, root, yaw, frames, side, (g0, g1), cl, ct in SHEETS:
        inst.matrix_world = Matrix.Identity(4)
        bpy.context.view_layer.update()
        e = bpy.data.objects[root]
        root = (e.matrix_world.translation.x, e.matrix_world.translation.y)
        yaw = e.matrix_world.to_euler().z
        place_station(root, yaw)
        act = bpy.data.actions[PFX + clip]

        def setup(i, f, act=act, clip=clip, side=side, g0=g0, g1=g1):
            set_action(arm, act)
            S.frame_set(int(f))
            hinge = bpy.data.objects["fridge_door_hinge"]
            lid = bpy.data.objects["bin_lid_hinge"]
            th = door_theta_open(f) if clip == "Fridge_Open" else door_theta_close(f) if clip == "Fridge_Close" else 0.0
            hinge.rotation_euler = (0, 0, math.radians(th))
            lid.rotation_euler = (0, math.radians(-100 if clip == "Bin_Release" else 0), 0)
            bpy.context.view_layer.update()
            if clip in ("Fridge_Open", "Fridge_Close", "Bin_Release"):
                hold("Left", True)       # left hand still carries the vial
                if clip == "Bin_Release" and f > g1:
                    held.hide_render = True
            else:
                hold(side, g0 <= f <= g1)
        p = contact_sheet(os.path.join(OUT, f"clip_{name}.png"), frames, setup, cl, ct, cols=len(frames) if len(frames) <= 8 else 5,
                          cell=(300, 380), lens=40)
        made.append(p)
    set_action(arm, None)
    held.hide_render = True
    for o in [x for x in station.all_objects if x]:
        o.hide_render = True
    return made


MADE = run()
