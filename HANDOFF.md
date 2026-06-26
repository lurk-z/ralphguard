# RalphGuard — Handoff / Context Document

> In-silico Irritation & Toxicity Risk Screening Platform
> NSC 2026 หมวด 14 · เดดไลน์ส่ง: 17 ก.ค. 2569 17:00
> Repo: https://github.com/lurk-z/ralphguard.git

เอกสารนี้สรุป **สถานะทั้งหมด ณ ปัจจุบัน** เพื่อทำงานต่อใน Claude Code โดยไม่ต้องไล่ context เดิม

---

## 1. ภาพรวมระบบ

RalphGuard รับ "สูตรผสมสารเคมี" (SMILES + % ความเข้มข้น) + เลือกบริเวณร่างกาย → ทำนายความเสี่ยง 4 ด้านด้วยโมเดล QSAR แล้วแสดงผลแบบไล่ตามเวลา (Day 1/3/7) พร้อมระดับความน่าเชื่อถือ 3 ชั้น

**เป็น in-silico screening เท่านั้น ไม่ใช่การทดสอบจริง — ต้องมี disclaimer ในทุก output**

4 endpoints: `skin` (ระคายเคืองผิว), `eye` (ระคายเคืองตา), `sens` (แพ้สัมผัส), `acute` (พิษเฉียบพลัน)

---

## 2. Stack

- **Frontend:** Next.js 14 + TypeScript + Tailwind + Three.js (`@react-three/fiber`, `@react-three/drei`) + Recharts
- **Backend:** FastAPI + Pydantic v2 + SQLAlchemy 2.0 (sync engine) + Alembic + psycopg2
- **Scientific:** Python 3.11 (ใน Docker) + RDKit + scikit-learn + numpy + pandas + joblib
- **DB:** PostgreSQL 16 · **Queue:** Redis 7 (Streams + consumer group)
- **Deploy:** Docker Compose (services: postgres, redis, backend:8000, worker, frontend:3000)

---

## 3. แหล่งข้อมูล & วิธีเทรน (ตอบคำถาม "เอาข้อมูลจากไหน / น่าเชื่อถือแค่ไหน")

### Datasets — `data/raw/*.csv` (≈147 สาร/endpoint, หลัง clean เหลือ ~144)
| ไฟล์ | endpoint | ที่มา (คอลัมน์ `source`) |
|---|---|---|
| `skin_irritation.csv` | skin | literature (อ้างอิงแนว OECD TG 404/439) |
| `eye_irritation.csv` | eye | literature (OECD TG 405/492) |
| `llna_sensitization.csv` | sens | LLNA-literature (OECD TG 429/442) |
| `catmos_acute_toxicity.csv` | acute | CATMoS-literature (OECD TG 420) |

> เป็นชุดข้อมูล **curated จากวรรณกรรม/สาธารณะ ขนาดเล็ก (~147 สาร)** — เหมาะระดับ *screening* ไม่ใช่ระดับ regulatory
> **ข้อจำกัดความน่าเชื่อถือ:** ชุดเล็ก, class imbalance (positive น้อย เช่น sens 32/144), sensitivity ต่ำในบาง endpoint (sens=0.00 บน test set เล็ก), ยังไม่มี external validation set → ใช้ประกอบการคัดกรองเบื้องต้นเท่านั้น

### วิธีเทรน (`data_prep.py`)
1. Clean: canonicalize SMILES (RDKit), strip invalid, ลบ duplicate
2. Featurize: **Morgan/ECFP fingerprint** (radius 2, 2048 bits)
3. Model: **Random Forest** (200 trees, `random_state=42`)
4. Validate: **5-fold stratified CV + held-out test 20%** — วัด accuracy, balanced accuracy, sensitivity, specificity, ROC-AUC
5. Save bundle `.pkl` = `{model, train_fps, train_smiles, metrics, ...}` (เก็บ train_fps ไว้ทำ Applicability Domain)

### ผล validation (ปัจจุบัน)
| Endpoint | n_train | n_test | Acc | BalAcc | Sens | Spec | AUC |
|---|---|---|---|---|---|---|---|
| Skin | 115 | 29 | 0.793 | 0.669 | 0.429 | 0.909 | **0.779** |
| Eye | 115 | 29 | 0.793 | 0.669 | 0.429 | 0.909 | **0.779** |
| Sens | 115 | 29 | 0.759 | 0.478 | 0.000 | 0.957 | **0.757** |
| Acute | 115 | 29 | 0.828 | 0.645 | 0.333 | 0.957 | **0.772** |

