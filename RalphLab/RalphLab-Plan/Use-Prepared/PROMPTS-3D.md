# Prompts สำหรับ Ralph Lab 3D

คัด prompt ตามงานที่กำลังจะทำ แนบภาพจากดัชนีของงานนั้น ใช้ฉากที่ตรงกับช่วงงาน และตรวจชื่อวัตถุในไฟล์จริงก่อนแก้ Prompt ด้านล่างเรียบเรียงรวมจากคำสั่งเดิม โดยเก็บข้อกำหนดล่าสุดเป็นหลัก ไม่มี prompt สำหรับสร้างตัวละคร

## ขยายผังห้องและปรับผนังกั้น

แนบ [ผัง 3 ห้อง](../3D/Room/Refs/02-tiled-furnished-plan.png) และภาพมุมบนของฉากที่ต้องแก้ ใช้กับห้องเดียวหรือรุ่นที่ยังไม่ได้ย้ายผนัง เปิด [ดัชนีห้อง](../3D/Room/ROOM-INDEX.md) เพื่อเลือกฐาน

~~~text
Inspect the assigned low-poly Ralph Lab Blender file and work in a copy. Identify the original floor, wall parts, tiles, and furniture. Use the supplied top view as the placement reference. The main lab is the largest of three rooms in a left–center–right row. Side rooms connect directly to the center through two open gaps in the existing partitions. Preserve the original square light-gray tile pattern, scale, grout spacing, and floor height.

If starting from the single-room base, extend the floor on both sides, retaining it as the center room. Add the two partitions as separate objects and use two wall segments per partition where a gap is required. Keep the center room’s existing furniture and equipment visible. Bring the side rooms to the same depth and tile height.

If starting from the already expanded room and the task is only to widen the center, keep both outer bounds and the floor footprint fixed. Move both segments of each interior partition outward together, preserving the Y positions and clear width of the openings. Do not extend the floor along -Y in this pass. Where the reference shows offset doorways, keep the left opening near the front and the right opening near the middle.

Validate from top and angled views. Check both passages for furniture and wall intersections. Save an editable Blender copy and a screenshot for review. Export a GLB only when requested.
~~~

## จัดอุปกรณ์และเติมโต๊ะ ชั้น เก้าอี้ และต้นไม้

แนบ [ผังโต๊ะกลางสองตัว](../3D/Room/Refs/03-two-table-plan.png), [มุมเฉียงพร้อมกระดานและเก้าอี้](../3D/Room/Refs/04-wall-boards-and-stools.png) และเลือกภาพจาก [ดัชนีอุปกรณ์](../3D/Props/PROP-INDEX.md)

~~~text
Preserve the current approved room footprint, tiles, walls, and doorway positions. Reuse assets already in the scene or its unused collections before making a new mesh. Preserve the pale-gray and muted teal low-poly look with simple flat facets, small bevels, and matte materials.

Left room: use the original glass-front cabinet, microscope bench and one stool. Place a slim reused shelf along the exterior left wall. Keep the front opening clear.

Center room: retain the rear sink and cabinets, and keep the computer desk and its chair as a separate workstation. Add or retain exactly two independent center lab tables side by side with a clear gap. Put the scale, beaker, and stirrer on the formulation table, and the sample handoff tray, tubes, and clipboard on the other table. Use the original blue stool design to provide one chair per center table. Put one low-poly plant inside the top-right corner of the center room. Use a slim shelf to the right of the sink, with a few containers.

Right room: reuse the small instrument desk, stool, and a shelf along the exterior right wall. Keep its mid-wall opening clear. Use the existing board frame design to mount one board per room if the scene does not yet have them. Keep the original clock.

Use a common bottle mesh with minor material variations. Keep props on their surfaces, preserve clearance around both tables, and inspect the walkable path from each doorway to the tables and fridge. Save the editable Blender copy with top and angled preview images. Wait for approval before GLB export.
~~~

## ใส่ภาพบนจอและกระดาน

