# RalphGuard — สรุปการอัปเดตล่าสุดทั้งหมด

วันที่สรุป: 20 สิงหาคม 2026

## 1. ภาพรวมระบบปัจจุบัน

- ระบบแยก Frontend, Backend, PostgreSQL, Redis และ Scientific Worker ชัดเจน
- Docker สำหรับ Backend ไม่บังคับเปิด Frontend และสามารถรัน Frontend แยกที่พอร์ต 3000
- Scientific Worker รองรับ 5 endpoint ได้แก่ Skin Irritation, Eye Irritation, Skin Sensitization, Acute Oral Toxicity และ Skin Dryness
- โมเดลใหม่ถูกเก็บเป็น candidate และไม่เขียนทับ production อัตโนมัติ
- API และหน้าเว็บแสดงสถานะโมเดลทดลอง เพื่อไม่ทำให้ผู้ใช้เข้าใจว่าเป็นผลทางคลินิก

## 2. AI Assistant

- เพิ่มสถานะ “กำลังคิด” และเอฟเฟกต์พิมพ์คำตอบทีละส่วน
- เก็บประวัติแชทเมื่อรีเฟรชหน้า ออกจากหน้า หรือเปลี่ยนโปรเจกต์
- แยกประวัติแชทตามโปรเจกต์
- เพิ่มการตรวจสอบ structured action จาก LLM ก่อนแก้สูตร
- คำสั่งเพิ่มสาร ลดความเข้มข้น หรือตั้งความเข้มข้น สามารถนำไปแก้สูตรจริงได้
- ป้องกัน action ที่ไม่สมบูรณ์หรือข้อความ `<action>` ที่ถูกตัดกลางคัน
- ปัญหา GROQ API key และชื่อโมเดล LLM ถูกแยกเป็นข้อความผิดพลาดจาก Backend อย่างชัดเจน

## 3. สูตรและคลังสาร

- ช่อง “สารในสูตร/สารเสริมในสูตร” เชื่อมกับ Backend registry แทนรายการคงที่เพียงไม่กี่สาร
- รองรับค้นหาด้วยชื่อสาร, INCI, SMILES และสูตรโมเลกุล
- แสดงจำนวนสารที่พร้อมใช้งานในคลัง
- เพิ่มการนำเข้าข้อมูล PubChem แบบแบ่งหน้า พร้อม retry/resume และเก็บ provenance
- การสำรวจ PubChem รอบใหญ่ตรวจโครงสร้างที่ผ่านตัวกรอง 114,309 โครงสร้าง
- ไม่สร้าง negative label จากการไม่พบข้อความอันตราย
- แยกสารเดี่ยวออกจากเกลือ พอลิเมอร์ สารอนินทรีย์ และสารผสมที่ไม่เหมาะกับ molecular QSAR

## 4. ข้อมูลและความถูกต้องของการเทรน

- ใช้ canonical molecular identity สำหรับตรวจสารซ้ำ
- ตรวจ label conflict ภายใน identity เดียวกัน
- แยก training, external validation และ review queue
- กำจัด exact molecular overlap ระหว่างชุดฝึกกับ external set
- เพิ่ม scaffold-grouped validation เพื่อลดผลลวงจากโครงสร้างคล้ายกัน
- เก็บ source URL, เวลาที่ดึงข้อมูล, SHA-256 และนโยบายสร้าง label
- ไม่ใช้ prediction เก่าเป็น ground truth และไม่ใช้ missing evidence เป็น negative
- Training integrity report ปัจจุบันตรวจชุดข้อมูลได้รวม 465,830 endpoint rows ก่อนจำกัดขนาดต่อโมเดล

## 5. โมเดลเดิม Candidate-v2

Notebook จำกัดการฝึกรอบเดียวไว้สูงสุด 15,000 molecular identities ต่อ endpoint เพื่อให้รันได้จริงบนเครื่องปัจจุบัน