### หลักการ OECD QSAR 5 ข้อ (ทำครบ)
1. Defined endpoint ✓
2. Unambiguous algorithm (RF on Morgan FP) ✓
3. Defined applicability domain (k-NN Tanimoto, k=5, threshold 0.30) ✓
4. Goodness-of-fit/robustness/predictivity (CV + held-out) ✓
5. Mechanistic interpretation (structural alerts / SMARTS) ✓

### Confidence 3 ชั้น
- **Layer 1** Applicability Domain (in/out ของ domain)
- **Layer 2** ความชัดของ probability (extremity)
- **Layer 3** ความสอดคล้องของ structural alert กับผลโมเดล
→ รวมเป็น High / Medium / Low + เหตุผลภาษาไทย (out-of-domain → Low เสมอ)

---

## 4. โครงสร้างโปรเจค (ไฟล์สำคัญ)

```
ralphguard/
├── data_prep.py                 # เทรนโมเดล → scientific/models/*.pkl + validation_report.json
├── docker-compose.yml           # postgres, redis, backend, worker, frontend
├── data/raw/*.csv               # 4 datasets
├── backend/
│   ├── requirements.txt         # rdkit==2025.3.6 (เคยพังเพราะ 2024.3.5 ถูกถอด)
│   ├── Dockerfile               # python:3.11-slim + system libs สำหรับ rdkit
│   ├── alembic/versions/20260616_0001_initial_schema.py
│   └── app/
│       ├── main.py              # FastAPI app + routers
│       ├── core/config.py       # Settings (DATABASE_URL, REDIS_URL, MODELS_DIR=/models, CORS_ORIGINS)
│       ├── db/{base,session}.py
│       ├── models/{project,substance,assessment}.py  # SQLAlchemy ORM
│       ├── schemas/*.py         # Pydantic
│       ├── services/{chemistry,queue,assessment_service}.py
│       └── api/{health,projects,substances,assessments,models}.py
├── scientific/
│   ├── requirements.txt         # rdkit==2025.3.6, scikit-learn==1.5.2, numpy==2.0.2 ...
│   ├── descriptors.py fingerprints.py applicability.py confidence.py mixture.py rules.py
│   ├── qsar/predictor.py        # โหลด 4 .pkl + predict + AD
│   ├── pipeline.py              # SMILES+region → ผลรวม + Day1/3/7 + banding + confidence
│   └── worker.py                # Redis Streams consumer → run pipeline → write PG + cache substances
└── frontend/
    ├── lib/api.ts               # client เรียก backend
    ├── components/AnatomyModel.tsx   # 3D body (R3F) เลือกบริเวณ
    └── app/
        ├── page.tsx             # landing
        ├── assess/page.tsx      # formula builder + 3D + live SMILES validate + random picker + ผล + print
        ├── history/page.tsx     # ประวัติการประเมิน
        └── models/page.tsx      # model card / validation (judge-facing)
```

---

## 5. สถานะ Git

- **Remote:** `https://github.com/lurk-z/ralphguard.git`
- **Default branch บน GitHub = `Port`** (ไม่ใช่ main!) — เปิด repo ต้องสลับไป branch `main` ถึงเห็นงาน
- **Branch ที่ใช้จริง = `main`** (งานล่าสุดทั้งหมดอยู่ที่นี่)
- Branches อื่น: `GOD` (= main, personal), `Port` (default เก่า), `claude/sleepy-jemison-6b8403` (W2 worktree เดิม — merge เข้า main แล้ว)

### Commit history (main)
```
4e8df51  fix(deps): bump rdkit to 2025.3.6 (2024.3.5 yanked from PyPI)
3f4f7de  feat: 3D anatomy, history, model card, substance caching, printable report, live SMILES validation
3a41f05  fix(db): emit assessment_status enum once in initial migration
60d7152  W2 complete: real worker, wired API, structural alerts, /assess UI
ee89bb5  W2 foundation: DB schema, Alembic, schemas, QSAR predictor + pipeline
20c4a89  setup backend api worker redis postgres
```
> **ค้าง:** ฟีเจอร์ "สุ่มสาร" ใน `frontend/app/assess/page.tsx` ยัง uncommitted — ให้ commit/push เพิ่ม

---

## 6. วิธีรัน (สำคัญ — มีกับดัก)

### สร้างโมเดลก่อน (จำเป็น — `.pkl` ไม่ได้อยู่ใน git เพราะ gitignore)
เครื่อง dev เป็น **Python 3.14** ซึ่งไม่มี wheel ของ scikit-learn 1.5.2 → **ต้องสร้างโมเดลใน Docker (Python 3.11)** แทน:
```bat
docker compose run --rm --no-deps -w /work -v "%cd%:/work" worker python data_prep.py
```
ได้ `scientific/models/*.pkl` (4 ตัว) + `validation_report.json`

