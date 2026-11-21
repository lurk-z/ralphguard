"""Builds Sit_Down, Seated_Work and Stand_Up for the pilot (run inside Blender after ralph_anim_tools.py)."""
import math
from mathutils import Vector, Matrix

arm = arm_obj(globals().get("ARM_NAME", "Char1_Armature"))
PFX = globals().get("NAME_PREFIX", "")
IDLE0 = basis_at(arm, bpy.data.actions["Idle_Stand"], 0)
apply(arm, IDLE0)
FOOT0 = {s: (arm.pose.bones[f"{s}Foot"].head.copy(), world_rot(arm, f"{s}Foot")) for s in ("Left", "Right")}
HIPS0 = arm.pose.bones["Hips"].head.copy()

# ---- layout (character metres; the agent stands at the origin facing -Y, the chair is behind it)
# Sitting: land on the seat centre, then scoot forward together with the (castored) chair.
STOOL_START_Y, STOOL_END_Y = 0.39, 0.21
HIPS_FWD_OF_SEAT = 0.06                     # hips sit forward of the seat centre, clear of the backrest
SEAT_TOP = 0.511
HIPS_ABOVE_SEAT = 0.20                      # Hips bone height over the seat (buttocks mesh is ~0.17 below it)
LAND_HIPS = Vector((0.0, STOOL_START_Y - HIPS_FWD_OF_SEAT, SEAT_TOP + HIPS_ABOVE_SEAT))
SEAT_HIPS = Vector((0.0, STOOL_END_Y - HIPS_FWD_OF_SEAT, SEAT_TOP + HIPS_ABOVE_SEAT))
SEAT_FEET = {"Left": Vector((0.16, -0.27, FOOT0["Left"][0].z)), "Right": Vector((-0.14, -0.23, FOOT0["Right"][0].z))}
SEAT_LEAN = 18.0
SCOOT = (42, 54)                            # Sit_Down frames where hips + chair move forward


def _bb(name):
    """World extents from the actual vertices (bound_box corners inflate rotated objects)."""
    o = bpy.data.objects[name]
    c = [o.matrix_world @ v.co for v in o.data.vertices]
    return Vector([min(p[i] for p in c) for i in range(3)]), Vector([max(p[i] for p in c) for i in range(3)])


_kmin, _kmax = _bb("board")
_mmin, _mmax = _bb("mouse_and_pad")
_smin, _smax = _bb("screen.001")
KEYS_Y = _kmax.y - 0.04                     # wrists just over the keyboard's front edge
KEYS_Z = _kmax.z + 0.075                    # palm mesh is ~0.06 below the wrist bone
KEYS_CX = 0.5 * (_kmin.x + _kmax.x)
HOME = {"Left": Vector((KEYS_CX + 0.11, KEYS_Y, KEYS_Z)), "Right": Vector((KEYS_CX - 0.11, KEYS_Y, KEYS_Z))}
MOUSE = Vector((0.5 * (_mmin.x + _mmax.x), _mmax.y - 0.05, _mmax.z + 0.065))
MONITOR = 0.5 * (_smin + _smax)
LOOK_WORK = MONITOR.lerp(Vector((KEYS_CX, KEYS_Y - 0.08, _kmax.z)), 0.35)
LOOK_KEYS = Vector((KEYS_CX, KEYS_Y - 0.08, _kmax.z))
TYPE_FD = {"Left": Vector((-0.12, -0.97, -0.15)), "Right": Vector((0.12, -0.97, -0.15))}
PALM_DOWN = Vector((0.0, 0.10, -1.0))
ELBOW_POLE = {"Left": Vector((0.55, 0.45, 0.70)), "Right": Vector((-0.55, 0.45, 0.70))}


def knee_pole(foot):
    return foot + Vector((0.12 if foot.x > 0 else -0.12, -0.6, 0.45))


