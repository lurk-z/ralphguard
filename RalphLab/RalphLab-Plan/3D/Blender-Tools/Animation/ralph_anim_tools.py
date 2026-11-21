"""
Ralph Lab character animation helpers (Blender 5.x).

Load in Blender with:  exec(open(r"C:\\Users\\zazaj\\Downloads\\RalphLab\\characters\\ralph_anim_tools.py", encoding="utf-8").read())

Conventions (pilot rig, glTF import, 52 bones, metres):
  * armature object sits at the origin with identity transform, so armature space == world space
  * the character faces -Y, up is +Z, its left side is +X
  * poses are stored as {bone_name: matrix_basis}; actions are written densely, one key per frame
"""
import bpy, math
from mathutils import Matrix, Vector, Quaternion

S = bpy.context.scene
FPS = 24
FWD = Vector((0, -1, 0))
UP = Vector((0, 0, 1))


def upd():
    bpy.context.view_layer.update()


def arm_obj(name="Char1_Armature"):
    """The armature to edit. NLA evaluation is switched off: with export tracks active, every
    view-layer update would overwrite the pose being built (re-enable it before exporting)."""
    arm = bpy.data.objects[name]
    if arm.animation_data:
        arm.animation_data.use_nla = False
    return arm


def bone_order(arm):
    out = []

    def rec(b):
        out.append(b.name)
        for c in b.children:
            rec(c)

    for b in arm.data.bones:
        if b.parent is None:
            rec(b)
    return out


# ---------------------------------------------------------------- actions / poses
def set_action(arm, action):
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = action
    # Always bind the new action's own slot: a slot left over from another action means nothing plays.
    if action is not None and len(getattr(action, "slots", [])):
        if ad.action_slot is None or ad.action_slot not in list(action.slots):
            ad.action_slot = action.slots[0]


def basis_at(arm, action, frame, subframe=0.0):
    set_action(arm, action)
    S.frame_set(int(frame), subframe=subframe)
    B = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
    set_action(arm, None)
    return B


def capture(arm):
    return {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}


def apply(arm, B):
    for pb in arm.pose.bones:
        pb.matrix_basis = B.get(pb.name, Matrix.Identity(4)).copy()
    upd()


def lerp_pose(A, B, t):
    out = {}
    for n in A:
        la, ra, sa = A[n].decompose()
        lb, rb, sb = B[n].decompose()
        if ra.dot(rb) < 0:
            rb = -rb
        out[n] = Matrix.LocRotScale(la.lerp(lb, t), ra.slerp(rb, t), sa.lerp(sb, t))
    return out


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- world-space edits
def _axis(a):
    if isinstance(a, str):
        return {"X": Vector((1, 0, 0)), "Y": Vector((0, 1, 0)), "Z": Vector((0, 0, 1))}[a]
    return Vector(a).normalized()


def rot(arm, bone, axis, deg, pivot=None):
    """Rotate a bone (and its children) about a world axis through its head."""
    pb = arm.pose.bones[bone]
    h = pb.head.copy() if pivot is None else Vector(pivot)
    R = Matrix.Rotation(math.radians(deg), 4, _axis(axis))
    pb.matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ pb.matrix
    upd()


def move(arm, bone, delta):
    pb = arm.pose.bones[bone]
    pb.matrix = Matrix.Translation(Vector(delta)) @ pb.matrix
    upd()


def aim(arm, bone, child_head_of, target, weight=1.0):
    """Rotate `bone` about its head so the head of `child_head_of` points at `target`."""
    pb = arm.pose.bones[bone]
    cur = arm.pose.bones[child_head_of].head - pb.head
    want = Vector(target) - pb.head
    if cur.length < 1e-6 or want.length < 1e-6:
        return
    q = cur.rotation_difference(want)
    if weight != 1.0:
        q = Quaternion().slerp(q, weight)
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix
    upd()


