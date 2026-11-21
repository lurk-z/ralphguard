"""Moves the testing station onto the centre-room sink counter and rigs the room's own fridge and bin
(run in Lab2_3room_station.blend after build_test_station.py).

* Station parts (master stand, rack, four trays) stand on the counter, facing the room (agent faces +Y).
* The counter's clutter goes to the excluded "Unused_props" collection (nothing is deleted).
* The new bench / fridge / bin from build_test_station.py are removed; the room's glass-door fridge and
  pedal bin are used instead: the fridge door gets a hinge empty, its middle shelf gets eight slots, the
  bin's lid is split into its own object on a hinge.
* Approach empties are placed from the analyst clip constants (characters/build_station_clips.py).
"""
import math
import bmesh
import bpy
from mathutils import Matrix, Vector

SCALE = 0.44846
FLOOR = 0.269
TOP = 0.6136                    # counter top (raycast)
PLACE_Z = TOP + 0.008           # vial floor (tray floor / rack recess); the fridge slots match it
VY = 0.998                      # vial line: 0.085 in from the counter front (y 0.913)
FACE = math.pi                  # agent faces +Y (Blender Z rotation of an approach empty)
FACE_NX = -math.pi / 2
GRIP_PICK = Vector((0.06, -0.46))
GRIP_BIN = Vector((0.06, -0.46))
GRIP_DOOR_OPEN = Vector((-0.156, -0.457))
GRIP_DOOR_CLOSE = Vector((-0.10, -0.435))

# room fridge (glass door, hinge on the +Y edge), see build_station_clips.py
HINGE = Vector((-2.189, 1.199))
HANDLE_LOCAL = Vector((0.012, -0.352))
HANDLE_Z = 0.78
PULL_LOCAL = Vector((-0.064, -0.330))   # inner face near the free edge (pulled to close)
CLOSE_SPOT = HINGE + 0.45 * Vector((math.cos(math.radians(-30)), math.sin(math.radians(-30))))
OPEN_DEG = 90.0
SHELF_TOP = 0.616
HOLDER_H = PLACE_Z - SHELF_TOP   # thin slot holder on the fridge shelf lifts vials to PLACE_Z
SLOT_X = -2.300
SLOT_Y0, SLOT_DY, SLOTS = 0.875, 0.024, 8

BIN_C = Vector((0.0025, 1.0395))
BIN_LID_HINGE = Vector((0.0025, 1.159, 0.543))

CLUTTER = [
    "lower_base", "iron", "head", "lights", "plates", "eye2", "plate2", "midle_base", "eye1", "adapter",
    "knob1", "knob2", "leg", "big_flask", "big_flask_liquid", "Petri_dish4", "bottle.002", "bottle.001",
    "bottle.001_liquid", "base.002", "legs", "frame", "flask12", "plate", "flask12_liquid", "button",
    "conductor3", "hole", "Petri_dish2", "salver", "big_flask.001", "Petri_dish", "holder", "flask_drying",
    "bottle.002.001", "small_flask",
]


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def door_theta_open(f):          # keep in step with characters/build_station_clips.py
    if f <= 16:
        return 0.0
    if f <= 32:
        return 45.0 * smooth((f - 16) / 16)
    if f <= 42:
        t = (f - 32) / 10
        return 45.0 + (OPEN_DEG - 45.0) * (1 - (1 - t) ** 2)
    return OPEN_DEG


def door_theta_close(f):
    if f <= 16:
        return OPEN_DEG
    if f <= 30:
        return OPEN_DEG - 20.0 * smooth((f - 16) / 14)
    if f <= 40:
        t = (f - 30) / 10
        return (OPEN_DEG - 20.0) * (1 - t * t)
    return 0.0


