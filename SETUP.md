# 🚀 SETUP — Quick Start

อ่านไฟล์นี้เป็นอันดับแรกหลัง clone repo

## ขั้นที่ 1: เครื่องมือที่ต้องมี

ติดตั้งสิ่งเหล่านี้ก่อนเริ่ม

- [ ] **Git** — `git --version`
- [ ] **Docker Desktop** — `docker --version` และ `docker compose version`
- [ ] **Node.js 20+** — `node --version` (สำหรับ frontend dev)
- [ ] **Python 3.11+** — `python3 --version` (สำหรับ scientific dev)
- [ ] **VS Code** หรือ IDE ที่คุณถนัด

## ขั้นที่ 2: Clone และตั้งค่า

```bash
git clone <your-repo-url> ralphguard
cd ralphguard

# Copy environment template
cp .env.example .env
```

บน Windows ให้ตรวจทันทีว่า branch ที่ Clone มีไฟล์ runtime ครบ (รวมโมเดล QSAR และไฟล์ 3D):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-clone-ready.ps1
```

ถ้าขึ้นว่า current branch ไม่ใช่ clone-default branch ให้ผู้ดูแล repository รวม branch ล่าสุดเข้า
default branch บน GitHub ก่อน ห้ามแก้ด้วยการคัดลอกโมเดลด้วยมือเฉพาะเครื่อง เพราะเครื่องถัดไปจะขาดไฟล์ซ้ำอีก

เปิดไฟล์ `.env` แล้วแก้ค่า `API_SECRET_KEY` ให้เป็นค่าสุ่มที่ยาว ๆ

ถ้าต้องการใช้ AI Chatbot ให้กำหนด `GROQ_API_KEY` ใน `.env` ด้วย ห้ามใส่ key จริงใน `.env.example`

## ขั้นที่ 3: ทดสอบว่าทุกอย่างพร้อม

### A) วิธีแนะนำ — Backend ใน Docker + Frontend ด้วย npm

เปิด Terminal แรกที่ root ของโปรเจกต์ แล้วรัน PostgreSQL, Redis, Backend และ Scientific Worker:

```powershell
docker compose up -d --build
```

Frontend ไม่ได้ติดตั้งหรือรันใน Docker ให้เปิด Terminal ที่สองแล้วรัน Next.js จากเครื่อง:

```powershell
cd frontend
npm install
npm run dev
```

`npm install` จำเป็นเฉพาะครั้งแรกหรือเมื่อ `package-lock.json` เปลี่ยน จากนั้นเปิดในเบราว์เซอร์:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

ถ้าเปิดทั้ง 3 URL ได้ = setup สำเร็จ ✅ การหยุด `npm run dev` ให้กด `Ctrl+C` ใน Terminal ของ frontend

### B) วิธีพัฒนา Backend/Worker แบบ local

**Database + Redis (ใน Docker):**
```bash
docker compose up postgres redis
```

**Backend (local):**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend (local):**
```bash
cd frontend
npm install
npm run dev
```

**Scientific Worker (local):**
```bash
cd scientific
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python worker.py
```

## ขั้นที่ 4: ทดสอบ Smoke Test

```bash
# Backend tests
cd backend
pytest

# Frontend type-check
cd ../frontend
npm run type-check

# Scientific quick test
cd ../scientific
python descriptors.py
```

ทั้งหมดควรผ่านโดยไม่มี error

## ขั้นที่ 5: ตามแผน W1 — สิ่งที่ต้องทำเพิ่ม

ดูแผนเต็มใน `docs/` แต่ตอนนี้

- [ ] ดาวน์โหลดชุดข้อมูล 4 endpoint ลง `data/raw/` (ดู `data/raw/README.md`)
- [ ] ออกแบบ database schema (สร้างไฟล์ใน `backend/app/models/`)
- [ ] เริ่ม port `RalphGuardLab.jsx` (demo) เข้ามาที่ `frontend/app/assess/page.tsx`

## ❓ ติดปัญหา

ลองดูตามนี้ก่อน

**Port ชนกัน:** หยุด container อื่นที่ใช้ port 3000, 8000, 5432, 6379

```bash
docker compose down
docker ps  # ดู container ที่รันอยู่
```

**Frontend build ช้า:** ลบ `node_modules` แล้วลง ใหม่
```bash
cd frontend && rm -rf node_modules .next && npm install
```

**Backend import error:** ตรวจว่า venv activate อยู่ และ requirements.txt ลงครบ

---

✨ **พร้อมเขียนโค้ดแล้ว — Good luck!**