ใช้ไฟล์จาก [ตารางเท็กซ์เจอร์สี่ภาพ](../3D/Room/ROOM-INDEX.md#เท็กซ์เจอร์สี่ภาพ) เวอร์ชัน Source สำหรับแก้ภาพและเวอร์ชัน Web สำหรับฉากเว็บ

~~~text
Apply these images to the existing front surfaces: Sample Register to the center computer monitor, Formulation Notes to the left board, Sample Handoff to the center board, and Demo Results to the right board. Preserve orientation and aspect ratio, keep every label legible, use a dedicated front-face material where required, and retain each frame, screen bezel and existing geometry. Relink the images to portable paths in the editable copy.

Only if asked to trim the room, inspect floor_and_walls and the named reference object in world coordinates. A previous request mentioned tweezers. Verify that it is the intended room-sized guide before using its span. Keep the established footprint when the object is a handheld prop or the intended boundary is unclear. In an approved trim, edit the relevant edge and wall ends without compressing tiles or shifting furniture and anchors.

Check all four surfaces in an angled preview and inspect the room top view. Save the .blend copy and preview images for review.
~~~

## สร้างอุปกรณ์ low-poly

แนบเฉพาะ [ภาพอ้างอิงของชิ้นที่ต้องสร้าง](../3D/Props/PROP-INDEX.md) และชิ้นคู่ที่ต้องประกบ เช่น หลอดและแท่น หรือชิ้นผิวและถาด

~~~text
Build one reusable prop at the scale of the existing Ralph Lab scene. Use broad polygon faces, readable silhouettes, limited material slots, and modest bevels. Use named, separate parts for moving geometry and sockets. Reuse existing room models where they already fit the reference.

For a glass vial or beaker, model an open mouth and a real hollow cavity with inner and outer walls, joined at the rim. Keep the sealed bottom. Use a clean transparent glass material with restrained highlights and keep any stylized liquid as a separate optional mesh. For the four-vial rack align the upper holes and lower sockets to the existing glass vial size. Make the four tray instances reuse one tray mesh with independent label and drop target. For the dropper use separate bulb and tube parts, a grip point and a tip point. The visible droplet is an independent reusable effect.

Check all moving parts against neighboring geometry before saving an editable copy.
~~~

## สถานีทดสอบ 4 Endpoint และแอนิเมชันอุปกรณ์

เริ่มที่ [ดัชนีสถานี](../3D/Endpoint-Station/STATION-INDEX.md) และ [ไฟล์ห้องรุ่นสถานี](../3D/Room/Current/Lab2_3room_station.blend) ใช้ [ภาพอ้างอิงสถานี](../3D/Endpoint-Station/Refs/) สำหรับชิ้นที่ยังต้องสร้าง

~~~text
Inspect the current Ralph Lab station, character rigs, clips and room assets before modifying them. Keep the Formulator's handoff vial tied to one project and exact formula revision. Represent four independent aliquots from that already-mixed formula, one each for skin irritation (skin), eye irritation (eye), skin sensitization (sens), and acute toxicity (acute).

Keep each tray's drop target, stand point, and vial position independently editable. Keep the master vial, aliquot, rack, tray, skin insert, dropper and droplet separate. Reuse the same pickup, carry, and dispense clips with per-tray attachment targets. Use isolated animation clips for fridge open/close and bin lid open/close. Align poses to actual grips and hinges, and release the held vial only at its placement or drop event. Preserve existing rig and bone names and any GLB node names used by the current viewer.

For a visualization, obtain results from the existing assessment for the exact project and formula revision. The animation does not calculate an outcome. Show unavailable or failed results explicitly. Use skin reactions only as illustrative effects, an eye-specific result surface for eye irritation, and a result card with route if available for acute toxicity. Clearly label demo data.

After each completed result, wait for Keep or Discard. Keep plays the fridge animation, assigns a free slot and allows the saved vial to reopen its linked result after reload. Discard plays the bin animation and creates no fridge archive entry. Preserve the existing project assessment. After all four decisions, offer to revise the tested formula by opening a new editable draft while preserving the tested version.

Verify one complete flow before extending to all four trays. Check placement, click targets, retries, missing results, duplicate decisions and animation transitions. Save the resulting Blender files and preview clips separately from the existing web assets.
~~~

## ตรวจโมเดลเพื่อใช้บนเว็บ

ใช้กับ [GLB ห้องปัจจุบัน](../3D/Room/Current/Lab_room_3room.glb) และ [ตัวละคร](../3D/Characters/CHARACTER-INDEX.md) ก่อนสรุปว่าเบาให้วัดใน Viewer บนเครื่องเป้าหมาย

~~~text
Audit the Blender copy and compare it with the existing GLB and viewer. Record meshes, scene primitives, triangle counts, texture dimensions, materials, rig and clips before changing anything. Examine duplicate geometry and textures, missing or flickering surfaces, glass sorting, open mouths, and likely WebGL costs. Identify which named nodes the viewer queries for interaction, animation, wall visibility, station alignment and agent placement.

Where changes are authorized, optimize duplicated prop data and oversized textures first, keeping the visible silhouette, readable screen and board textures, transparent glass, collision behavior, named hinges, sockets, and clip bindings. Compare before/after from the same cameras. Do not infer browser FPS from triangle counts.

For runtime verification, use the same viewport, device and production build. Compare initial load, frame times during orbit and agent actions, draw calls, and effect settings. Save the editable candidate and report quantitative differences and unresolved risks separately. Export or switch the production model only after review.
~~~

