"""Preview-only: bakes the web sequence into _Preview_Sequence (pilot) and _Preview_StandIn (char 5),
animates a root empty along the walking path and the chair along the sit/stand scoot.
Run after ralph_anim_tools.py and build_seated_clips.py (needs stool_y_sit / stool_to / STOOL_*)."""
import math
from mathutils import Vector, Matrix

a1 = arm_obj("Char1_Armature")
a5 = arm_obj("Char5_Armature")
A = {n: bpy.data.actions[n] for n in ("Idle_Stand", "Walk", "Talk_Gesture", "Sit_Down", "Stand_Up", "Seated_Work")}
WALK_N = int(A["Walk"].frame_end)  # 25 (last frame repeats the first)
XF = 6                             # crossfade frames between clips
SPEED = 1.689 / 24.0               # metres per frame (Walk clip's own stride speed)

P0 = Vector((0.0, 0.0))            # desk stand spot (faces -Y)
W = Vector((1.1, 0.0))             # waypoint that keeps the path clear of the chair
T = Vector((2.2, 1.4))             # talk spot
S5 = Vector((2.2, 2.6))            # stand-in position (faces -Y, toward T)


def yaw_for(d):
    return math.atan2(d.x, -d.y)


def path_len(pts):
    return sum((b - a).length for a, b in zip(pts, pts[1:]))


def point_on(pts, s):
    for a, b in zip(pts, pts[1:]):
        L = (b - a).length
        if s <= L:
            return a.lerp(b, s / L), (b - a).normalized()
        s -= L
    return pts[-1], (pts[-1] - pts[-2]).normalized()


out_path = [P0, W, T]
back_path = [T, W, P0]
walk_frames = int(math.ceil(path_len(out_path) / SPEED))

# timeline: (name, clip, length) — walk segments are timed by distance
seg = [("work1", "Seated_Work", 144), ("stand", "Stand_Up", 61), ("walk_out", "Walk", walk_frames),
       ("idle", "Idle_Stand", 48), ("talk", "Talk_Gesture", 108), ("walk_back", "Walk", walk_frames),
       ("sit", "Sit_Down", 61), ("work2", "Seated_Work", 145)]
starts = {}
f = 0
for name, clip, n in seg:
    starts[name] = (f, n, clip)
    f += n
TOTAL = f

cache = {}


def clip_pose(arm, clip, local):
    act = A[clip]
    if clip in ("Walk",):
        local = local % WALK_N
    elif clip in ("Seated_Work", "Talk_Gesture", "Idle_Stand"):
        local = local % int(act.frame_end)
    else:
        local = min(local, int(act.frame_end))
    key = (arm.name, clip, local)
    if key not in cache:
        cache[key] = basis_at(arm, act, local)
    return cache[key]


def pose_at(gf):
    """Pilot pose for global frame gf with crossfades at segment starts."""
    names = [s[0] for s in seg]
    for i, nm in enumerate(names):
        st, n, clip = starts[nm]
        if st <= gf < st + n:
            P = clip_pose(a1, clip, gf - st)
            if i > 0 and gf - st < XF:
                pst, pn, pclip = starts[names[i - 1]]
                prev = clip_pose(a1, pclip, gf - pst)
                P = lerp_pose(prev, P, smooth((gf - st) / XF))
            return P
    return clip_pose(a1, "Seated_Work", 0)


# root empty for the pilot
root = bpy.data.objects.get("_Preview_Root") or bpy.data.objects.new("_Preview_Root", None)
if root.name not in bpy.context.scene.collection.objects:
    bpy.context.scene.collection.objects.link(root)
a1.parent = root
a1.matrix_parent_inverse = Matrix.Identity(4)
a1.location = (0, 0, 0)
root.animation_data_clear()


def root_at(gf):
    st, n, _ = starts["walk_out"]
    bt, bn, _ = starts["walk_back"]
    turn = 10
    if gf < st:
        return P0, 0.0
    if gf < st + n:
        s = min((gf - st) * SPEED, path_len(out_path))
        p, d = point_on(out_path, s)
        y0, y1 = 0.0, yaw_for(d)
        return p, y0 + (y1 - y0) * smooth((gf - st) / turn)
    if gf < bt:  # standing at the talk spot: turn to face the stand-in
        p = T
        y_arrive = yaw_for(T - W)
        y_face = math.pi
        return p, y_arrive + (y_face - y_arrive) * smooth((gf - (st + n)) / 10)
    if gf < bt + bn:
        s = min((gf - bt) * SPEED, path_len(back_path))
        p, d = point_on(back_path, s)
        y_from = math.pi
        y_mid = yaw_for(d)
        if y_mid < y_from - math.pi:
            y_mid += 2 * math.pi
        if gf - bt < turn:
            return p, y_from + (y_mid - y_from) * smooth((gf - bt) / turn)
        if gf >= bt + bn - turn:  # last steps: turn to face the desk (-Y => yaw 0 / 2pi)
            y_end = 2 * math.pi if y_mid > math.pi else 0.0
            return p, y_mid + (y_end - y_mid) * smooth((gf - (bt + bn - turn)) / turn)
        return p, y_mid
    return P0, 0.0


for gf in range(TOTAL):
    p, yaw = root_at(gf)
    root.location = (p.x, p.y, 0)
    root.rotation_euler = (0, 0, yaw)
    root.keyframe_insert("location", frame=gf)
    root.keyframe_insert("rotation_euler", frame=gf)

# chair: seated during work, slides back while standing up, forward while sitting down
stool = bpy.data.objects["back1.001"]
stool.animation_data_clear()
for gf in range(TOTAL):
    if gf < starts["stand"][0]:
        y = STOOL_END_Y
    elif gf < starts["stand"][0] + 61:
        y = stool_y_sit(60 - (gf - starts["stand"][0]))
    elif gf < starts["sit"][0]:
        y = STOOL_START_Y
    elif gf < starts["sit"][0] + 61:
        y = stool_y_sit(gf - starts["sit"][0])
    else:
        y = STOOL_END_Y
    stool_to(y)
    stool.keyframe_insert("location", frame=gf)

# bake the pilot sequence and the stand-in idle (stand-in plays the pilot's Idle_Stand = reuse test)
seq = [pose_at(gf) for gf in range(TOTAL)]
write_action(a1, "_Preview_Sequence", seq, loop=False, fake_user=False)
a5.location = (S5.x, S5.y, 0)
a5.rotation_euler = (0, 0, 0)
stand_in = [clip_pose(a5, "Idle_Stand", gf) for gf in range(TOTAL)]
write_action(a5, "_Preview_StandIn", stand_in, loop=False, fake_user=False)
set_action(a1, bpy.data.actions["_Preview_Sequence"])
set_action(a5, bpy.data.actions["_Preview_StandIn"])
bpy.data.collections["StandIn_Char5"].hide_render = False
bpy.data.collections["StandIn_Char5"].hide_viewport = False
bpy.context.scene.frame_start = 0
bpy.context.scene.frame_end = TOTAL - 1
SEQ = {"total_frames": TOTAL, "seconds": round(TOTAL / 24, 2), "segments": {k: v[:2] for k, v in starts.items()},
       "walk_frames_each_way": walk_frames}