| Endpoint | จำนวนฝึก | Features ที่เลือก | OOF AUC | OOF MCC | Scaffold AUC | Scaffold MCC |
|---|---:|---|---:|---:|---:|---:|
| Skin Irritation | 15,000 | MACCS + descriptors | 0.870 | 0.223 | 0.856 | 0.255 |
| Eye Irritation | 15,000 | MACCS + descriptors | 0.936 | 0.458 | 0.925 | 0.519 |
| Skin Sensitization | 9,442 | Morgan | 0.947 | 0.565 | 0.913 | 0.542 |
| Acute Oral Toxicity | 15,000 | Morgan + MACCS + descriptors | 0.879 | 0.526 | 0.850 | 0.501 |

เมื่อเทียบ AUC กับ production reference:

- Eye ดีขึ้นประมาณ 0.050
- Skin Sensitization ดีขึ้นประมาณ 0.051
- Skin ลดลงประมาณ 0.056
- Acute ลดลงประมาณ 0.024
- MCC ของ candidate ยังต่ำกว่า production ทุก endpoint จึงยังไม่ควรแทน production อัตโนมัติ

## 6. การเพิ่มข้อมูล Skin Sensitization

- เพิ่มตัวนำเข้าข้อมูล NICEATM Human Predictive Patch Test
- รองรับ positive และ explicit negative evidence
- ทำ identity resolution, conflict filtering และ provenance ก่อนรวมชุดฝึก
- จำนวนฝึกรอบล่าสุดเพิ่มเป็น 9,442 molecular identities
- External validation ถูกแยกจาก training เพื่อป้องกัน leakage

## 7. Skin Dryness Endpoint

- เพิ่ม endpoint `skin_dryness` ตั้งแต่ schema, pipeline, API, Worker จนถึงหน้าเว็บ
- ใช้หลักฐานตรงจาก TEWL/skin hydration ร่วมกับหลักฐานกำกับดูแลที่ระบุแหล่งที่มา
- EUH066 ใช้เป็น regulatory weak positive เท่านั้น ไม่ใช่ direct experimental label
- การไม่มี EUH066 ไม่ถูกนับเป็น negative
- Exact external identities ถูกกักออกจากชุดฝึก

จำนวนข้อมูลปัจจุบัน:

| รายการ | จำนวน |
|---|---:|
| Evidence rows ทั้งหมด | 10,035 |
| Unique molecular identities | 10,020 |
| มี label และผ่านเกณฑ์ฝึก | 31 |
| Positive | 26 |
| Explicit negative | 5 |
| Unlabeled discovery pool | 10,000 |
| External structures | 6 |

ผล Candidate-v3:

| Validation | AUC | MCC | Balanced accuracy |
|---|---:|---:|---:|
| 5-fold OOF | 0.823 | 0.398 | 0.769 |
| Scaffold-grouped | 0.723 | 0.392 | 0.723 |
| External | 0.125 | -0.250 | 0.375 |

สถานะคือ `research_only_blocked` เพราะ negative และ external set ยังน้อย รวมถึงผล external ยังไม่ผ่านเกณฑ์ จึงใช้ได้เฉพาะ research preview

## 8. สมุนไพรไทย

- เพิ่มทะเบียนสมุนไพรไทย 30 รายการจาก Thai Herbal Pharmacopoeia ของกรมวิทยาศาสตร์การแพทย์
- เก็บชื่อไทย ชื่ออังกฤษ ชื่อวิทยาศาสตร์ วงศ์ ส่วนของพืช และ provenance
- แบ่งข้อมูลเป็น 3 ระดับ:
  1. Botanical identity
  2. Herbal material เช่น ผง สารสกัด น้ำมัน และวิธีสกัด
  3. Chemical constituent ที่มีโครงสร้างโมเลกุลชัดเจน
- ไม่ใช้ SMILES ของ marker compound ตัวเดียวแทนสารสกัดทั้งต้น
- QSAR ประเมินเฉพาะ constituent ที่ resolve โครงสร้างได้
- หลักฐานของสารสกัดหรือพืชทั้งชนิดแสดงเป็น botanical/literature evidence แยกจาก molecular QSAR
- ขั้นตอน seed สมุนไพรอยู่ใน Notebook และทำงานแบบ idempotent จึงกดซ้ำได้