def set_world_rot(arm, bone, rot3):
    """Give a bone an absolute world orientation (3x3), keeping its head where it is."""
    pb = arm.pose.bones[bone]
    pb.matrix = Matrix.Translation(pb.head) @ rot3.to_4x4()
    upd()


def world_rot(arm, bone):
    return arm.pose.bones[bone].matrix.to_3x3().normalized()


# ---------------------------------------------------------------- two-bone IK (analytic)
LIMBS = {
    "LeftLeg": ("LeftUpLeg", "LeftLeg", "LeftFoot"),
    "RightLeg": ("RightUpLeg", "RightLeg", "RightFoot"),
    "LeftArm": ("LeftArm", "LeftForeArm", "LeftHand"),
    "RightArm": ("RightArm", "RightForeArm", "RightHand"),
}


def ik(arm, limb, target, pole, end_rot=None):
    """Place the end bone's head at `target` (world), bending toward the `pole` point.
    `end_rot` (3x3, world) then sets the end bone orientation (foot flat / palm direction)."""
    a, b, c = LIMBS[limb]
    pa, pb_, pc = (arm.pose.bones[n] for n in (a, b, c))
    H = pa.head.copy()
    L1 = (pb_.head - pa.head).length
    L2 = (pc.head - pb_.head).length
    T = Vector(target)
    d = (T - H).length
    d = max(1e-4, min(d, L1 + L2 - 1e-4))
    u = (T - H).normalized()
    T = H + u * d
    x = (L1 * L1 + d * d - L2 * L2) / (2 * d)
    hgt = math.sqrt(max(L1 * L1 - x * x, 0.0))
    p = Vector(pole) - H
    p = p - u * p.dot(u)
    if p.length < 1e-6:
        p = FWD.copy()
    p.normalize()
    K = H + u * x + p * hgt
    aim(arm, a, b, K)
    aim(arm, b, c, T)
    if end_rot is not None:
        set_world_rot(arm, c, end_rot)


def frame_from(fwd, side_hint):
    """Orthonormal 3x3 whose Y axis = fwd and whose X axis is as close as possible to side_hint."""
    y = Vector(fwd).normalized()
    x = Vector(side_hint) - y * Vector(side_hint).dot(y)
    x.normalize()
    z = x.cross(y)
    return Matrix((x, y, z)).transposed()


def remap_rot(rest_axes_world, want_axes_world):
    """Rotation taking a bone's current world 3x3 (rest_axes_world) to an orientation where the
    listed local directions land on the wanted world directions. Both args: 3x3 matrices."""
    return want_axes_world @ rest_axes_world.inverted()


# ---------------------------------------------------------------- head / fingers
def head_forward(arm):
    """Current world forward of the head (rest forward is -Y)."""
    rest = arm.data.bones["Head"].matrix_local.to_3x3().normalized()
    local_fwd = rest.inverted() @ FWD
    return (world_rot(arm, "Head") @ local_fwd).normalized()


def look_at(arm, target, amount=1.0, neck_share=0.4):
    tgt = Vector(target)
    for bone, share in (("Neck", neck_share), ("Head", 1.0)):
        hb = arm.pose.bones["Head"]
        cur = head_forward(arm)
        want = (tgt - hb.head).normalized()
        q = Quaternion().slerp(cur.rotation_difference(want), amount * share)
        pb = arm.pose.bones[bone]
        h = pb.head.copy()
        pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix
        upd()


FINGERS = ("Index", "Middle", "Ring", "Pinky")


