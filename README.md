# RalphGuard

> **In-silico Irritation & Toxicity Risk Screening Platform**
> ระบบประเมินความเสี่ยงการระคายเคืองและความเป็นพิษของสารเคมีด้วยแบบจำลองคอมพิวเตอร์ เพื่อลดการพึ่งพาการทดลองในสัตว์

[![Status](https://img.shields.io/badge/status-in--development-yellow)]()
[![Category](https://img.shields.io/badge/NSC2026-Category%2014-blue)]()

---

## 📖 เกี่ยวกับโปรเจค

RalphGuard เป็นเว็บแอปพลิเคชันสำหรับประเมินความเสี่ยงเบื้องต้นของสารเคมีหรือส่วนประกอบในผลิตภัณฑ์ ที่อาจก่อให้เกิดการระคายเคืองต่อผิวหนัง ดวงตา หรือมีความเป็นพิษ โดยใช้การวิเคราะห์โครงสร้างโมเลกุลร่วมกับแบบจำลองเชิงคำนวณ

**4 Endpoints ที่ประเมิน:**
- 🖐️ Skin Irritation (การระคายเคืองผิวหนัง)
- 👁️ Eye Irritation (การระคายเคืองดวงตา)
- 🛡️ Skin Sensitization (การแพ้สัมผัสผิวหนัง)
- 🧪 Acute Toxicity (ความเป็นพิษเฉียบพลัน)

**ฟีเจอร์หลัก:**
- รับข้อมูลสารในรูปแบบชื่อสาร, SMILES, หรือไฟล์ CSV
- Formula Builder สำหรับสร้างสูตรผสมแบบ interactive
- 3D Anatomy visualization แสดงผลตามช่วงเวลา Day 1 / 3 / 7
- 3-Layer Confidence System (AD + Probability + Rule-based)
- รายงาน PDF สรุปผลและข้อจำกัด

---

## 🏗️ Architecture

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│  Frontend   │───▶│  Backend API │───▶│  Scientific  │
│  Next.js    │    │   FastAPI    │    │   Worker     │
│  React 3F   │    │              │    │   (RDKit)    │
└─────────────┘    └──────┬───────┘    └──────┬───────┘
                          │                    │
                   ┌──────▼────────────────────▼──┐
                   │   PostgreSQL  +  Redis        │
                   └───────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (สำหรับ frontend dev)
- Python 3.11+ (สำหรับ scientific dev)

### Run with Docker Compose

```bash
# Clone repository
git clone <repo-url>
cd ralphguard

# Copy environment variables
cp .env.example .env

# Build and start all services
docker compose up --build

# Access:
# Frontend:    http://localhost:3000
# Backend API: http://localhost:8000
# API Docs:    http://localhost:8000/docs
```

### Local Development (without Docker)

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

---

## 📂 Project Structure

```
ralphguard/
├── frontend/              # Next.js + TypeScript + Tailwind + R3F
│   ├── app/               # App router pages
│   ├── components/        # UI components
│   ├── lib/               # API client, utilities
│   └── public/            # Static assets
├── backend/               # FastAPI
│   ├── app/
│   │   ├── api/           # API routes
│   │   ├── core/          # Config, security
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   └── services/      # Business logic
│   └── tests/
├── scientific/            # RDKit + ML pipeline
│   ├── descriptors.py     # Molecular descriptors
│   ├── fingerprints.py    # Morgan fingerprints
│   ├── qsar/              # QSAR models (4 endpoints)
│   ├── applicability.py   # AD check (k-NN)
│   ├── confidence.py      # 3-layer confidence
│   ├── mixture.py         # Mixture risk calculation
│   └── worker.py          # Redis queue consumer
├── data/
│   ├── raw/               # Downloaded datasets
│   └── processed/         # Cleaned & split datasets
├── docs/
│   ├── report/            # Final thesis report
│   └── manual/            # User & install manuals
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🧪 Scientific Methodology

ดูรายละเอียดในไฟล์ `docs/report/` และ `scientific/README.md`

**Pipeline:**
1. Input → SMILES validation (RDKit canonicalize)
2. Compute molecular descriptors + Morgan fingerprint
3. Applicability Domain check (k-NN Tanimoto distance)
4. QSAR prediction (Random Forest baseline)
5. Rule-based toxicity flag verification
6. 3-Layer Confidence aggregation
7. Mixture handling + Region sensitivity adjustment
8. Time-course estimation (Day 1 / 3 / 7)

---

## 📊 Datasets Used

| Endpoint | Source | Size |
|----------|--------|------|
| Acute Toxicity | EPA CATMoS | ~11,000 chemicals |
| Skin Sensitization | ICCVAM LLNA | ~200 chemicals |
| Skin Irritation | ECHA / Literature | ~200 chemicals |
| Eye Irritation | ECETOC Reference DB | ~150 chemicals |

---

## ⚠️ Disclaimer

RalphGuard เป็นเครื่องมือคัดกรองความเสี่ยงเบื้องต้นด้วยแบบจำลองคอมพิวเตอร์ (in-silico)

- ❌ ไม่ใช่การรับรองความปลอดภัยของยา เครื่องสำอาง หรือสารเคมี
- ❌ ไม่ใช้แทนการทดสอบมาตรฐานในห้องปฏิบัติการ
- ❌ ไม่ใช้แทนการประเมินโดยผู้เชี่ยวชาญ
- ❌ ไม่ให้คำแนะนำทางการแพทย์ และไม่ใช้กับข้อมูลผู้ป่วยจริง

ผลลัพธ์ทุกส่วนมาจากแบบจำลองคอมพิวเตอร์และต้องได้รับการตรวจสอบเพิ่มเติมก่อนนำไปใช้จริง

---

## 🙏 Acknowledgment

โครงการนี้ได้รับทุนสนับสนุนจาก **สำนักงานพัฒนาวิทยาศาสตร์และเทคโนโลยีแห่งชาติ (สวทช.)** ภายใต้การแข่งขันพัฒนาโปรแกรมคอมพิวเตอร์แห่งประเทศไทย ครั้งที่ 28 (NSC 2026) หมวด 14: โปรแกรมเพื่องานการพัฒนาด้านวิทยาศาสตร์และเทคโนโลยี

---

## 👥 Team

- **นายสุรวิทย์ สุขเจริญ** — Project Lead, Frontend Development
- **นายธนกรณ์ อ่อนกลั่น** — Backend & Data, System Testing

**Institution:** ภาควิชาเทคโนโลยีสารสนเทศ คณะเทคโนโลยีและการจัดการอุตสาหกรรม
มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าพระนครเหนือ

---

## 📄 License

Copyright © 2026 King Mongkut's University of Technology North Bangkok. All rights reserved.

Software developed under NSC 2026 funding by NSTDA. See LICENSE for full terms.
#   r a l p h g u a r d  
 "# ralphguard" 
