# RalphGuard: Deploy แบบ Free ด้วย Vercel + Render

ชุดนี้ใช้ Frontend บน Vercel Free และใช้ FastAPI Web Service + PostgreSQL บน Render Free โดยไม่สร้าง Background Worker หรือ Redis

## 1. Push ไฟล์ขึ้น GitHub

ตรวจสอบและ commit ไฟล์ deploy ใน repository ก่อน แล้ว push ไปที่ branch `main`

## 2. สร้างระบบฝั่ง Render

1. เข้า Render แล้วเลือก **New > Blueprint**
2. เชื่อม repository RalphGuard และเลือก branch `main`
3. Render จะอ่าน `render.yaml`
4. ใส่ค่าที่ระบบถาม:
   - `CORS_ORIGINS`: ใส่ `*` ชั่วคราวใน deploy แรก
   - `GROQ_API_KEY`: API key จริงจาก Groq ห้าม commit ลง Git
5. ตรวจสอบค่าใช้จ่ายที่ Render แสดงก่อนกด Apply
6. รอ API และ PostgreSQL ขึ้นครบ
7. ทดสอบ:
   - `https://<render-api>/health`
   - `https://<render-api>/health/ready`
   - `https://<render-api>/docs`

Blueprint กำหนด `plan: free` ทุก resource และรัน QSAR inference ภายใน FastAPI จากโมเดลที่บรรจุใน Docker image

## 3. สร้าง Frontend บน Vercel

1. Import repository RalphGuard เข้า Vercel
2. ตั้ง **Root Directory** เป็น `frontend`
3. ตั้ง Environment Variables:
   - `NEXT_PUBLIC_API_URL=https://<render-api>`
   - `NEXT_PUBLIC_APP_NAME=RalphGuard`
4. Deploy และเปิด URL ที่ Vercel สร้างให้

## 4. ล็อก CORS หลังทราบ URL จริง

กลับไป Render แล้วเปลี่ยน `CORS_ORIGINS` จาก `*` เป็น URL ของ Vercel เช่น:

```text
https://ralphguard.vercel.app
```

ถ้ามีหลายโดเมนให้คั่นด้วย comma แล้ว redeploy API

## 5. ตรวจระบบครบวงจร

1. เปิดหน้าเว็บ Vercel
2. สร้างหรือเปิดโปรเจกต์
3. เพิ่มสารและกดประเมิน
4. ตรวจว่า FastAPI ประมวลผลจนสถานะเสร็จ
5. ตรวจผลทั้ง 5 endpoint รวม Skin Dryness
6. ทดลอง AI Assistant

## หมายเหตุ

- Docker image บรรจุ 4 production models และ Skin Dryness candidate รุ่นปัจจุบันจาก `scientific/models`
- Database migration ทำตอน Container เริ่ม เพราะ Free Web Service ไม่รองรับ `preDeployCommand`
- โมเดล Groq เริ่มต้นคือ `openai/gpt-oss-120b`
- Free Web Service จะพักเมื่อไม่มี request และ request แรกหลังพักอาจใช้เวลาประมาณหนึ่งนาที
- Free PostgreSQL หมดอายุหลัง 30 วัน จึงเหมาะสำหรับ demo/testing
- งาน train, bulk import, evidence crawling และ continual learning ให้รันบนเครื่องพัฒนา ไม่รันบน Render
- ห้ามใส่ API key หรือรหัสผ่านจริงในไฟล์ repository
