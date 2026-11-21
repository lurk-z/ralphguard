"""Testing-station clips for one character rig (run inside Blender after ralph_anim_tools.py).

Character space: agent at the origin facing -Y, metres; left hand on +X. Every target below is the
hand *socket* (the point between thumb and fingers where a held prop's grip sits), so the web can
stand the agent at `target - R(yaw) * GRIP * scale` and the socket lands on the target.

The left hand carries vials; the right hand works the dropper and the fridge door, so the analyst
can open the fridge while holding the vial. Each clip starts and ends on Idle_Stand frame 0 or on
the carry pose (Idle_Carry frame 0), so clips chain with short cross-fades.

Globals: ARM_NAME, NAME_PREFIX, ONLY (list of clip names to build; default all).
Writes CLIP_META (event times in seconds, grips) for the web.
"""
import math
from mathutils import Vector

arm = arm_obj(globals().get("ARM_NAME", "Char1_Armature"))
PFX = globals().get("NAME_PREFIX", "")
ONLY = globals().get("ONLY")
SCALE = 0.44846

IDLE_ACT = bpy.data.actions[PFX + "Idle_Stand"] if (PFX + "Idle_Stand") in bpy.data.actions else bpy.data.actions["Idle_Stand"]
WALK_ACT = bpy.data.actions[PFX + "Walk"] if (PFX + "Walk") in bpy.data.actions else bpy.data.actions["Walk"]
IDLE0 = basis_at(arm, IDLE_ACT, 0)
apply(arm, IDLE0)
FOOT0 = {s: (arm.pose.bones[f"{s}Foot"].head.copy(), world_rot(arm, f"{s}Foot")) for s in ("Left", "Right")}
HIPS0 = arm.pose.bones["Hips"].head.copy()

# ---- station geometry in character metres (room units / SCALE); see build_test_station.py
U = 1.0 / SCALE
PLACE = globals().get("PLACE_U", 0.3526) * U   # vial floor above the floor (counter 0.6136 + 8 mm tray floor)
VIAL_GRIP = PLACE + 0.021 * U            # aliquot grip (0.6 of the vial height)
DROPPER_GRIP = PLACE + 0.054 * U         # dropper bulb while seated in its vial
TIP_TO_GRIP = 0.047 * U
INSERT_TIP = PLACE + 0.052 * U           # dropper tip 22 mm (room) above the skin insert
G_PICK = Vector((0.06, -0.46, globals().get("PICK_Z", VIAL_GRIP)))
G_INSERT = Vector((0.06 - 0.047 * U, -0.46 - 0.038 * U, INSERT_TIP + TIP_TO_GRIP))
G_DROPPER = Vector((0.06, -0.46, DROPPER_GRIP))
G_BIN = Vector((0.06, -0.46, 0.40 * U))
HANDLE_Z = 0.511 * U                      # glass-door fridge handle (z 0.78)
G_DOOR_OPEN = Vector((-0.156, -0.457, HANDLE_Z))
G_DOOR_CLOSE = Vector((-0.10, -0.435, HANDLE_Z))
CARRY = Vector((0.11, -0.21, 0.96))

# the room's glass-door fridge (relocate_test_station.py), room units, for the hand path along the door arc
HINGE_ROOM = Vector((-2.189, 1.199))
HANDLE_LOCAL = Vector((0.012, -0.352))      # handle grip in the door's frame (closed door)
PULL_LOCAL = Vector((-0.064, -0.330))       # inner face near the free edge (pulled to close)
OPEN_DEG = 90.0                             # more would hit the back wall


def door_theta_open(f):
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


def room_to_char(p_room, root_room, yaw):
    d = Vector((p_room.x - root_room.x, p_room.y - root_room.y))
    c, s = math.cos(-yaw), math.sin(-yaw)
    return Vector((c * d.x - s * d.y, s * d.x + c * d.y)) * U


def approach(target_room, yaw, grip):
    c, s = math.cos(yaw), math.sin(yaw)
    g = Vector((grip.x, grip.y)) * SCALE
    return Vector((target_room.x - (c * g.x - s * g.y), target_room.y - (s * g.x + c * g.y)))