def curl(arm, side, deg, thumb_deg=None, fingers=FINGERS):
    """Bend the finger joints toward the palm by `deg` (negative opens)."""
    hand = arm.pose.bones[f"{side}Hand"]
    hm = hand.matrix.to_3x3().normalized()
    for f in fingers:
        for j in (1, 2, 3):
            n = f"{side}Hand{f}{j}"
            pb = arm.pose.bones[n]
            # bend axis: hand lateral axis (perpendicular to finger direction and palm normal)
            fdir = (arm.pose.bones[f"{side}Hand{f}{min(j + 1, 3)}"].head - pb.head) if j < 3 else (pb.tail - pb.head)
            if fdir.length < 1e-6:
                continue
            ax = fdir.normalized().cross(palm_normal(arm, side)).normalized()
            rot(arm, n, ax, deg * (0.8 if j == 1 else 1.0))
    if thumb_deg:
        for j in (1, 2):
            n = f"{side}HandThumb{j}"
            pb = arm.pose.bones[n]
            ax = (pb.tail - pb.head).normalized().cross(palm_normal(arm, side)).normalized()
            rot(arm, n, ax, thumb_deg)


def palm_normal(arm, side):
    """World direction the palm faces: perpendicular to the finger plane (index→pinky), toward the palm."""
    i = arm.pose.bones[f"{side}HandIndex1"].head
    p = arm.pose.bones[f"{side}HandPinky1"].head
    w = arm.pose.bones[f"{side}Hand"].head
    m = arm.pose.bones[f"{side}HandMiddle1"].head
    across = (p - i) if side == "Left" else (i - p)
    along = (m - w)
    n = across.cross(along)  # toward the palm (checked: hanging hands face the thighs)
    return n.normalized() if n.length > 1e-6 else Vector((0, 0, -1))


def orient_hand(arm, side, finger_dir, palm_dir):
    """Turn the hand so its fingers point along `finger_dir` and its palm faces `palm_dir` (world)."""
    hb = arm.pose.bones[f"{side}Hand"]
    R = hb.matrix.to_3x3().normalized()
    Ri = R.inverted()
    along_l = (Ri @ (arm.pose.bones[f"{side}HandMiddle1"].head - hb.head)).normalized()
    palm_l = (Ri @ palm_normal(arm, side)).normalized()

    def frame(a, n):
        a = Vector(a).normalized()
        n = Vector(n) - a * Vector(n).dot(a)
        n.normalize()
        return Matrix((a.cross(n), a, n)).transposed()

    Fl = frame(along_l, palm_l)
    Fw = frame(finger_dir, palm_dir)
    Rnew = Fw @ Fl.transposed()
    set_world_rot(arm, f"{side}Hand", Rnew)


def breathe(arm, phase, amp=1.0):
    """Subtle breathing: chest lifts and opens, head held steady. phase in radians."""
    b = math.sin(phase) * amp
    rot(arm, "Spine2", "X", -0.9 * b)
    rot(arm, "Neck", "X", 0.9 * b)
    for s in ("LeftShoulder", "RightShoulder"):
        move(arm, s, (0, 0, 0.003 * b))


def set_fingers(arm, side, pose_basis):
    for pb in arm.pose.bones:
        if pb.name.startswith(f"{side}Hand") and pb.name != f"{side}Hand":
            pb.matrix_basis = pose_basis[pb.name].copy()
    upd()


# ---------------------------------------------------------------- writing actions
def write_action(arm, name, poses, loop=False, fake_user=True):
    """poses: list of {bone: matrix_basis}, one per frame starting at frame 0."""
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    act = bpy.data.actions.new(name)
    act.use_fake_user = fake_user
    set_action(arm, act)
    hips = arm.pose.bones["Hips"]
    hips.keyframe_insert("location", frame=0, group="Hips")
    ad = arm.animation_data
    from bpy_extras import anim_utils
    cb = anim_utils.action_get_channelbag_for_slot(act, ad.action_slot)
    for fc in list(cb.fcurves):
        cb.fcurves.remove(fc)
    n = len(poses)
    names = bone_order(arm)
    for bn in names:
        locs, quats = [], []
        prev = None
        for P in poses:
            l, r, _s = P[bn].decompose()
            if prev is not None and r.dot(prev) < 0:
                r = -r
            prev = r
            locs.append(l)
            quats.append(r)
        for path, vals, count in (("location", locs, 3), ("rotation_quaternion", quats, 4)):
            for idx in range(count):
                fc = cb.fcurves.new(f'pose.bones["{bn}"].{path}', index=idx)
                try:
                    grp = cb.groups.get(bn) or cb.groups.new(bn)
                    fc.group = grp
                except Exception:
                    pass
                fc.keyframe_points.add(n)
                co = []
                for i, v in enumerate(vals):
                    co += [float(i), float(v[idx])]
                fc.keyframe_points.foreach_set("co", co)
                fc.keyframe_points.foreach_set("interpolation", [1] * n)  # LINEAR
                fc.update()
    act.use_frame_range = True
    act.frame_start = 0
    act.frame_end = n - 1
    act.use_cyclic = bool(loop)
    act["loop"] = bool(loop)
    set_action(arm, None)
    return act


