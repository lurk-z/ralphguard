"""Rebuilds the room's pedal bin (legs.001 + bin_lid_room) as a clean closed low-poly mesh, same size and
place as the original: octagonal body with a real wall thickness and inner floor, four feet, a front
pedal, a back hinge bracket, and a separate lid on the existing bin_lid_hinge (run in Lab2_3room_station.blend).
"""
import math
import bmesh
import bpy
from mathutils import Matrix, Vector

C = Vector((0.0025, 1.0395))
R = 0.105              # body corner radius (octagon, flat faces toward the axes)
WALL = 0.006
Z0, Z1 = 0.290, 0.531  # body bottom / top rim
LID_R, LID_T = 0.110, 0.012
HINGE = Vector((C.x, C.y + LID_R * math.cos(math.pi / 8), Z1 + LID_T))


def mat(name, rgb, rough=0.6, metal=0.2):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def ring(bm, r, z, n=8, off=math.pi / 8, cx=None, cy=None):
    cx = C.x if cx is None else cx
    cy = C.y if cy is None else cy
    return [bm.verts.new((cx + r * math.cos(off + 2 * math.pi * i / n), cy + r * math.sin(off + 2 * math.pi * i / n), z)) for i in range(n)]


def band(bm, a, b, mi, flip=False):
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((a[i], a[j], b[j], b[i]) if not flip else (a[j], a[i], b[i], b[j]))
        f.material_index = mi


def box(bm, x0, x1, y0, y1, z0, z1, mi):
    v = [bm.verts.new(p) for p in ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                    (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
    for f in ((0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7), (3, 2, 1, 0)):
        bm.faces.new([v[i] for i in f]).material_index = mi


def build():
    body_m = mat("Bin_Body", (0.30, 0.32, 0.35))
    dark_m = mat("Bin_Dark", (0.10, 0.11, 0.12), 0.5, 0.3)
    lid_m = mat("Bin_Lid", (0.55, 0.53, 0.53), 0.5, 0.1)

    body = bpy.data.objects["legs.001"]
    Wi = body.matrix_world.inverted()
    bm = bmesh.new()
    ob0, ob1 = ring(bm, R * 0.97, Z0), ring(bm, R, Z1)          # outer wall, slight taper
    ib0, ib1 = ring(bm, R * 0.97 - WALL, Z0 + 0.010), ring(bm, R - WALL, Z1)
    band(bm, ob0, ob1, 0)                                         # outside
    band(bm, ib0, ib1, 0, flip=True)                              # inside
    band(bm, ob1, ib1, 0, flip=True)                              # top rim
    bm.faces.new(list(reversed(ob0))).material_index = 0          # bottom
    bm.faces.new(ib0).material_index = 0                          # inner floor
    for a in range(4):                                            # feet
        ang = math.pi / 4 + a * math.pi / 2
        x, y = C.x + 0.065 * math.cos(ang), C.y + 0.065 * math.sin(ang)
        box(bm, x - 0.008, x + 0.008, y - 0.008, y + 0.008, 0.266, Z0, 1)
    fy = C.y - R * math.cos(math.pi / 8)
    box(bm, C.x - 0.030, C.x + 0.030, fy - 0.030, fy + 0.002, 0.292, 0.306, 1)   # pedal
    by = C.y + R * math.cos(math.pi / 8)
    box(bm, C.x - 0.010, C.x + 0.010, by - 0.004, by + 0.014, Z1 - 0.030, Z1 + 0.004, 1)  # hinge bracket
    for v in bm.verts:
        v.co = Wi @ v.co
    bm.normal_update()
    body.data.clear_geometry()
    bm.to_mesh(body.data)
    bm.free()
    body.data.materials.clear()
    body.data.materials.append(body_m)
    body.data.materials.append(dark_m)
    for k in ("inner_walls", "inner_shell"):
        if k in body:
            del body[k]

    hinge = bpy.data.objects["bin_lid_hinge"]
    hinge.location = hinge.parent.matrix_world.inverted() @ HINGE
    bpy.context.view_layer.update()
    lid = bpy.data.objects["bin_lid_room"]
    Hi = hinge.matrix_world.inverted()
    bm = bmesh.new()
    l0, l1 = ring(bm, LID_R, Z1), ring(bm, LID_R, Z1 + LID_T)
    band(bm, l0, l1, 0)
    bm.faces.new(list(reversed(l0))).material_index = 0
    top = ring(bm, LID_R * 0.82, Z1 + LID_T + 0.006)
    band(bm, l1, top, 0)
    bm.faces.new(top).material_index = 0
    zt = Z1 + LID_T + 0.006
    box(bm, C.x - 0.030, C.x + 0.030, C.y - 0.006, C.y + 0.006, zt, zt + 0.010, 1)   # lid grip
    for v in bm.verts:
        v.co = Hi @ v.co
    bm.normal_update()
    lid.data.clear_geometry()
    bm.to_mesh(lid.data)
    bm.free()
    lid.data.materials.clear()
    lid.data.materials.append(lid_m)
    lid.data.materials.append(dark_m)
    lid.parent = hinge
    lid.matrix_parent_inverse = Matrix.Identity(4)
    lid.matrix_basis = Matrix.Identity(4)
    for p in body.data.polygons:
        p.use_smooth = False
    return {"body_faces": len(body.data.polygons), "lid_faces": len(lid.data.polygons)}


RESULT = build()