## 9. Continual Learning

- สารใหม่ที่ผู้ใช้ส่งเข้ามาไม่ถูกนำไปฝึกทันที
- Prediction ของระบบไม่ถูกใช้เป็น label ของตัวเอง
- ข้อมูลใหม่เริ่มเป็น observation ที่ `training_eligible=false`
- จะเข้าคิว candidate ได้เมื่อมีหลักฐานอิสระ ยืนยัน identity ไม่มี conflict และไม่อยู่ใน final holdout
- การอัปเดตใช้ frozen RDKit representation ร่วมกับ replay buffer ที่คำนึงถึง class และ scaffold
- ทุกเวอร์ชันต้องเปรียบเทียบก่อน/หลัง และผ่าน promotion gate ก่อนใช้งานจริง

## 10. Symptom Lab และการ Paint

- ห้าม Paint หากยังไม่ได้กดประเมินสูตร
- ผล Paint อ้างอิงคะแนน endpoint ที่มีอยู่จริง
- เพิ่มการรองรับผล Skin Dryness ใน UI
- ผิวลอกใช้ procedural texture บนโมเดล ไม่ใช้เส้นโครงข่ายจากภาพตัวอย่าง
- หน้าเว็บแสดงคำเตือนเมื่อผลมาจาก research candidate
- Skin Dryness candidate สามารถ hot-load หลัง Notebook สร้าง artifact โดยไม่ต้องคัดลอกทับ production

## 11. Notebook แบบ Run All

ไฟล์หลัก: `notebooks/RalphGuard_Candidate_v2_Training_and_Validation.ipynb`

เมื่อกด Run All จะทำ 6 ขั้นตอน:

1. ตรวจ environment และตำแหน่ง repository
2. ตรวจหลักฐาน ECHA, นำเข้า NICEATM HPPT และ seed สมุนไพรไทย
3. เตรียมข้อมูลและตรวจ identity, provenance, conflict และ leakage
4. Benchmark และฝึก Candidate-v2 สำหรับ 4 endpoint เดิม
5. Benchmark feature และฝึก Skin Dryness Candidate-v3
6. สร้างกราฟ validation, model card, summary และ promotion gate

ผลลัพธ์อยู่ที่:

- `scientific/models/candidate_v2/`
- `scientific/models/candidate_v3/`
- `scientific/models/notebook_run_summary.json`

## 12. การทดสอบล่าสุด

- Scientific targeted tests ผ่าน 13 tests
- Backend transparency/herbal/continual-learning tests ผ่าน 12 tests
- Frontend production build ผ่าน
- API พบสมุนไพร 30 รายการ
- Docker Worker โหลดครบ `skin`, `eye`, `sens`, `acute` และ `skin_dryness candidate_v3`
- API รายงาน Skin Dryness เป็น `research_candidate_blocked` อย่างถูกต้อง

## 13. ข้อจำกัดที่ยังต้องพัฒนา

- Skin Dryness ต้องเพิ่ม explicit negative และ independent external evidence อย่างมาก
- Candidate-v2 ยังต้องผ่าน promotion criteria ก่อนแทน production
- สมุนไพรไทย 30 รายการเป็น botanical registry ไม่ใช่ 30 single-molecule training labels
- ต้องเพิ่ม constituent ที่ระบุโครงสร้างได้ พร้อม positive/negative evidence ที่ตรวจสอบย้อนกลับได้
- คะแนนทั้งหมดเป็น in-silico screening ไม่ใช่ผลทดสอบทางคลินิก

## 14. แหล่งอ้างอิงหลัก

- ECHA Annex VI to CLP: https://echa.europa.eu/information-on-chemicals/annex-vi-to-clp
- NICEATM Human Predictive Patch Test: https://ntp.niehs.nih.gov/iccvam/methods/immunotox/hppt
- Thai Herbal Pharmacopoeia: https://bdn-thp.dmsc.moph.go.th/
- Skin-barrier/TEWL study PMID 24063883: https://pubmed.ncbi.nlm.nih.gov/24063883/