def build(hips, lean, feet, w_arms=0.0, hands=None, look=None, w_look=0.0, tap=None, head_up=0.0):
    """One full-body pose: hips placed, spine leaned, feet planted by IK, arms blended toward `hands`."""
    apply(arm, IDLE0)
    move(arm, "Hips", Vector(hips) - arm.pose.bones["Hips"].head)
    rot(arm, "Spine", "X", lean)
    for s in ("Left", "Right"):
        ik(arm, f"{s}Leg", feet[s][0], knee_pole(feet[s][0]), end_rot=feet[s][1])
    if head_up:
        rot(arm, "Neck", "X", -head_up)
    if w_arms > 0 and hands:
        for s in ("Left", "Right"):
            hb = arm.pose.bones[f"{s}Hand"]
            fk_pos, fk_rot = hb.head.copy(), world_rot(arm, f"{s}Hand")
            tgt, fd, pd = hands[s]
            pos = fk_pos.lerp(tgt, w_arms)
            ik(arm, f"{s}Arm", pos, ELBOW_POLE[s] + Vector((0, hips[1], hips[2] - 0.6)))
            orient_hand(arm, s, fd, pd)
            if w_arms < 1:
                want = world_rot(arm, f"{s}Hand")
                q = fk_rot.to_quaternion().slerp(want.to_quaternion(), w_arms)
                set_world_rot(arm, f"{s}Hand", q.to_matrix())
            if tap and tap.get(s):
                curl(arm, s, tap[s])
    if look is not None and w_look > 0:
        look_at(arm, look, amount=w_look)
    return capture(arm)


def typing_hands(f, mouse_w=0.0, mouse_off=(0, 0)):
    """Hand targets for frame f: alternating small key taps; right hand can blend to the mouse."""
    h = {}
    for s, ph in (("Left", 0.0), ("Right", math.pi * 0.85)):
        tap = max(0.0, math.sin(2 * math.pi * f / 6.0 + ph + (0.6 if s == "Right" else 0.0)))
        p = HOME[s] + Vector((0.006 * math.sin(2 * math.pi * f / 36 + ph), 0, 0.009 * tap))
        h[s] = (p, TYPE_FD[s], PALM_DOWN)
    if mouse_w > 0:
        m = MOUSE + Vector((mouse_off[0], mouse_off[1], 0))
        p = h["Right"][0].lerp(m, mouse_w)
        fd = TYPE_FD["Right"].lerp(Vector((0.03, -0.95, -0.30)), mouse_w)
        h["Right"] = (p, fd, PALM_DOWN)
    return h


def seated(f, mouse_w=0.0, mouse_off=(0, 0), look=LOOK_WORK, typing=1.0):
    feet = {s: (SEAT_FEET[s], FOOT0[s][1]) for s in ("Left", "Right")}
    hands = typing_hands(f if typing else 0, mouse_w, mouse_off)
    taps = {"Left": 4 * typing * max(0, math.sin(2 * math.pi * f / 6.0)),
            "Right": 4 * typing * (1 - mouse_w) * max(0, math.sin(2 * math.pi * f / 6.0 + 2.7))}
    return build(SEAT_HIPS, SEAT_LEAN, feet, 1.0, hands, look, 1.0, taps)


def mix(a, b, t):
    return a + (b - a) * t


def env(f, pts):
    """Piecewise smoothstep through (frame, value) points."""
    if f <= pts[0][0]:
        return pts[0][1]
    for (fa, va), (fb, vb) in zip(pts, pts[1:]):
        if f <= fb:
            t = smooth((f - fa) / (fb - fa))
            return va.lerp(vb, t) if hasattr(va, "lerp") else va + (vb - va) * t
    return pts[-1][1]


# ---------------------------------------------------------------- Seated_Work (144 frames, loop)
N_WORK = 144
work = []
for f in range(N_WORK + 1):
    ff = f % N_WORK
    mw = env(ff, [(0, 0.0), (50, 0.0), (60, 1.0), (92, 1.0), (102, 0.0), (144, 0.0)])
    mo = (0.012 * math.sin(2 * math.pi * (ff - 60) / 16) * mw, 0.010 * math.sin(2 * math.pi * (ff - 60) / 22) * mw)
    look = env(ff, [(0, LOOK_WORK), (52, LOOK_WORK), (64, MONITOR), (84, MONITOR), (100, LOOK_WORK),
                    (118, LOOK_WORK), (124, LOOK_KEYS), (132, LOOK_KEYS), (140, LOOK_WORK), (144, LOOK_WORK)])
    work.append(seated(ff, mw, mo, look))