DOOR_YAW = -math.pi / 2
HANDLE0 = HINGE_ROOM + HANDLE_LOCAL
OPEN_ROOT = approach(HANDLE0, DOOR_YAW, G_DOOR_OPEN)
CLOSE_YAW = math.pi                         # facing +Y, beside the swing


def door_point(local, theta_deg):
    t = math.radians(theta_deg)
    c, s = math.cos(t), math.sin(t)
    return HINGE_ROOM + Vector((c * local.x - s * local.y, s * local.x + c * local.y))


CLOSE_ROOT = HINGE_ROOM + 0.45 * Vector((math.cos(math.radians(-30)), math.sin(math.radians(-30))))


def handle_at(theta):
    p = room_to_char(door_point(HANDLE_LOCAL, theta), OPEN_ROOT, DOOR_YAW)
    return Vector((p.x, p.y, HANDLE_Z))


def pull_at(theta):
    p = room_to_char(door_point(PULL_LOCAL, theta), CLOSE_ROOT, CLOSE_YAW)
    return Vector((p.x, p.y, HANDLE_Z))


# ---- hand socket: between thumb and fingers, fixed in the hand bone's frame
def socket_world(side):
    hb = arm.pose.bones[f"{side}Hand"]
    return hb.matrix @ SOCKET_LOCAL[side]


SOCKET_LOCAL = {}
for s in ("Left", "Right"):
    hb = arm.pose.bones[f"{s}Hand"]
    mid = arm.pose.bones[f"{s}HandMiddle1"].head
    thumb = arm.pose.bones[f"{s}HandThumb2"].head
    p = hb.head.lerp(mid, 0.75).lerp(thumb, 0.35) + palm_normal(arm, s) * 0.018
    SOCKET_LOCAL[s] = hb.matrix.inverted() @ p

POLE = {"Left": Vector((0.60, 0.45, 0.65)), "Right": Vector((-0.60, 0.45, 0.65))}
PALM_IN = {"Left": Vector((-1.0, 0.0, 0.0)), "Right": Vector((1.0, 0.0, 0.0))}
FD_GRIP = {"Left": Vector((-0.20, -0.92, -0.35)), "Right": Vector((0.20, -0.92, -0.35))}


def knee_pole(foot):
    return foot + Vector((0.12 if foot.x > 0 else -0.12, -0.6, 0.45))


def place_hand(side, sock, fd, pd, hips_back):
    """IK the arm so the hand socket lands on `sock` with fingers `fd` and palm `pd`."""
    goal = Vector(sock)
    wrist = goal.copy()
    for _ in range(4):
        ik(arm, f"{side}Arm", wrist, POLE[side] + Vector((0, hips_back, 0.4)))
        orient_hand(arm, side, fd, pd)
        err = goal - socket_world(side)
        if err.length < 0.002:
            break
        wrist += err


def body(lean, hips_back, hips_down, twist=0.0, base=None, breath=0.0):
    apply(arm, base or IDLE0)
    move(arm, "Hips", Vector((0, hips_back, -hips_down)))
    rot(arm, "Spine", "X", lean)
    if twist:
        rot(arm, "Spine1", "Z", twist)
    for s in ("Left", "Right"):
        ik(arm, f"{s}Leg", FOOT0[s][0], knee_pole(FOOT0[s][0]), end_rot=FOOT0[s][1])
    if breath:
        breathe(arm, breath, amp=0.6)


def hand_spec_idle(side, base):
    apply(arm, base)
    hb = arm.pose.bones[f"{side}Hand"]
    fd = (arm.pose.bones[f"{side}HandMiddle1"].head - hb.head).normalized()
    return (socket_world(side), fd, palm_normal(arm, side))


def lerp_hand(a, b, t):
    return (a[0].lerp(b[0], t), a[1].lerp(b[1], t).normalized(), a[2].lerp(b[2], t).normalized())


def carry_pose(base):
    """`base` pose with the left hand holding a vial in front of the belly."""
    apply(arm, base)
    for s in ("Left", "Right"):
        ik(arm, f"{s}Leg", arm.pose.bones[f"{s}Foot"].head.copy(), knee_pole(arm.pose.bones[f"{s}Foot"].head),
           end_rot=world_rot(arm, f"{s}Foot"))
    off = arm.pose.bones["Hips"].head - HIPS0
    place_hand("Left", CARRY + off, Vector((-0.30, -0.90, 0.20)), Vector((-1.0, 0.1, 0.0)), 0.0)
    curl(arm, "Left", 38, thumb_deg=22)
    return capture(arm)


