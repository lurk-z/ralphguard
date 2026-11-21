"""Builds the four-endpoint testing station in Lab2_3room_station.blend (run inside Blender).

Everything lives in the "TestStation" collection, one sub-collection per reusable part. Each
movable unit has an EMPTY root; anchors (approach spots, vial slots, drop targets, hinge pivots,
grip points) are separate EMPTY children, never baked into the meshes. Reusable meshes are
shared data blocks (all four trays share one tray mesh, all aliquots one vial mesh, ...).

Approach empties face the way the agent faces while working (local -Y forward, like the
character rig), and are placed from the analyst clip constants below, so a part that moves
carries its standing spots with it.

World units are the room's (1 unit = 1/0.44846 character metres). Re-running rebuilds the set.
"""
import math
import bmesh
import bpy
from mathutils import Matrix, Vector

SCALE = 0.44846                # character metres -> room units
FLOOR = 0.269
BENCH_TOP = 0.6091             # same height as table2.001
PLACE_Z = BENCH_TOP + 0.008    # every vial stands on this height (rack, tray slot, fridge shelf)

# Analyst clip constants (character space: agent at origin facing -Y, right hand on -X, metres).
GRIP_PICK = Vector((0.06, -0.46))      # hand socket over a vial for Station_Pick / Station_Place
GRIP_RELEASE_BIN = Vector((0.06, -0.40))
GRIP_DOOR_OPEN = Vector((-0.156, -0.457))
GRIP_DOOR_CLOSE = Vector((-0.10, -0.435))

ENDPOINTS = ["skin", "eye", "sens", "acute"]
FRIDGE_SLOTS = 8

COLL = "TestStation"


# ------------------------------------------------------------------ helpers
def coll(name, parent=None):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    p = parent or bpy.context.scene.collection
    if c.name not in [x.name for x in p.children]:
        p.children.link(c)
    return c


def wipe():
    root = bpy.data.collections.get(COLL)
    if not root:
        return
    def walk(c):
        for ch in list(c.children):
            walk(ch)
            bpy.data.collections.remove(ch)
        for o in list(c.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    walk(root)
    bpy.data.collections.remove(root)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    for a in list(bpy.data.actions):
        if a.name.startswith(("Fridge_Door_", "Bin_Lid_")):
            bpy.data.actions.remove(a)


def mat(name, rgb, alpha=1.0, rough=0.85, emit=None):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Alpha"].default_value = alpha
    if emit:
        b.inputs["Emission Color"].default_value = (*emit[0], 1.0)
        b.inputs["Emission Strength"].default_value = emit[1]
    if alpha < 1.0:
        try:
            m.surface_render_method = "BLENDED"
        except Exception:
            m.blend_method = "BLEND"
    return m


def M(name):
    return bpy.data.materials[name]


def empty(name, c, loc=(0, 0, 0), parent=None, size=0.02, kind="PLAIN_AXES", rot_z=0.0):
    o = bpy.data.objects.new(name, None)
    o.empty_display_type = kind
    o.empty_display_size = size
    c.objects.link(o)
    if parent:
        o.parent = parent
    o.location = loc
    o.rotation_euler = (0, 0, rot_z)
    return o


def obj(name, mesh, c, loc=(0, 0, 0), parent=None, rot=(0, 0, 0), scale=(1, 1, 1)):
    o = bpy.data.objects.new(name, mesh)
    c.objects.link(o)
    if parent:
        o.parent = parent
    o.location = loc
    o.rotation_euler = rot
    o.scale = scale
    return o


def mesh_from_bm(name, bm, mats):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = False
    return me


def octagon(bm, hx, hy, ch, z0, z1, mat_index=0, cap_top=True, cap_bottom=True):
    """Chamfered box (octagon footprint) from z0 to z1; returns (bottom ring, top ring)."""
    if ch <= 0:
        pts = [(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)]
    else:
        pts = [(-hx + ch, -hy), (hx - ch, -hy), (hx, -hy + ch), (hx, hy - ch),
               (hx - ch, hy), (-hx + ch, hy), (-hx, hy - ch), (-hx, -hy + ch)]
    n = len(pts)
    bot = [bm.verts.new((x, y, z0)) for x, y in pts]
    top = [bm.verts.new((x, y, z1)) for x, y in pts]
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((bot[i], bot[j], top[j], top[i]))
        f.material_index = mat_index
    if cap_top:
        bm.faces.new(top).material_index = mat_index
    if cap_bottom:
        bm.faces.new(list(reversed(bot))).material_index = mat_index
    return bot, top


def ring(bm, r, z, n=12, cx=0.0, cy=0.0):
    return [bm.verts.new((cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z))
            for i in range(n)]


def loft(bm, rings, mat_index=0, cap_top=True, cap_bottom=True):
    for a, b in zip(rings, rings[1:]):
        n = len(a)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i])).material_index = mat_index
    if cap_bottom:
        bm.faces.new(list(reversed(rings[0]))).material_index = mat_index
    if cap_top:
        bm.faces.new(rings[-1]).material_index = mat_index