write_action(arm, PFX + "Seated_Work", work, loop=True)
SEAT0 = work[0]

# ---------------------------------------------------------------- Sit_Down (61 frames, one-shot)
N_SIT = 60
LOOK_AHEAD = Vector((0, -2.5, 1.35))
sit = []
for f in range(N_SIT + 1):
    if f == N_SIT:
        sit.append(SEAT0)
        break
    hips = env(f, [(0, HIPS0), (12, Vector((0, 0.08, 0.93))), (24, Vector((0, 0.27, 0.80))),
                   (32, LAND_HIPS + Vector((0, 0, 0.03))), (38, LAND_HIPS),
                   (SCOOT[0], LAND_HIPS), (SCOOT[1], SEAT_HIPS), (60, SEAT_HIPS)])
    lean = env(f, [(0, 0.0), (12, 25.0), (24, 32.0), (32, 20.0), (42, 12.0), (54, SEAT_LEAN), (60, SEAT_LEAN)])
    feet = {}
    for s in ("Left", "Right"):
        p = env(f, [(0, FOOT0[s][0]), (42, FOOT0[s][0]), (54, SEAT_FEET[s]), (60, SEAT_FEET[s])])
        feet[s] = (p, FOOT0[s][1])
    w_arms = env(f, [(0, 0.0), (40, 0.0), (50, 1.0), (60, 1.0)])
    # hands lift above the desk first, then settle onto the keys
    lift = env(f, [(0, 0.0), (40, 0.0), (46, 1.0), (52, 1.0), (59, 0.0), (60, 0.0)])
    hands = {s: (p + Vector((0, 0.10 * lift, 0.12 * lift)), fd, pd) for s, (p, fd, pd) in typing_hands(0).items()}
    look_w = env(f, [(0, 0.0), (8, 0.5), (36, 0.5), (60, 1.0)])
    look = LOOK_AHEAD.lerp(LOOK_WORK, smooth((f - 36) / 24) if f > 36 else 0.0)
    P = build(hips, lean, feet, w_arms, hands, look, look_w)
    if f < 6:  # start exactly on the idle pose, ease into the IK-planted legs
        P = lerp_pose(IDLE0, P, smooth(f / 6.0))
    sit.append(P)
write_action(arm, PFX + "Sit_Down", sit, loop=False)

# ---------------------------------------------------------------- Stand_Up: Sit_Down played backwards
write_action(arm, PFX + "Stand_Up", list(reversed(sit)), loop=False)

def seat_center_y(stool_name="back1.001"):
    """Current Y of the chair seat centre, measured from the seat's top faces."""
    st = bpy.data.objects[stool_name]
    M = st.matrix_world
    R = M.to_3x3()
    pts = [M @ p.center for p in st.data.polygons
           if (R @ p.normal).normalized().z > 0.85 and abs((M @ p.center).z - SEAT_TOP) < 0.01]
    return sum(p.y for p in pts) / len(pts)


def stool_to(y, stool_name="back1.001"):
    """Move the chair so its seat centre is at Y = y."""
    st = bpy.data.objects[stool_name]
    st.matrix_world = Matrix.Translation((0, y - seat_center_y(stool_name), 0)) @ st.matrix_world
    upd()


def stool_y_sit(f):
    """Chair position (Y) during Sit_Down frame f; Stand_Up uses stool_y_sit(60 - f)."""
    return env(f, [(0, STOOL_START_Y), (SCOOT[0], STOOL_START_Y), (SCOOT[1], STOOL_END_Y), (60, STOOL_END_Y)])


RESULT = {
    "seated_work_frames": len(work), "sit_frames": len(sit),
    "seam_seated_work": round(pose_distance(arm, work[0], work[-1]), 4),
    "sit_end_vs_work_start": round(pose_distance(arm, sit[-1], work[0]), 4),
    "sit_start_vs_idle": round(pose_distance(arm, sit[0], IDLE0), 4),
}