CARRY0 = carry_pose(IDLE0)
CLIP_META = {}


def build_clip(name, n, keys, start_base, end_base, events, loop=False):
    """keys: list of (frame, lean, hips_back, hips_down, twist, L, R, look, curlL, curlR);
    L / R are hand specs (socket, fingers, palm) or None (= keep the base pose's arm)."""
    if ONLY and name not in ONLY:
        return
    frames = []
    for f in range(n + 1):
        for ka, kb in zip(keys, keys[1:]):
            if ka[0] <= f <= kb[0]:
                break
        t = smooth((f - ka[0]) / max(1, kb[0] - ka[0]))
        mix = lambda i: ka[i] + (kb[i] - ka[i]) * t
        base = start_base if f < n / 2 else end_base
        body(mix(1), mix(2), mix(3), mix(4), base=base, breath=2 * math.pi * f / max(n, 1))
        hb_ = mix(2)
        for idx, side in ((5, "Left"), (6, "Right")):
            a, b = ka[idx], kb[idx]
            if a is None and b is None:
                continue
            ha = a or b
            hb = b or a
            sock, fd, pd = lerp_hand(ha, hb, t)
            place_hand(side, sock, fd, pd, hb_)
        cl, cr = mix(8), mix(9)
        if cl:
            curl(arm, "Left", cl, thumb_deg=cl * 0.6)
        if cr:
            curl(arm, "Right", cr, thumb_deg=cr * 0.6)
        la, lb = ka[7], kb[7]
        look_at(arm, la.lerp(lb, t), amount=0.85)
        P = capture(arm)
        # glue the ends exactly onto the base poses so cross-fades are seamless
        edge = 8
        if f < edge:
            P = lerp_pose(start_base, P, smooth(f / edge))
        elif f > n - edge:
            P = lerp_pose(end_base, P, smooth((n - f) / edge))
        frames.append(P)
    write_action(arm, PFX + name, frames, loop=loop)
    CLIP_META[name] = {"frames": n + 1, "duration": round(n / FPS, 4), "loop": loop,
                       "events": {k: round(v / FPS, 4) for k, v in events.items()}}


def idle_specs():
    return {s: hand_spec_idle(s, IDLE0) for s in ("Left", "Right")}, \
           {s: hand_spec_idle(s, CARRY0) for s in ("Left", "Right")}


IDLE_H, CARRY_H = idle_specs()
LOOK_FWD = Vector((0, -1.2, 1.1))


def up(v, dz):
    return Vector((v.x, v.y, v.z + dz))


def grip(side, at, fd=None, pd=None):
    return (Vector(at), (fd or FD_GRIP[side]).normalized(), (pd or PALM_IN[side]).normalized())


# ------------------------------------------------------------------ carry loops
def build_carry_loop(name, act):
    if ONLY and name not in ONLY:
        return
    n = int(act.frame_range[1] - act.frame_range[0])
    frames = []
    for f in range(n + 1):
        frames.append(carry_pose(basis_at(arm, act, act.frame_range[0] + f)))
    write_action(arm, PFX + name, frames, loop=True)
    CLIP_META[name] = {"frames": n + 1, "duration": round(n / FPS, 4), "loop": True, "events": {}}


build_carry_loop("Idle_Carry", IDLE_ACT)
build_carry_loop("Walk_Carry", WALK_ACT)

# ------------------------------------------------------------------ pick / place (left hand, bench height)
GP = G_PICK
pre = grip("Left", up(GP, 0.07) + Vector((0, 0.05, 0)))
at = grip("Left", GP)
lift = grip("Left", up(GP, 0.10) + Vector((0, 0.06, 0)))
LT = Vector((GP.x, GP.y - 0.05, PLACE))
build_clip("Station_Pick", 56, [
    (0, 0, 0, 0, 0, IDLE_H["Left"], None, LOOK_FWD, 0, 0),
    (18, 38, 0.07, 0.06, 0, pre, None, LT, 0, 0),
    (26, 46, 0.08, 0.08, 0, at, None, LT, 0, 0),
    (30, 46, 0.08, 0.08, 0, at, None, LT, 38, 0),
    (40, 32, 0.06, 0.05, 0, lift, None, LT, 38, 0),
    (56, 0, 0, 0, 0, CARRY_H["Left"], None, LOOK_FWD, 38, 0),
], IDLE0, CARRY0, {"grab": 29})

