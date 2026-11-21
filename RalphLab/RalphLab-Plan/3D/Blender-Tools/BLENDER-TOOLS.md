# ตัวอย่างสคริปต์ Blender

สคริปต์ด้านล่างเป็นสำเนาจาก Downloads เก็บไว้ให้ Agent อ่านและเลือกนำตรรกะไปใช้ ตรวจ path และคำสั่งท้ายไฟล์ก่อนรัน เพราะบางไฟล์อ้างถึงโฟลเดอร์เดิม หรือบันทึก/แก้ฉากที่เปิดอยู่ ควรทดลองบนไฟล์ Blender สำเนา

| งาน | สคริปต์ |
|---|---|
| สร้างชิ้นส่วนสถานี | [build_test_station.py](Station/build_test_station.py) |
| ย้ายสถานีไปจุดใช้งานจริง | [relocate_test_station.py](Station/relocate_test_station.py) |
| ปรับถังและฝาพับ | [rebuild_room_bin.py](Station/rebuild_room_bin.py) |
| ทำภาพพรีวิวสถานี | [render_station_previews.py](Station/render_station_previews.py) |
| เครื่องมือจัด Action และ Rig | [ralph_anim_tools.py](Animation/ralph_anim_tools.py) |
| สร้างท่าทำงานหน้าโต๊ะและท่านั่ง | [build_bench_clip.py](Animation/build_bench_clip.py) · [build_seated_clips.py](Animation/build_seated_clips.py) |
| สร้างคลิปหยิบ–วางและงานสถานี | [build_station_clips.py](Animation/build_station_clips.py) |
| พรีวิวลำดับงานและคลิปสถานี | [build_sequence_preview.py](Animation/build_sequence_preview.py) · [preview_station_clips.py](Animation/preview_station_clips.py) |

สคริปต์ชุดนี้ใช้ Blender Python API เช่น `bpy` และ `mathutils` เก็บเป็นโค้ดอ้างอิงสำหรับงาน 3D และยังไม่ได้รันซ้ำจากตำแหน่งใหม่ใน Vault