### รันทั้งระบบ
```bat
docker compose up -d --build backend worker     :: --build จำเป็นถ้าแก้ requirements
docker compose up postgres redis backend worker
:: แยก terminal:
cd frontend && npm install && npm run dev
```
เปิด `http://localhost:3000` · backend `http://localhost:8000/health` · API docs `http://localhost:8000/docs`

---

## 7. กับดักที่เจอแล้ว (อย่าพลาดซ้ำ)

1. **rdkit 2024.3.5 ถูกถอดจาก PyPI** → ใช้ `2025.3.6` (แก้แล้วทั้ง backend + scientific requirements)
2. **Python 3.14 บนเครื่อง dev** ไม่มี wheel sklearn 1.5.2 → สร้างโมเดลใน Docker เท่านั้น (อย่า `pip install` บนเครื่อง)
3. **`.pkl` gitignored** → clone ใหม่ต้องรัน data_prep ก่อน worker ถึงทำนายได้
4. **แก้ requirements แล้วต้อง `docker compose up --build`** ไม่งั้น image เก่าไม่มี rdkit → backend crash `ModuleNotFoundError: rdkit` (เคยทำให้ frontend ขึ้น "Failed to fetch")
5. **Alembic enum:** `assessment_status` ต้องใช้ `create_type=False` + explicit `.create(checkfirst=True)` ไม่งั้น `CREATE TYPE` ซ้ำ → `alembic upgrade head` ล้ม
6. **backend อ่าน validation_report.json** ผ่าน mount `./scientific/models:/models:ro` (env `MODELS_DIR=/models`)
7. **CORS_ORIGINS** ส่งเป็น string ใน docker-compose — ใช้งานได้ แต่ถ้าเจอ CORS error ในอนาคต ให้ทำ field validator ใน `config.py` รับทั้ง JSON/comma/string

---

## 8. Endpoints ที่ทำงานจริง

```
GET  /health, /health/ready
POST /api/substances/validate         # RDKit canonical + descriptors
POST /api/assessments/                 # enqueue → job_id (202)
GET  /api/assessments/                 # list (?project_id=&limit=)
GET  /api/assessments/{job_id}         # ผลจาก DB
GET  /api/projects/, POST /api/projects/, GET /api/projects/{id}
GET  /api/projects/{id}/assessments
GET  /api/models/metrics, /api/models/info
```

---

## 9. งานที่เหลือ / Roadmap (ทำต่อใน Claude Code)

**ตรวจ/ทดสอบ**
- [ ] รัน full test: `cd frontend && npm run type-check && npm run build` (next dev ไม่เช็ค type เต็ม)
- [ ] backend `pytest` (ตอนนี้มีแค่ smoke test) — เพิ่ม test จริงสำหรับ pipeline/endpoints
- [ ] ทดสอบ end-to-end: กดประเมินในหน้า /assess แล้วได้ผลครบ

**ความน่าเชื่อถือ/วิทยาศาสตร์ (สำคัญต่อกรรมการ)**
- [ ] เพิ่มขนาด/คุณภาพ dataset, เพิ่ม external validation set
- [ ] จัดการ class imbalance (เช่น class_weight, resampling) เพื่อดัน sensitivity
- [ ] เขียน validation report / เอกสารอ้างอิงแหล่งข้อมูลให้ชัด

**ฟีเจอร์**
- [ ] หน้า/ปุ่ม export รายงาน PDF ที่สมบูรณ์ (ตอนนี้ใช้ window.print ของเบราว์เซอร์)
- [ ] batch CSV import ของสูตร
- [ ] ปรับ 3D model เป็น GLTF จริง (ตอนนี้เป็น primitive geometry)
- [ ] auth / multi-user, deploy ขึ้น cloud

**เอกสาร**
- [ ] `docs/report/` และ `docs/manual/` ยังว่าง — เขียนเล่มรายงาน + คู่มือผู้ใช้

---

## 10. คำสั่งที่ใช้บ่อย

```bat
:: ดู log
docker logs ralphguard-backend --tail 50
docker logs ralphguard-worker --tail 50

:: rebuild หลังแก้โค้ด backend/requirements
docker compose up -d --build backend worker

:: เทรนโมเดลใหม่ (ใน Docker)
docker compose run --rm --no-deps -w /work -v "%cd%:/work" worker python data_prep.py

:: git
git branch --show-current
git status
git add -A && git commit -m "..." && git push origin main
```