build_clip("Station_Place", 52, [
    (0, 0, 0, 0, 0, CARRY_H["Left"], None, LOOK_FWD, 38, 0),
    (14, 32, 0.06, 0.05, 0, lift, None, LT, 38, 0),
    (22, 46, 0.08, 0.08, 0, at, None, LT, 38, 0),
    (27, 46, 0.08, 0.08, 0, at, None, LT, 0, 0),
    (34, 38, 0.07, 0.06, 0, pre, None, LT, 0, 0),
    (52, 0, 0, 0, 0, IDLE_H["Left"], None, LOOK_FWD, 0, 0),
], CARRY0, IDLE0, {"release": 25})

# ------------------------------------------------------------------ dispense (right hand, dropper from the vial)
GD = G_DROPPER
GI = G_INSERT
d_pre = grip("Right", up(GD, 0.06), Vector((0.25, -0.75, -0.6)))
d_at = grip("Right", GD, Vector((0.25, -0.75, -0.6)))
d_out = grip("Right", up(GD, 0.075), Vector((0.25, -0.75, -0.6)))
d_over = grip("Right", GI + Vector((0, 0, 0.02)), Vector((0.15, -0.70, -0.70)))
d_low = grip("Right", GI, Vector((0.15, -0.70, -0.70)))
LI = Vector((GI.x, GI.y - 0.04, INSERT_TIP - 0.05))
build_clip("Station_Dispense", 120, [
    (0, 0, 0, 0, 0, None, IDLE_H["Right"], LOOK_FWD, 0, 0),
    (16, 34, 0.07, 0.06, -4, None, d_pre, LT, 0, 0),
    (22, 40, 0.07, 0.07, -4, None, d_at, LT, 0, 0),
    (26, 40, 0.07, 0.07, -4, None, d_at, LT, 0, 26),
    (36, 32, 0.06, 0.05, -2, None, d_out, LT, 0, 26),
    (50, 26, 0.06, 0.04, 6, None, d_over, LI, 0, 26),
    (56, 27, 0.06, 0.04, 6, None, d_low, LI, 0, 26),
    (62, 27, 0.06, 0.04, 6, None, d_low, LI, 0, 40),
    (70, 27, 0.06, 0.04, 6, None, d_low, LI, 0, 26),
    (82, 32, 0.06, 0.05, -2, None, d_out, LT, 0, 26),
    (94, 40, 0.07, 0.07, -4, None, d_at, LT, 0, 26),
    (99, 40, 0.07, 0.07, -4, None, d_at, LT, 0, 0),
    (106, 34, 0.07, 0.06, -4, None, d_pre, LT, 0, 0),
    (120, 0, 0, 0, 0, None, IDLE_H["Right"], LOOK_FWD, 0, 0),
], IDLE0, IDLE0, {"grab": 25, "squeeze": 59, "drop": 62, "release": 97})

# ------------------------------------------------------------------ fridge door (right hand; left still carries)
H_FD = Vector((0.10, -0.95, 0.10))
H_PD = Vector((0.95, 0.10, 0.0))
door_keys = [(0, 0, 0, 0, 0, None, CARRY_H["Right"], LOOK_FWD, 0, 0),
             (12, 22, 0.05, 0.03, 0, None, grip("Right", up(handle_at(0), 0.0) + Vector((0, 0.05, 0)), H_FD, H_PD), handle_at(0), 0, 0),
             (16, 26, 0.05, 0.03, 0, None, grip("Right", handle_at(0), H_FD, H_PD), handle_at(0), 0, 34)]