def lathe(bm, profile, n=12, mat_index=0, cap_top=True, cap_bottom=True):
    """profile: [(radius, z), ...] bottom to top."""
    loft(bm, [ring(bm, r, z, n) for r, z in profile], mat_index, cap_top, cap_bottom)


def tube(bm, r_in, r_out, z0, z1, n=12, mat_index=0):
    """Open ring (holder collar): outer wall, inner wall and top annulus."""
    ob, ot = ring(bm, r_out, z0, n), ring(bm, r_out, z1, n)
    ib, it = ring(bm, r_in, z0, n), ring(bm, r_in, z1, n)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ob[i], ob[j], ot[j], ot[i])).material_index = mat_index
        bm.faces.new((ib[j], ib[i], it[i], it[j])).material_index = mat_index
        bm.faces.new((ot[i], ot[j], it[j], it[i])).material_index = mat_index


def boolean_holes(o, holes, keep_cutters=False):
    """Cut cylindrical holes [(x, y, r, z0, z1)] into object `o` (local coords)."""
    for i, (x, y, r, z0, z1) in enumerate(holes):
        bm = bmesh.new()
        lathe(bm, [(r, z0), (r, z1)], n=16)
        cut = bpy.data.objects.new(f"_cut{i}", mesh_from_bm(f"_cut{i}", bm, []))
        bpy.context.scene.collection.objects.link(cut)
        cut.matrix_world = o.matrix_world @ Matrix.Translation((x, y, 0))
        mod = o.modifiers.new(f"hole{i}", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.object = cut
        bpy.context.view_layer.objects.active = o
        with bpy.context.temp_override(object=o, active_object=o):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cut, do_unlink=True)


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
        return 45.0 + 55.0 * (1 - (1 - t) ** 2)
    return 100.0


def door_theta_close(f):
    if f <= 16:
        return 100.0
    if f <= 30:
        return 100.0 - 20.0 * smooth((f - 16) / 14)
    if f <= 40:
        t = (f - 30) / 10
        return 80.0 - 80.0 * t * t
    return 0.0


def approach_from(target_xy, facing_yaw_world, grip):
    """Standing spot so that the clip's hand socket (char-space `grip`) lands on `target_xy`.
    facing_yaw_world: Blender Z rotation of the approach empty (0 = agent facing -Y)."""
    c, s = math.cos(facing_yaw_world), math.sin(facing_yaw_world)
    gx, gy = grip.x * SCALE, grip.y * SCALE
    wx, wy = c * gx - s * gy, s * gx + c * gy
    return Vector((target_xy[0] - wx, target_xy[1] - wy, FLOOR))


FACE_PX = math.pi / 2     # agent facing +X  (rotate -Y onto +X)
FACE_NX = -math.pi / 2    # agent facing -X
FACE_NY = 0.0             # agent facing -Y


