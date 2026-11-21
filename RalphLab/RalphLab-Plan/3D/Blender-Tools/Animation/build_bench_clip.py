"""Builds Bench_Work for the pilot (run inside Blender after ralph_anim_tools.py).

All targets are relative to the agent's standing spot (origin, facing -Y). Change TABLE_TOP,
TABLE_EDGE_Y or TRAY to re-bake the clip for another table height or prop position.
"""
import math
from mathutils import Vector

arm = arm_obj(globals().get("ARM_NAME", "Char1_Armature"))
PFX = globals().get("NAME_PREFIX", "")
IDLE0 = basis_at(arm, bpy.data.actions["Idle_Stand"], 0)
apply(arm, IDLE0)
FOOT0 = {s: (arm.pose.bones[f"{s}Foot"].head.copy(), world_rot(arm, f"{s}Foot")) for s in ("Left", "Right")}
HIPS0 = arm.pose.bones["Hips"].head.copy()

TABLE_TOP = globals().get("TABLE_TOP", 0.758)      # lab tables: 0.34 lab units above the floor
TABLE_EDGE_Y = globals().get("TABLE_EDGE_Y", -0.28)
TRAY = globals().get("TRAY", Vector((-0.02, -0.50, 0.0)))  # wrist spot at the tray's near rim (x, y); z from table
REST_Z = TABLE_TOP + 0.12                          # working hands hover over the front edge
TRAY_Z = TABLE_TOP + 0.11                          # wrist over the tray rim, fingers dip into it
LEAN_WORK, LEAN_REACH, LEAN_INSPECT = 30, 44, 10   # forward bend (deg) for a 0.758 m top; less for taller tables
FD_REST = {"Left": Vector((-0.15, -0.95, -0.20)), "Right": Vector((0.15, -0.95, -0.20))}
PALM_DOWN = Vector((0.0, 0.10, -1.0))
POLE = {"Left": Vector((0.55, 0.40, 0.70)), "Right": Vector((-0.55, 0.40, 0.70))}


def knee_pole(foot):
    return foot + Vector((0.12 if foot.x > 0 else -0.12, -0.6, 0.45))


def pose(lean, hips_back, hips_down, hands, look, curl_r=0.0, wrist_twist=0.0, breath=0.0):
    apply(arm, IDLE0)
    move(arm, "Hips", Vector((0, hips_back, -hips_down)))
    rot(arm, "Spine", "X", lean)
    for s in ("Left", "Right"):
        ik(arm, f"{s}Leg", FOOT0[s][0], knee_pole(FOOT0[s][0]), end_rot=FOOT0[s][1])
    breathe(arm, breath, amp=0.8)
    for s in ("Left", "Right"):
        tgt, fd, pd = hands[s]
        ik(arm, f"{s}Arm", tgt, POLE[s] + Vector((0, hips_back, 0.4)))
        orient_hand(arm, s, fd, pd)
    if wrist_twist:
        hb = arm.pose.bones["RightHand"]
        rot(arm, "RightHand", (arm.pose.bones["RightHandMiddle1"].head - hb.head), wrist_twist)
    if curl_r:
        curl(arm, "Right", curl_r, thumb_deg=curl_r * 0.6)
    look_at(arm, look, amount=0.9)
    return capture(arm)


REST = {"Left": (Vector((0.15, TABLE_EDGE_Y, REST_Z)), FD_REST["Left"], PALM_DOWN),
        "Right": (Vector((-0.14, TABLE_EDGE_Y, REST_Z)), FD_REST["Right"], PALM_DOWN)}
REACH_R = (Vector((TRAY.x, TRAY.y, TRAY_Z)), Vector((0.10, -0.80, -0.59)), Vector((0.0, 0.25, -0.97)))
LIFT_R = (REACH_R[0] + Vector((0, 0.04, 0.14)), Vector((0.10, -0.95, -0.20)), REACH_R[2])
INSPECT_R = (Vector((-0.10, -0.30, 1.20)), Vector((0.25, -0.45, 0.86)), Vector((0.55, 0.80, 0.0)))
HANG_L = (Vector((0.16, TABLE_EDGE_Y + 0.03, 0.95)), Vector((-0.10, -0.55, -0.83)), Vector((-0.6, 0.3, -0.2)))
LOOK_TABLE = Vector((0.0, TABLE_EDGE_Y - 0.20, TABLE_TOP))
LOOK_TRAY = Vector((TRAY.x, TRAY.y - 0.05, TABLE_TOP))

# key states: (frame, lean, hips_back, hips_down, right, left, look, curl)
W, R_, I_ = LEAN_WORK, LEAN_REACH, LEAN_INSPECT
K = [
    (0, W, 0.03, 0.03, REST["Right"], REST["Left"], LOOK_TABLE, 0),
    (20, W, 0.03, 0.03, REST["Right"], REST["Left"], LOOK_TABLE, 0),
    (36, R_, 0.06, 0.04, REACH_R, REST["Left"], LOOK_TRAY, 0),
    (42, R_, 0.06, 0.04, REACH_R, REST["Left"], LOOK_TRAY, 28),
    (48, R_ - 6, 0.05, 0.03, LIFT_R, REST["Left"], LOOK_TRAY, 28),
    (62, I_, 0.02, 0.01, INSPECT_R, HANG_L, None, 28),
    (96, I_, 0.02, 0.01, INSPECT_R, HANG_L, None, 28),
    (106, R_ - 6, 0.05, 0.03, LIFT_R, REST["Left"], LOOK_TRAY, 28),
    (112, R_, 0.06, 0.04, REACH_R, REST["Left"], LOOK_TRAY, 28),
    (118, R_, 0.06, 0.04, REACH_R, REST["Left"], LOOK_TRAY, 0),
    (136, W, 0.03, 0.03, REST["Right"], REST["Left"], LOOK_TABLE, 0),
    (156, W, 0.03, 0.03, REST["Right"], REST["Left"], LOOK_TABLE, 0),
]


def lerp_hand(a, b, t):
    return (a[0].lerp(b[0], t), a[1].lerp(b[1], t).normalized(), a[2].lerp(b[2], t).normalized())


N = 156
frames = []
for f in range(N + 1):
    for ka, kb in zip(K, K[1:]):
        if ka[0] <= f <= kb[0]:
            break
    t = smooth((f - ka[0]) / max(1, kb[0] - ka[0]))
    lean = ka[1] + (kb[1] - ka[1]) * t
    hb = ka[2] + (kb[2] - ka[2]) * t
    hd = ka[3] + (kb[3] - ka[3]) * t
    right = lerp_hand(ka[4], kb[4], t)
    left = lerp_hand(ka[5], kb[5], t)
    insp = INSPECT_R[0] + Vector((0, 0, 0.06))
    la = ka[6] if ka[6] is not None else insp
    lb = kb[6] if kb[6] is not None else insp
    look = la.lerp(lb, t)
    c = ka[7] + (kb[7] - ka[7]) * t
    twist = 12 * math.sin(2 * math.pi * (f - 60) / 36) if 60 <= f <= 96 else 0.0
    frames.append(pose(lean, hb, hd, {"Left": left, "Right": right}, look, c, twist, 2 * math.pi * 2 * f / N))
write_action(arm, PFX + "Bench_Work", frames, loop=True)
BENCH = {"frames": len(frames), "seam": round(pose_distance(arm, frames[0], frames[-1]), 4)}