def contact_sheet(out_path, frames, setup_frame, cam_loc, cam_target, cols=6, cell=(320, 400), lens=50,
                  ortho=None, engine="BLENDER_WORKBENCH"):
    """Render each frame (setup_frame(i, f) poses the scene) and tile them into one PNG."""
    import numpy as np, os, tempfile
    r = S.render
    saved = dict(engine=r.engine, x=r.resolution_x, y=r.resolution_y, pct=r.resolution_percentage, path=r.filepath,
                 fmt=r.image_settings.file_format, cam=S.camera)
    sh = S.display.shading
    saved_sh = (sh.light, sh.color_type)
    r.engine = engine; sh.light = "STUDIO"; sh.color_type = "TEXTURE"
    r.resolution_x, r.resolution_y = cell; r.resolution_percentage = 100; r.image_settings.file_format = "PNG"
    cd = bpy.data.cameras.new("tmp_sheet_cam"); cam = bpy.data.objects.new("tmp_sheet_cam", cd)
    S.collection.objects.link(cam); S.camera = cam
    if ortho:
        cd.type = "ORTHO"; cd.ortho_scale = ortho
    else:
        cd.lens = lens
    cam.location = cam_loc
    cam.rotation_euler = (Vector(cam_target) - Vector(cam_loc)).to_track_quat("-Z", "Y").to_euler()
    rows = (len(frames) + cols - 1) // cols
    W, H = cell
    sheet = np.ones((rows * H, cols * W, 4), dtype=np.float32) * 0.25
    tmp = os.path.join(tempfile.gettempdir(), "ralph_sheet_tmp.png")
    try:
        for i, f in enumerate(frames):
            setup_frame(i, f)
            r.filepath = tmp
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(tmp, check_existing=False)
            px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
            bpy.data.images.remove(img)
            rr, cc = i // cols, i % cols
            sheet[(rows - 1 - rr) * H:(rows - rr) * H, cc * W:(cc + 1) * W] = px
    finally:
        S.camera = saved["cam"]; bpy.data.objects.remove(cam); bpy.data.cameras.remove(cd)
        r.engine = saved["engine"]; r.resolution_x = saved["x"]; r.resolution_y = saved["y"]
        r.resolution_percentage = saved["pct"]; r.filepath = saved["path"]; r.image_settings.file_format = saved["fmt"]
        sh.light, sh.color_type = saved_sh
    out = bpy.data.images.new("tmp_sheet", cols * W, rows * H, alpha=True)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = out_path; out.file_format = "PNG"; out.save()
    bpy.data.images.remove(out)
    return out_path


def play_setup(arm, action):
    """setup_frame callback that shows `action` at frame f on `arm`."""
    def _s(i, f):
        set_action(arm, action)
        S.frame_set(int(f))
    return _s


def pose_distance(arm, A, B):
    """Max world-space distance between bone heads for two poses (seam / blend check)."""
    apply(arm, A)
    pa = [arm.pose.bones[n].head.copy() for n in bone_order(arm)]
    apply(arm, B)
    pb = [arm.pose.bones[n].head.copy() for n in bone_order(arm)]
    return max((x - y).length for x, y in zip(pa, pb))