# ------------------------------------------------------------------ build
def build():
    wipe()
    root = coll(COLL)
    C = {n: coll(n, root) for n in (
        "Station_Bench", "Station_MasterVial", "Station_Rack", "Station_Aliquots", "Station_Dropper",
        "Station_Trays", "Station_SkinInsert", "Station_EyeInsert", "Station_AcuteInsert",
        "Station_Fridge", "Station_FridgeSlots", "Station_Bin", "Station_Effects", "Station_Anchors")}
    for ep in ENDPOINTS:
        C[f"Tray_{ep}"] = coll(f"Station_Tray_{ep}", C["Station_Trays"])

    # materials: reuse the room's prop palette, add glass / liquid / tissue / effects
    glass = mat("Station_Glass", (0.80, 0.90, 0.92), alpha=0.32, rough=0.08)
    liquid = mat("Station_Liquid", (0.10, 0.52, 0.47), alpha=0.85, rough=0.3, emit=((0.02, 0.16, 0.14), 0.4))
    epi = mat("Skin_Epidermis", (0.89, 0.55, 0.38), rough=0.9)
    der = mat("Skin_Dermis", (0.78, 0.27, 0.30), rough=0.9)
    fat = mat("Skin_Fat", (0.91, 0.76, 0.30), rough=0.9)
    sclera = mat("Eye_Sclera", (0.86, 0.85, 0.82), rough=0.5)
    iris = mat("Eye_Iris", (0.12, 0.30, 0.27), rough=0.4)
    pupil = mat("Eye_Pupil", (0.02, 0.02, 0.025), rough=0.3)
    red = mat("FX_Redness", (0.75, 0.06, 0.07), alpha=0.55, rough=0.9)
    drop_m = mat("FX_Drop", (0.10, 0.55, 0.50), alpha=0.75, rough=0.1)
    white = mat("Station_White", (0.80, 0.82, 0.84), rough=0.7)
    screen = mat("Station_Display", (0.88, 0.90, 0.90), rough=0.6)
    cream, teal, tealdk = M("Prop_Cream"), M("Prop_Teal"), M("Prop_TealDark")
    lgray, label, metal, dark = M("Prop_LightGray"), M("Prop_Paper"), M("Prop_Metal"), M("Prop_Dark")

    # ---------------- bench: a linked duplicate of the right-room desk, turned along the wall
    desk = bpy.data.objects["table2.001"]
    bench = obj("station_bench", desk.data, C["Station_Bench"], loc=(3.715, -1.12, desk.location.z),
                rot=(0, 0, math.pi / 2), scale=(0.348 * 0.84 / 0.696, 0.348, 0.348))
    bench["blocker"] = True

    VX = 3.66  # vial line along the bench (0.085 in from the near edge)

    # ---------------- aliquot vial + dropper (shared meshes)
    VR, VH = 0.0075, 0.035
    bm = bmesh.new()
    lathe(bm, [(VR * 0.92, 0.0), (VR, 0.002), (VR, VH - 0.003), (VR * 0.82, VH - 0.001), (VR * 0.82, VH)],
          n=12, cap_top=False)
    vial_me = mesh_from_bm("aliquot_vial", bm, [glass])
    bm = bmesh.new()
    lathe(bm, [(VR * 0.85, 0.0015), (VR * 0.85, VH * 0.62)], n=12)
    vial_liq_me = mesh_from_bm("aliquot_liquid", bm, [liquid])
    bm = bmesh.new()  # band that carries the endpoint label colour
    lathe(bm, [(VR * 1.04, VH * 0.30), (VR * 1.04, VH * 0.52)], n=12, cap_top=False, cap_bottom=False)
    band_me = mesh_from_bm("aliquot_band", bm, [label])

    # dropper: tube (glass) + collar + bulb (teal), origin at the tip; total 0.055
    bm = bmesh.new()
    tube_prof = [(0.0011, 0.0), (0.0016, 0.004), (0.0028, 0.010), (0.0030, 0.036)]
    lathe(bm, tube_prof, n=8, mat_index=0, cap_bottom=True, cap_top=False)
    lathe(bm, [(0.0042, 0.036), (0.0042, 0.040), (0.0038, 0.0405)], n=8, mat_index=1)
    lathe(bm, [(0.0040, 0.0405), (0.0052, 0.044), (0.0058, 0.048), (0.0050, 0.052), (0.0030, 0.0548), (0.0008, 0.055)],
          n=8, mat_index=1, cap_bottom=False)
    dropper_me = mesh_from_bm("dropper", bm, [glass, teal])
    DROPPER_SEAT = VH - 0.028   # tip height inside the vial (tip 7 mm above the vial floor)

    # drop effect (single shared mesh, the web clones it per dispense)
    bm = bmesh.new()
    lathe(bm, [(0.0001, -0.0045), (0.0024, -0.0028), (0.0030, -0.0010), (0.0022, 0.0008), (0.0001, 0.0030)], n=8)
    drop_me = mesh_from_bm("fx_drop", bm, [drop_m])

    # ---------------- master vial (bigger bottle with a teal cap) on its own stand
    bm = bmesh.new()
    lathe(bm, [(0.0105, 0.0), (0.012, 0.003), (0.012, 0.040), (0.007, 0.046), (0.007, 0.050)], n=14, cap_top=False)
    master_me = mesh_from_bm("master_vial_glass", bm, [glass])
    bm = bmesh.new()
    lathe(bm, [(0.0108, 0.002), (0.0108, 0.030)], n=14)
    master_liq_me = mesh_from_bm("master_vial_liquid", bm, [liquid])
    bm = bmesh.new()
    lathe(bm, [(0.0078, 0.048), (0.0078, 0.058), (0.006, 0.060)], n=14)
    cap_me = mesh_from_bm("master_vial_cap", bm, [teal])
    bm = bmesh.new()
    octagon(bm, 0.020, 0.020, 0.006, 0.0, 0.008, 0)
    stand_me = mesh_from_bm("master_vial_stand", bm, [tealdk])

    ms = empty("master_vial_stand_root", C["Station_MasterVial"], (VX, -0.775, BENCH_TOP), kind="CUBE", size=0.01)
    obj("master_vial_stand", stand_me, C["Station_MasterVial"], parent=ms)
    slot = empty("master_vial_slot", C["Station_Anchors"], (0, 0, PLACE_Z - BENCH_TOP), parent=ms, kind="CIRCLE", size=0.012)
    mv = empty("master_vial", C["Station_MasterVial"], (0, 0, 0), parent=slot, kind="SINGLE_ARROW", size=0.02)
    obj("master_vial_glass", master_me, C["Station_MasterVial"], parent=mv)
    obj("master_vial_liquid", master_liq_me, C["Station_MasterVial"], parent=mv)
    obj("master_vial_cap", cap_me, C["Station_MasterVial"], parent=mv)
    empty("master_vial_grip", C["Station_Anchors"], (0, 0, 0.030), parent=mv, size=0.01)
    a = approach_from((VX, -0.775), FACE_PX, GRIP_PICK)
    empty("master_vial_approach", C["Station_Anchors"], a - ms.location, parent=ms, kind="SINGLE_ARROW",
          size=0.05, rot_z=FACE_PX)

    # ---------------- vial rack (reference: teal base, light grey top frame, four holes, label plates)
    RL, RD = 0.160, 0.050           # length (along world -Y) x depth (along X)
    rack = empty("vial_rack", C["Station_Rack"], (VX, -0.920, BENCH_TOP), kind="CUBE", size=0.01)
    rack["blocker"] = False
    hole_y = [0.0525, 0.0175, -0.0175, -0.0525]
    bm = bmesh.new()
    octagon(bm, RD / 2, RL / 2, 0.010, 0.0, 0.012, 0)
    base_me = mesh_from_bm("vial_rack_base", bm, [teal])
    base = obj("vial_rack_base", base_me, C["Station_Rack"], parent=rack)
    boolean_holes(base, [(0, y, VR + 0.0018, PLACE_Z - BENCH_TOP, 0.02) for y in hole_y])
    bm = bmesh.new()  # top frame: bar + two slanted legs
    octagon(bm, RD / 2 - 0.004, RL / 2 - 0.004, 0.006, 0.026, 0.031, 0)
    for sy in (-1, 1):
        y0 = sy * (RL / 2 - 0.010)
        v = [bm.verts.new(p) for p in (
            (-0.016, y0 - 0.006, 0.012), (0.016, y0 - 0.006, 0.012), (0.016, y0 + 0.006, 0.012), (-0.016, y0 + 0.006, 0.012),
            (-0.018, y0 - 0.004 + sy * 0.004, 0.027), (0.018, y0 - 0.004 + sy * 0.004, 0.027),
            (0.018, y0 + 0.004 + sy * 0.004, 0.027), (-0.018, y0 + 0.004 + sy * 0.004, 0.027))]
        for f in ((0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7), (3, 2, 1, 0)):
            bm.faces.new([v[i] for i in f])
    frame_me = mesh_from_bm("vial_rack_frame", bm, [lgray])
    frame = obj("vial_rack_frame", frame_me, C["Station_Rack"], parent=rack)
    boolean_holes(frame, [(0, y, VR + 0.0016, 0.020, 0.04) for y in hole_y])
    bm = bmesh.new()  # label plate (shared by rack and trays: scaled per use)
    octagon(bm, 0.0006, 0.5, 0.0, 0.0, 1.0, 0)
    plate_me = mesh_from_bm("label_plate", bm, [label])
    for i, ep in enumerate(ENDPOINTS):
        y = hole_y[i]
        obj(f"rack_label_{ep}", plate_me, C["Station_Rack"], (-RD / 2 - 0.0006, y, 0.003), parent=rack,
            scale=(1, 0.028, 0.006))
        hs = empty(f"rack_slot_{ep}", C["Station_Anchors"], (0, y, PLACE_Z - BENCH_TOP), parent=rack,
                   kind="CIRCLE", size=0.010)
        a = approach_from((VX, rack.location.y + y), FACE_PX, GRIP_PICK)
        empty(f"rack_slot_{ep}_approach", C["Station_Anchors"], a - rack.location, parent=rack,
              kind="SINGLE_ARROW", size=0.05, rot_z=FACE_PX)
        # the aliquot that starts in this slot (moves between rack, tray, fridge and bin)
        al = empty(f"aliquot_{ep}", C["Station_Aliquots"], (0, 0, 0), parent=hs, kind="SINGLE_ARROW", size=0.02)
        obj(f"aliquot_{ep}_vial", vial_me, C["Station_Aliquots"], parent=al)
        obj(f"aliquot_{ep}_liquid", vial_liq_me, C["Station_Aliquots"], parent=al)
        obj(f"aliquot_{ep}_band", band_me, C["Station_Aliquots"], parent=al)
        empty(f"aliquot_{ep}_grip", C["Station_Anchors"], (0, 0, VH * 0.6), parent=al, size=0.008)
        dr = empty(f"aliquot_{ep}_dropper", C["Station_Dropper"], (0, 0, DROPPER_SEAT), parent=al,
                   kind="SINGLE_ARROW", size=0.015)
        obj(f"aliquot_{ep}_dropper_mesh", dropper_me, C["Station_Dropper"], parent=dr)
        empty(f"aliquot_{ep}_dropper_grip", C["Station_Anchors"], (0, 0, 0.047), parent=dr, size=0.008)
        empty(f"aliquot_{ep}_dropper_tip", C["Station_Anchors"], (0, 0, 0.0), parent=dr, size=0.005)

    # ---------------- trays (reference: cream rim over a dark teal base, label plate on the front)
    TS = 0.115
    bm = bmesh.new()
    octagon(bm, TS / 2, TS / 2, 0.012, 0.0, 0.008, 1, cap_top=False)      # dark base (the floor caps it)
    ob, ot = octagon(bm, TS / 2, TS / 2, 0.012, 0.008, 0.022, 0, cap_top=False, cap_bottom=False)
    ib, it = octagon(bm, TS / 2 - 0.010, TS / 2 - 0.010, 0.009, 0.008, 0.022, 0, cap_top=False, cap_bottom=False)
    for i in range(8):                                                  # rim top between outer and inner walls
        j = (i + 1) % 8
        bm.faces.new((ot[i], ot[j], it[j], it[i])).material_index = 0
    for f in list(bm.faces):                                            # inner wall faces point inward
        if all(v in ib + it for v in f.verts):
            f.normal_flip()
    floor = bm.faces.new(ib)                                            # tray floor (= PLACE_Z)
    floor.material_index = 0
    tray_me = mesh_from_bm("tray", bm, [cream, tealdk])
    bm = bmesh.new()  # small ring that holds the aliquot inside the tray
    tube(bm, VR + 0.0015, VR + 0.0040, 0.0, 0.006)
    holder_me = mesh_from_bm("tray_vial_holder", bm, [tealdk])
    bm = bmesh.new()  # upright result display card on a foot
    octagon(bm, 0.003, 0.042, 0.0, 0.0, 0.058, 0)
    octagon(bm, 0.012, 0.030, 0.004, 0.0, 0.004, 1)
    display_me = mesh_from_bm("result_display", bm, [screen, tealdk])
    bm = bmesh.new()  # the face the web draws the result on (UV 0..1), facing -X
    v = [bm.verts.new(p) for p in ((0, 0.039, 0.007), (0, -0.039, 0.007), (0, -0.039, 0.055), (0, 0.039, 0.055))]
    f = bm.faces.new(v)
    uv = bm.loops.layers.uv.new("UVMap")
    for loop, co in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = co
    if f.normal.x > 0:
        f.normal_flip()
    face_me = mesh_from_bm("result_display_face", bm, [screen])

    # skin cross-section insert (reference: peach epidermis, pink dermis, yellow fat; wavy top)
    IS, IH = 0.058, 0.030
    def wave(x, y):
        return 0.0028 * math.sin(x * 70 + 0.6) * math.cos(y * 55) + 0.0015 * math.sin(y * 90)
    def layer_block(z0, z1, wavy_top, mat_i, wavy_bottom=False, n=4):
        verts = {}
        for top in (0, 1):
            for i in range(n + 1):
                for j in range(n + 1):
                    x = -IS / 2 + IS * i / n
                    y = -IS / 2 + IS * j / n
                    z = (z1 + (wave(x, y) if wavy_top else 0)) if top else (z0 + (wave(x, y) * 0.6 if wavy_bottom else 0))
                    verts[(top, i, j)] = bm.verts.new((x, y, z))
        for i in range(n):
            for j in range(n):
                bm.faces.new((verts[(1, i, j)], verts[(1, i + 1, j)], verts[(1, i + 1, j + 1)], verts[(1, i, j + 1)])).material_index = mat_i
                bm.faces.new((verts[(0, i, j + 1)], verts[(0, i + 1, j + 1)], verts[(0, i + 1, j)], verts[(0, i, j)])).material_index = mat_i
        for k in range(n):
            for side in ((lambda t: (t, 0)), (lambda t: (n, t)), (lambda t: (n - t, n)), (lambda t: (0, n - t))):
                a0, a1 = side(k), side(k + 1)
                bm.faces.new((verts[(0, *a0)], verts[(0, *a1)], verts[(1, *a1)], verts[(1, *a0)])).material_index = mat_i
    bm = bmesh.new()
    layer_block(0.000, 0.010, False, 2)
    skin_fat_me = mesh_from_bm("skin_insert_fat", bm, [epi, der, fat])
    bm = bmesh.new()
    layer_block(0.010, 0.024, True, 1)
    skin_der_me = mesh_from_bm("skin_insert_dermis", bm, [epi, der, fat])
    bm = bmesh.new()
    layer_block(0.024, 0.030, True, 0, wavy_bottom=False)
    skin_epi_me = mesh_from_bm("skin_insert_epidermis", bm, [epi, der, fat])
    # redness overlay sits just above the epidermis (opacity/scale driven by the web, 0 = hidden)
    bm = bmesh.new()
    n = 4
    vv = {}
    for i in range(n + 1):
        for j in range(n + 1):
            x = -IS / 2 * 0.8 + IS * 0.8 * i / n
            y = -IS / 2 * 0.8 + IS * 0.8 * j / n
            vv[(i, j)] = bm.verts.new((x, y, IH + wave(x, y) + 0.0009))
    for i in range(n):
        for j in range(n):
            bm.faces.new((vv[(i, j)], vv[(i + 1, j)], vv[(i + 1, j + 1)], vv[(i, j + 1)]))
    redness_me = mesh_from_bm("fx_redness", bm, [red])

    # eye insert (eye-specific visual): sclera dome with iris and pupil on a dark teal cup
    bm = bmesh.new()
    lathe(bm, [(0.020, 0.0), (0.022, 0.006), (0.020, 0.008)], n=12, mat_index=0)
    cup_me = mesh_from_bm("eye_insert_cup", bm, [tealdk])
    bm = bmesh.new()
    prof = [(0.019 * math.sin(math.radians(a)), 0.008 + 0.019 * math.cos(math.radians(a)) * 0.9) for a in range(90, -1, -15)]
    lathe(bm, prof[:-1] + [(0.0001, prof[-1][1])], n=12, mat_index=0, cap_top=False)
    eye_me = mesh_from_bm("eye_insert_globe", bm, [sclera])
    bm = bmesh.new()
    lathe(bm, [(0.0085, 0.0250), (0.0060, 0.0255), (0.0001, 0.0258)], n=12, mat_index=0, cap_bottom=False, cap_top=False)
    iris_me = mesh_from_bm("eye_insert_iris", bm, [iris])
    bm = bmesh.new()
    lathe(bm, [(0.0032, 0.0257), (0.0001, 0.0260)], n=10, mat_index=0, cap_bottom=False, cap_top=False)
    pupil_me = mesh_from_bm("eye_insert_pupil", bm, [pupil])
    bm = bmesh.new()  # redness ring around the iris (web-driven)
    lathe(bm, [(0.0175, 0.0170), (0.0130, 0.0222), (0.0090, 0.0249)], n=12, cap_bottom=False, cap_top=False)
    eye_red_me = mesh_from_bm("fx_eye_redness", bm, [red])

    # acute insert: a neutral six-well plate (no tissue; the result is a card, not a look)
    bm = bmesh.new()
    octagon(bm, 0.026, 0.036, 0.004, 0.0, 0.010, 0)
    plate_well_me = mesh_from_bm("acute_well_plate", bm, [white])

    tray_y = [-1.080, -1.205, -1.330, -1.455]
    SLOT = Vector((-0.030, 0.035))       # vial holder: near-left corner (the left hand carries vials)
    INSERT = Vector((0.008, -0.012))   # right of the slot: the right hand works the dropper
    for ep, ty in zip(ENDPOINTS, tray_y):
        c = C[f"Tray_{ep}"]
        t = empty(f"tray_{ep}", c, (VX + 0.030, ty, BENCH_TOP), kind="CUBE", size=0.01)
        t["endpoint"] = ep
        obj(f"tray_{ep}_body", tray_me, c, parent=t)
        obj(f"tray_{ep}_label", plate_me, c, (-TS / 2 - 0.0006, 0.0, 0.0105), parent=t, scale=(1, 0.060, 0.008))
        obj(f"tray_{ep}_vial_holder", holder_me, c, (SLOT.x, SLOT.y, 0.008), parent=t)
        disp = empty(f"tray_{ep}_display", c, (TS / 2 + 0.010, 0.0, 0.0), parent=t, kind="CUBE", size=0.005)
        obj(f"tray_{ep}_display_stand", display_me, c, parent=disp)
        obj(f"tray_{ep}_display_face", face_me, c, (-0.0032, 0, 0), parent=disp)
        ins = empty(f"tray_{ep}_insert", c, (INSERT.x, INSERT.y, 0.008), parent=t, kind="CUBE", size=0.005)
        if ep in ("skin", "sens"):
            ic = C["Station_SkinInsert"]
            obj(f"tray_{ep}_skin_fat", skin_fat_me, ic, parent=ins)
            obj(f"tray_{ep}_skin_dermis", skin_der_me, ic, parent=ins)
            obj(f"tray_{ep}_skin_epidermis", skin_epi_me, ic, parent=ins)
            fx = obj(f"fx_{ep}_redness", redness_me, C["Station_Effects"], parent=ins)
            fx["illustrative"] = ep == "sens"
            top = IH
        elif ep == "eye":
            ic = C["Station_EyeInsert"]
            obj("tray_eye_cup", cup_me, ic, parent=ins)
            obj("tray_eye_globe", eye_me, ic, parent=ins)
            obj("tray_eye_iris", iris_me, ic, parent=ins)
            obj("tray_eye_pupil", pupil_me, ic, parent=ins)
            obj("fx_eye_redness", eye_red_me, C["Station_Effects"], parent=ins)
            top = 0.026
        else:
            ic = C["Station_AcuteInsert"]
            wp = obj("tray_acute_well_plate", plate_well_me, ic, parent=ins)
            boolean_holes(wp, [(x, y, 0.0075, 0.004, 0.02) for x in (-0.011, 0.011) for y in (-0.022, 0.0, 0.022)])
            top = 0.010
        empty(f"tray_{ep}_drop_target", C["Station_Anchors"], (0, 0, top), parent=ins, kind="SPHERE", size=0.006)
        empty(f"tray_{ep}_vial_slot", C["Station_Anchors"], (SLOT.x, SLOT.y, PLACE_Z - BENCH_TOP), parent=t,
              kind="CIRCLE", size=0.010)
        a = approach_from((t.location.x + SLOT.x, ty + SLOT.y), FACE_PX, GRIP_PICK)
        empty(f"tray_{ep}_approach", C["Station_Anchors"], a - t.location, parent=t, kind="SINGLE_ARROW",
              size=0.05, rot_z=FACE_PX)

    # ---------------- fridge (glass door on a hinge, one shelf of slots at PLACE_Z)
    FX0, FX1, FY0, FY1, FZ1 = 2.560, 2.845, -1.450, -1.150, 0.800
    fr = empty("fridge", C["Station_Fridge"], ((FX0 + FX1) / 2, (FY0 + FY1) / 2, FLOOR), kind="CUBE", size=0.02)
    fr["blocker"] = True
    hx, hy, H = (FX1 - FX0) / 2, (FY1 - FY0) / 2, FZ1 - FLOOR
    W = 0.014
    bm = bmesh.new()
    def box(x0, x1, y0, y1, z0, z1, mi=0):
        vs = [bm.verts.new(p) for p in ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
        for fi in ((0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7), (3, 2, 1, 0)):
            bm.faces.new([vs[i] for i in fi]).material_index = mi
    box(-hx, hx, -hy, hy, 0.0, 0.030, 1)                 # plinth
    box(-hx, -hx + W, -hy, hy, 0.030, H)                 # back
    box(-hx, hx, -hy, -hy + W, 0.030, H)                 # side
    box(-hx, hx, hy - W, hy, 0.030, H)                   # side
    box(-hx, hx, -hy, hy, H - W, H)                      # top
    box(-hx, hx, -hy, hy, 0.030, 0.030 + W)              # floor
    body_me = mesh_from_bm("fridge_body", bm, [white, tealdk])
    obj("fridge_body", body_me, C["Station_Fridge"], parent=fr)
    bm = bmesh.new()
    box(-hx + W, hx - 0.010, -hy + W, hy - W, PLACE_Z - FLOOR - 0.006, PLACE_Z - FLOOR, 0)
    shelf_me = mesh_from_bm("fridge_shelf", bm, [lgray])
    obj("fridge_shelf", shelf_me, C["Station_Fridge"], parent=fr)
    bm = bmesh.new()  # second, decorative lower shelf
    box(-hx + W, hx - 0.010, -hy + W, hy - W, 0.17, 0.176, 0)
    obj("fridge_shelf_low", mesh_from_bm("fridge_shelf_low", bm, [lgray]), C["Station_Fridge"], parent=fr)
    # door: hinge on the +Y edge of the front, door spans toward -Y; rotation Z (+) opens it into the room
    hinge = empty("fridge_door_hinge", C["Station_Fridge"], (hx + 0.010, hy, 0.0), parent=fr, kind="ARROWS", size=0.04)
    hinge["open_deg"] = 100.0
    DL = FY1 - FY0
    bm = bmesh.new()
    FW = 0.018
    box(-0.010, 0.006, -DL, 0.0, 0.030, 0.030 + FW, 0)          # frame bottom
    box(-0.010, 0.006, -DL, 0.0, H - FW, H, 0)                  # frame top
    box(-0.010, 0.006, -FW, 0.0, 0.030, H, 0)                   # hinge stile
    box(-0.010, 0.006, -DL, -DL + FW, 0.030, H, 0)              # handle stile
    door_me = mesh_from_bm("fridge_door_frame", bm, [white])
    door = obj("fridge_door", door_me, C["Station_Fridge"], parent=hinge)
    bm = bmesh.new()
    box(-0.004, 0.0, -DL + FW, -FW, 0.030 + FW, H - FW, 0)
    obj("fridge_door_glass", mesh_from_bm("fridge_door_glass", bm, [glass]), C["Station_Fridge"], parent=door)
    bm = bmesh.new()
    box(0.006, 0.016, -0.006, 0.0, 0.0, 0.004, 0)
    box(0.006, 0.016, -0.006, 0.0, 0.11, 0.114, 0)
    box(0.012, 0.018, -0.006, 0.0, 0.0, 0.114, 0)
    handle_me = mesh_from_bm("fridge_door_handle", bm, [metal])
    obj("fridge_door_handle", handle_me, C["Station_Fridge"], (0.0, -DL + 0.020, 0.39), parent=door)
    empty("fridge_door_handle_grip", C["Station_Anchors"], (0.015, -DL + 0.017, 0.445), parent=door, size=0.01)
    # slots
    bm = bmesh.new()
    tube(bm, VR + 0.0015, VR + 0.0040, 0.0, 0.004)
    slot_me = mesh_from_bm("fridge_slot_marker", bm, [tealdk])
    SX = FX1 - 0.085
    for i in range(FRIDGE_SLOTS):
        y = -1.235 - 0.026 * i
        s = empty(f"fridge_slot_{i}", C["Station_FridgeSlots"], (SX - fr.location.x, y - fr.location.y, PLACE_Z - FLOOR),
                  parent=fr, kind="CIRCLE", size=0.010)
        s["slot"] = i
        obj(f"fridge_slot_{i}_marker", slot_me, C["Station_FridgeSlots"], parent=s)
        a = approach_from((SX, y), FACE_NX, GRIP_PICK)
        empty(f"fridge_slot_{i}_approach", C["Station_Anchors"], a - fr.location, parent=fr, kind="SINGLE_ARROW",
              size=0.05, rot_z=FACE_NX)
    # door spots: open (handle at closed position), close (push the open door's outer face)
    hg = Vector((FX1 + 0.025, FY0 + 0.017))
    a = approach_from(hg, FACE_NX, GRIP_DOOR_OPEN)
    empty("fridge_door_open_approach", C["Station_Anchors"], a - fr.location, parent=fr, kind="SINGLE_ARROW",
          size=0.05, rot_z=FACE_NX)
    th = math.radians(100)
    px, py = 0.022, -0.200   # door outer face, 0.20 out from the hinge (door frame)
    push = Vector((FX1 + 0.010 + px * math.cos(th) - py * math.sin(th), FY1 + px * math.sin(th) + py * math.cos(th)))
    a = approach_from(push, FACE_NY, GRIP_DOOR_CLOSE)
    empty("fridge_door_close_approach", C["Station_Anchors"], a - fr.location, parent=fr, kind="SINGLE_ARROW",
          size=0.05, rot_z=FACE_NY)

    # ---------------- bin (pedal bin, lid on a back hinge)
    BX, BY, BR, BH = 2.665, -0.850, 0.062, 0.220
    bn = empty("bin", C["Station_Bin"], (BX, BY, FLOOR), kind="CUBE", size=0.02)
    bn["blocker"] = True
    bm = bmesh.new()
    lathe(bm, [(BR * 0.92, 0.0), (BR, 0.012), (BR, BH - 0.012), (BR * 1.02, BH - 0.010), (BR * 1.02, BH)], n=12,
          cap_top=False)
    lathe(bm, [(BR * 0.97, BH), (BR * 0.97, 0.03)], n=12, cap_top=False, cap_bottom=True)
    bin_me = mesh_from_bm("bin_body", bm, [tealdk])
    obj("bin_body", bin_me, C["Station_Bin"], parent=bn)
    bm = bmesh.new()
    box(BR * 0.55, BR * 1.25, -0.022, 0.022, 0.006, 0.016, 0)
    obj("bin_pedal", mesh_from_bm("bin_pedal", bm, [metal]), C["Station_Bin"], parent=bn)
    lh = empty("bin_lid_hinge", C["Station_Bin"], (-BR * 1.02, 0.0, BH), parent=bn, kind="ARROWS", size=0.03)
    lh["open_deg"] = -100.0
    bm = bmesh.new()
    prof = []
    lathe(bm, [(BR * 1.04, 0.0), (BR * 1.04, 0.008), (BR * 0.85, 0.018), (BR * 0.30, 0.022)], n=12)
    for v in bm.verts:
        v.co.x += BR * 1.02
    lid_me = mesh_from_bm("bin_lid", bm, [lgray])
    obj("bin_lid", lid_me, C["Station_Bin"], parent=lh)
    empty("bin_drop_target", C["Station_Anchors"], (0, 0, 0.40), parent=bn, kind="SPHERE", size=0.008)
    a = approach_from((BX, BY), FACE_NX, GRIP_RELEASE_BIN)
    empty("bin_approach", C["Station_Anchors"], a - bn.location, parent=bn, kind="SINGLE_ARROW", size=0.05,
          rot_z=FACE_NX)

    # ---------------- effects template (hidden until the web clones it)
    d = obj("fx_drop", drop_me, C["Station_Effects"], (VX, -0.70, BENCH_TOP + 0.10))
    d.hide_render = False

    # ---------------- prop clips (separate actions; the web plays each with its character clip)
    def prop_action(o, name, keys, axis, linear=False):
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        o.animation_data_create()
        o.animation_data.action = act
        o.rotation_mode = "XYZ"
        idx = "XYZ".index(axis)
        for f, deg in keys:
            r = list(o.rotation_euler)
            r[idx] = math.radians(deg)
            o.rotation_euler = r
            o.keyframe_insert("rotation_euler", index=idx, frame=f)
        if linear:
            from bpy_extras import anim_utils
            cb = anim_utils.action_get_channelbag_for_slot(act, o.animation_data.action_slot)
            for fc in cb.fcurves:
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"
        o.animation_data.action = None
        o.rotation_euler = (0, 0, 0)
        return act
    # door angle per frame: the same curves the analyst's Fridge_Open / Fridge_Close hand follows
    # (build_station_clips.py door_theta_open / door_theta_close), so hand and door stay together
    prop_action(hinge, "Fridge_Door_Open", [(f, door_theta_open(f)) for f in range(49)], "Z", linear=True)
    prop_action(hinge, "Fridge_Door_Close", [(f, door_theta_close(f)) for f in range(49)], "Z", linear=True)
    prop_action(lh, "Bin_Lid_Open", [(0, 0), (10, -100), (12, -100)], "Y")
    prop_action(lh, "Bin_Lid_Close", [(0, -100), (10, 0), (12, 0)], "Y")

    bpy.context.view_layer.update()
    return {"objects": len([o for o in bpy.data.objects if o.users_collection and
                            any(c.name.startswith(("Station_", COLL)) for c in o.users_collection)])}


RESULT = build()