def rot2(v, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return Vector((c * v.x - s * v.y, s * v.x + c * v.y))


def approach_from(target, yaw, grip):
    g = rot2(grip * SCALE, math.degrees(yaw))
    return Vector((target.x - g.x, target.y - g.y, FLOOR))


def obj(name):
    return bpy.data.objects.get(name)


def remove_tree(o):
    if o is None:
        return
    for ch in list(o.children):
        remove_tree(ch)
    bpy.data.objects.remove(o, do_unlink=True)


def empty(name, coll, parent, world, kind="PLAIN_AXES", size=0.02, rot_z=0.0):
    e = obj(name)
    if e is None:
        e = bpy.data.objects.new(name, None)
        coll.objects.link(e)
    e.empty_display_type = kind
    e.empty_display_size = size
    e.parent = parent
    e.matrix_parent_inverse = Matrix.Identity(4)
    bpy.context.view_layer.update()
    e.matrix_world = Matrix.Translation(world) @ Matrix.Rotation(rot_z, 4, "Z")
    return e


def keep_world(o, parent):
    mw = o.matrix_world.copy()
    o.parent = parent
    o.matrix_parent_inverse = Matrix.Identity(4)
    bpy.context.view_layer.update()
    o.matrix_world = mw


def run():
    C = bpy.data.collections
    station = obj("test_station")
    anchors = C["Station_Anchors"]

    # 1. clutter off the counter (kept, but excluded from export)
    unused = C["Unused_props"]
    moved = []
    for n in CLUTTER:
        o = obj(n)
        if not o:
            continue
        for c in list(o.users_collection):
            c.objects.unlink(o)
        unused.objects.link(o)
        moved.append(n)

    # 2. the new bench / fridge / bin are replaced by the room's own furniture
    for n in ("station_bench", "fridge", "bin"):
        o = obj(n)
        if o and o.parent == station and o.get("blocker"):
            remove_tree(o)

    # 3. station parts onto the counter, turned to face the room
    place = {
        "master_vial_stand_root": (0.235, VY),
        "vial_rack": (0.345, VY),
        "tray_skin": (0.4875, VY + 0.030),
        "tray_eye": (0.6125, VY + 0.030),
        "tray_sens": (1.0700, VY + 0.030),
        "tray_acute": (1.1950, VY + 0.030),
    }
    for n, (x, y) in place.items():
        o = obj(n)
        o.location = (x, y, TOP)
        o.rotation_euler = (0, 0, math.pi / 2)
    obj("fx_drop").location = (0.3, VY, TOP + 0.12)

    # 4. room fridge: hinge for the door, eight slots on the middle shelf
    fridge_coll = C["Station_Fridge"]
    fr = empty("fridge", fridge_coll, station, Vector((-2.236, 1.02, FLOOR)), kind="CUBE", size=0.03)
    hinge = empty("fridge_door_hinge", fridge_coll, fr, Vector((HINGE.x, HINGE.y, 0.47)), kind="ARROWS", size=0.05)
    hinge["open_deg"] = OPEN_DEG
    hinge.rotation_mode = "XYZ"
    door = obj("door.001_glass_0")
    keep_world(door, hinge)
    empty("fridge_door_handle_grip", anchors, door, Vector((HINGE.x + HANDLE_LOCAL.x, HINGE.y + HANDLE_LOCAL.y, HANDLE_Z)), size=0.01)
    a = approach_from(HINGE + HANDLE_LOCAL, FACE_NX, GRIP_DOOR_OPEN)
    empty("fridge_door_open_approach", anchors, fr, a, kind="SINGLE_ARROW", size=0.05, rot_z=FACE_NX)
    # close: stand beside the swing, outside its circle, and pull the open door's free edge back
    empty("fridge_door_close_approach", anchors, fr, Vector((CLOSE_SPOT.x, CLOSE_SPOT.y, FLOOR)), kind="SINGLE_ARROW",
          size=0.05, rot_z=FACE)
    marker = bpy.data.meshes.get("fridge_slot_marker")
    slots_coll = C["Station_FridgeSlots"]
    for i in range(SLOTS):
        y = SLOT_Y0 + SLOT_DY * i
        s = empty(f"fridge_slot_{i}", slots_coll, fr, Vector((SLOT_X, y, PLACE_Z)), kind="CIRCLE", size=0.010)
        s["slot"] = i
        m = obj(f"fridge_slot_{i}_marker")
        if m is None and marker:
            m = bpy.data.objects.new(f"fridge_slot_{i}_marker", marker)
            slots_coll.objects.link(m)
        if m:
            m.parent = s
            m.matrix_parent_inverse = Matrix.Identity(4)
            m.location = (0, 0, 0)
        a = approach_from(Vector((SLOT_X, y)), FACE_NX, GRIP_PICK)
        empty(f"fridge_slot_{i}_approach", anchors, fr, a, kind="SINGLE_ARROW", size=0.05, rot_z=FACE_NX)
    if obj("fridge_slot_holder") is None:
        bm = bmesh.new()
        hx, hy0, hy1 = 0.020, SLOT_Y0 - 0.016, SLOT_Y0 + SLOT_DY * (SLOTS - 1) + 0.016
        vs = [bm.verts.new(p) for p in ((-hx, hy0, 0), (hx, hy0, 0), (hx, hy1, 0), (-hx, hy1, 0),
                                         (-hx, hy0, HOLDER_H), (hx, hy0, HOLDER_H), (hx, hy1, HOLDER_H), (-hx, hy1, HOLDER_H))]
        for f in ((0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7), (3, 2, 1, 0)):
            bm.faces.new([vs[i] for i in f])
        me = bpy.data.meshes.new("fridge_slot_holder")
        bm.to_mesh(me)
        bm.free()
        me.materials.append(bpy.data.materials["Prop_TealDark"])
        h = bpy.data.objects.new("fridge_slot_holder", me)
        slots_coll.objects.link(h)
    h = obj("fridge_slot_holder")
    h.parent = fr
    h.matrix_parent_inverse = Matrix.Identity(4)
    bpy.context.view_layer.update()
    h.matrix_world = Matrix.Translation((SLOT_X, 0, SHELF_TOP))
    # the two bottles on that shelf move up one shelf
    for n, y_new in (("flask12.001", 0.900), ("bottle.003", 1.130)):
        main = obj(n)
        if not main or main.matrix_world.translation.z > 0.75:   # already moved
            continue
        dy = y_new - main.matrix_world.translation.y
        for part in (n, n + "_liquid"):
            p = obj(part)
            if p:
                p.location.z += 0.880 - SHELF_TOP
                p.location.y += dy

    # 5. room bin: lid split off onto a back hinge
    bin_coll = C["Station_Bin"]
    bn = empty("bin", bin_coll, station, Vector((BIN_C.x, BIN_C.y, FLOOR)), kind="CUBE", size=0.03)
    body = obj("legs.001")
    keep_world(body, bn)
    lh = empty("bin_lid_hinge", bin_coll, bn, BIN_LID_HINGE, kind="ARROWS", size=0.04)
    lh["open_deg"] = -100.0
    lh.rotation_mode = "XYZ"
    if obj("bin_lid_room") is None:
        bm = bmesh.new()
        bm.from_mesh(body.data)
        W = body.matrix_world
        lid_faces = []
        for f in bm.faces:
            ws = [W @ v.co for v in f.verts]
            bracket = all(w.y > 1.075 and abs(w.x - BIN_C.x) < 0.012 for w in ws)
            if min(w.z for w in ws) >= 0.530 and not bracket:
                lid_faces.append(f)
        lid_bm = bmesh.new()
        vmap = {}
        for f in lid_faces:
            vs = []
            for v in f.verts:
                if v not in vmap:
                    vmap[v] = lid_bm.verts.new(v.co)
                vs.append(vmap[v])
            nf = lid_bm.faces.new(vs)
            nf.material_index = f.material_index
        bmesh.ops.delete(bm, geom=lid_faces, context="FACES_ONLY")
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
        bm.to_mesh(body.data)
        bm.free()
        lid_me = bpy.data.meshes.new("bin_lid_room")
        lid_bm.to_mesh(lid_me)
        lid_bm.free()
        for m in body.data.materials:
            lid_me.materials.append(m)
        lid = bpy.data.objects.new("bin_lid_room", lid_me)
        for c in body.users_collection:
            c.objects.link(lid)
        lid.matrix_world = body.matrix_world.copy()
        keep_world(lid, lh)
    empty("bin_drop_target", anchors, bn, Vector((BIN_C.x, BIN_C.y, 0.669)), kind="SPHERE", size=0.008)
    a = approach_from(BIN_C, FACE, GRIP_BIN)
    empty("bin_approach", anchors, bn, a, kind="SINGLE_ARROW", size=0.05, rot_z=FACE)

    # 6. prop clips on the new hinges (separate actions, as NLA tracks for export)
    for name in ("Fridge_Door_Open", "Fridge_Door_Close", "Bin_Lid_Open", "Bin_Lid_Close"):
        old = bpy.data.actions.get(name)
        if old:
            bpy.data.actions.remove(old)

    def prop_action(o, name, keys, axis):
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        ad = o.animation_data or o.animation_data_create()
        ad.action = act
        idx = "XYZ".index(axis)
        for f, deg in keys:
            r = [0.0, 0.0, 0.0]
            r[idx] = math.radians(deg)
            o.rotation_euler = r
            o.keyframe_insert("rotation_euler", index=idx, frame=f)
        from bpy_extras import anim_utils
        cb = anim_utils.action_get_channelbag_for_slot(act, ad.action_slot)
        for fc in cb.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
        ad.action = None
        o.rotation_euler = (0, 0, 0)
        return act

    tracks = {
        hinge: [prop_action(hinge, "Fridge_Door_Open", [(f, door_theta_open(f)) for f in range(49)], "Z"),
                prop_action(hinge, "Fridge_Door_Close", [(f, door_theta_close(f)) for f in range(49)], "Z")],
        lh: [prop_action(lh, "Bin_Lid_Open", [(0, 0), (10, -100), (12, -100)], "X"),
             prop_action(lh, "Bin_Lid_Close", [(0, -100), (10, 0), (12, 0)], "X")],
    }
    for o, acts in tracks.items():
        ad = o.animation_data
        for t in list(ad.nla_tracks):
            ad.nla_tracks.remove(t)
        for act in acts:
            tr = ad.nla_tracks.new()
            tr.name = act.name
            st = tr.strips.new(act.name, 0, act)
            if st.action_slot is None and len(act.slots):
                st.action_slot = act.slots[0]
    bpy.context.view_layer.update()
    return {"clutter_moved": len(moved), "close_spot": [round(CLOSE_SPOT.x, 4), round(CLOSE_SPOT.y, 4)],
            "open_root": [round(v, 4) for v in approach_from(HINGE + HANDLE_LOCAL, FACE_NX, GRIP_DOOR_OPEN)[:2]]}


RESULT = run()
