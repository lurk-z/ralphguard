# RalphGuard — External Validation (ตอบข้อเสียกรรมการ #4)

ทดสอบโมเดล **Ensemble v2** กับชุดสารอ้างอิงภายนอก (`data/external_validation.csv`)
ที่มีผลจำแนกชัดเจนจากวรรณกรรม/แนวทาง OECD — แยกออกจากข้อมูลเทรน เพื่อดูว่าโมเดล
generalize ได้จริงกับสารที่ไม่เคยเห็น

## วิธี
- 24 สาร, ติดป้าย hazard ต่อ endpoint จากแหล่งที่ยอมรับ (OECD positive controls,
  EU26 fragrance allergens, organophosphate, สารกัดกร่อน ฯลฯ)
- ตรวจว่าสารใด **NOVEL** (canonical SMILES ไม่อยู่ในชุดเทรน) — ได้ 10 สาร
- รันผ่าน ensemble + operating threshold ต่อ endpoint, เทียบ predict vs ป้ายจริง

## ผลลัพธ์

| ขอบเขต | n | Accuracy | **Sensitivity** | Specificity |
|---|---|---|---|---|
| ทั้งหมด | 24 | 0.92 | **1.00** (13/13 จับ hazard ครบ) | 0.82 (9/11) |
| **เฉพาะสารใหม่ (NOVEL)** | 10 | 0.90 | **1.00** (5/5) | 0.80 (4/5) |

**ไฮไลต์:**
- **DNCB** (สารก่อแพ้แรงที่โมเดลเดิมพลาด) → ตอนนี้ flag ถูก ✓
- จับสารก่อแพ้ครบ: PPD, isoeugenol, glutaraldehyde, cinnamaldehyde ✓
- จับสารพิษเฉียบพลันครบ: nicotine, parathion, paraquat, methanol ✓
- จับสารกัดกร่อน/ระคายผิวครบ: NaOH, phenol, acetic acid, ammonia ✓
- False positive 2 ตัว (ยอมรับได้สำหรับ screening): Sodium chloride (acute, p=0.32), Benzoic acid (skin, p=0.66)

**ตีความ:** สำหรับเครื่องมือ **คัดกรองความปลอดภัย** การจับ hazard ให้ครบ (Sensitivity สูง) สำคัญที่สุด
— โมเดลทำได้ 100% บนสารอ้างอิง (รวมสารใหม่) โดยแลกกับ false positive เล็กน้อย ซึ่งเป็นทิศทางที่ถูกต้อง

## ความซื่อสัตย์ / ข้อจำกัด
- เป็นชุด **literature/textbook-classified** ขนาดเล็ก (positive 13 ตัว) — **ไม่ใช่ wet-lab ใหม่**
- ใช้เป็น **sanity-level external check** ยืนยันทิศทาง ไม่ใช่ benchmark ทางการ
- ป้ายจาก OECD reference / EU allergen list / ความเป็นพิษที่เป็นที่ยอมรับในวรรณกรรม
- ขั้นถัดไปที่ควรทำ: ขยายชุด external, ใช้ benchmark สาธารณะ (เช่น OECD QSAR Toolbox), และถ้าเป็นไปได้ ยืนยันกับผล in-vitro (OECD TG439/492/442)

*(ทำซ้ำได้: `python /tmp/extval.py` เทียบกับโมเดลใน scientific/models/)*