for f in range(18, 33, 2):
    th = door_theta_open(f)
    door_keys.append((f, 26 - 14 * (f - 16) / 16, 0.05, 0.03, -18 * (f - 16) / 16, None,
                      grip("Right", handle_at(th), H_FD, H_PD), handle_at(th), 0, 34))
door_keys += [(35, 8, 0.02, 0.01, -14, None, grip("Right", handle_at(45) + Vector((0, 0.06, 0)), H_FD, H_PD), handle_at(60), 0, 0),
              (48, 0, 0, 0, 0, None, CARRY_H["Right"], LOOK_FWD, 0, 0)]
build_clip("Fridge_Open", 48, [(k[0], *k[1:]) for k in door_keys], CARRY0, CARRY0, {"grab": 16, "release": 32})

# close: stand beside the swing, hook the open door's free edge and pull it back to 70 deg; it shuts itself
P_FD = Vector((0.15, -0.85, -0.30))
P_PD = Vector((0.0, 1.0, 0.1))
close_keys = [(0, 0, 0, 0, 0, None, IDLE_H["Right"], LOOK_FWD, 0, 0),
              (12, 16, 0.04, 0.02, 0, None, grip("Right", pull_at(OPEN_DEG) + Vector((0.03, 0.05, 0)), P_FD, P_PD), pull_at(OPEN_DEG), 0, 0),
              (16, 20, 0.04, 0.03, 0, None, grip("Right", pull_at(OPEN_DEG), P_FD, P_PD), pull_at(OPEN_DEG), 0, 30)]
for f in range(18, 31, 2):
    th = door_theta_close(f)
    close_keys.append((f, 20 - 12 * (f - 16) / 14, 0.04, 0.03, 0, None, grip("Right", pull_at(th), P_FD, P_PD),
                       pull_at(th), 0, 30))
close_keys += [(34, 6, 0.02, 0.01, 0, None, grip("Right", pull_at(OPEN_DEG - 20) + Vector((-0.02, 0.06, 0)), P_FD, P_PD), pull_at(30), 0, 0),
               (48, 0, 0, 0, 0, None, IDLE_H["Right"], LOOK_FWD, 0, 0)]
build_clip("Fridge_Close", 48, close_keys, IDLE0, IDLE0, {"contact": 16, "release": 30})

# ------------------------------------------------------------------ bin release (left hand over the open bin)
b_over = grip("Left", G_BIN, Vector((-0.2, -0.85, -0.45)))
b_up = grip("Left", up(G_BIN, 0.08) + Vector((0, 0.04, 0)), Vector((-0.2, -0.85, -0.45)))
LB = Vector((G_BIN.x, G_BIN.y, 0.45))
build_clip("Bin_Release", 44, [
    (0, 0, 0, 0, 0, CARRY_H["Left"], None, LOOK_FWD, 38, 0),
    (14, 32, 0.06, 0.05, 0, b_over, None, LB, 38, 0),
    (18, 32, 0.06, 0.05, 0, b_over, None, LB, 38, 0),
    (22, 32, 0.06, 0.05, 0, b_over, None, LB, -10, 0),
    (30, 20, 0.04, 0.03, 0, b_up, None, LB, -10, 0),
    (44, 0, 0, 0, 0, IDLE_H["Left"], None, LOOK_FWD, 0, 0),
], CARRY0, IDLE0, {"release": 20})

apply(arm, IDLE0)
CLIP_META["_grips"] = {
    "pick": list(map(lambda v: round(v, 4), G_PICK)), "dispense_insert": list(map(lambda v: round(v, 4), G_INSERT)),
    "dropper": list(map(lambda v: round(v, 4), G_DROPPER)), "bin": list(map(lambda v: round(v, 4), G_BIN)),
    "door_open": list(map(lambda v: round(v, 4), G_DOOR_OPEN)), "door_close": list(map(lambda v: round(v, 4), G_DOOR_CLOSE)),
}
CLIP_META["_socket_local"] = {s: [round(c, 5) for c in SOCKET_LOCAL[s]] for s in SOCKET_LOCAL}
CLIP_META["_door_roots"] = {"open": [round(OPEN_ROOT.x, 4), round(OPEN_ROOT.y, 4)],
                            "close": [round(CLOSE_ROOT.x, 4), round(CLOSE_ROOT.y, 4)]}
