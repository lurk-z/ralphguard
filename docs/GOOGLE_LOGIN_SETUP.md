# คู่มือตั้งค่า Google Login สำหรับ RalphGuard

RalphGuard ใช้ Google OAuth ผ่าน NextAuth โดย Frontend ออก token อายุสั้นให้ Backend ตรวจสอบ โปรเจกต์และผลประเมินจึงถูกแยกตามบัญชีผู้ใช้

## 1. สร้าง Secret กลาง

เปิด PowerShell แล้วรัน:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

เก็บค่าที่ได้ไว้ใช้เป็นทั้ง `NEXTAUTH_SECRET` และ `AUTH_SECRET` ห้าม commit ค่านี้ลง Git

## 2. ตั้งค่า Google Cloud

1. เปิด Google Cloud Console และเลือกหรือสร้าง Project
2. ตั้งค่า **OAuth consent screen**
3. ไปที่ **Credentials > Create Credentials > OAuth client ID**
4. เลือก Application type เป็น **Web application**
5. เพิ่ม Authorized JavaScript origins:

```text
http://localhost:3000
https://<โดเมน-vercel>
```

6. เพิ่ม Authorized redirect URIs:

```text
http://localhost:3000/api/auth/callback/google
https://<โดเมน-vercel>/api/auth/callback/google
```

7. คัดลอก Client ID และ Client Secret

ถ้า OAuth consent screen ยังอยู่สถานะ **Testing** ให้เพิ่มอีเมล Google ที่จะใช้ทดสอบในเมนู **Audience > Test users** ด้วย ไม่เช่นนั้นบัญชีที่ไม่ได้เพิ่มอาจเข้าสู่ระบบไม่ได้

## ใส่ Google credentials ตรงไหน

ค่าจาก Google Cloud จะมีลักษณะดังนี้:

- Client ID มักลงท้ายด้วย `.apps.googleusercontent.com`
- Client Secret เป็นรหัสลับ ห้ามส่งให้ผู้อื่นหรือ commit ลง Git

### บนเครื่อง

เปิด `frontend/.env.local` แล้วใส่ค่าหลังเครื่องหมาย `=` โดยไม่ต้องใส่ `< >` และไม่ต้องใส่เครื่องหมายคำพูด:

```env
GOOGLE_CLIENT_ID=123456789-example.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=ใส่-client-secret-จริงตรงนี้
```

บันทึกไฟล์แล้วหยุดและเปิด `npm run dev` ใหม่

### บน Vercel

1. เปิด Vercel Project ของ RalphGuard
2. ไปที่ **Settings > Environment Variables**
3. เพิ่ม Key `GOOGLE_CLIENT_ID` และวาง Client ID ในช่อง Value
4. เพิ่ม Key `GOOGLE_CLIENT_SECRET` และวาง Client Secret ในช่อง Value
5. เลือก Environment อย่างน้อย **Production**
6. กด Save แล้วไปที่ **Deployments > Redeploy**

ห้ามรวม Key และ Value ไว้ในช่องเดียว เช่น `GOOGLE_CLIENT_ID=...` ต้องแยก Key กับ Value ตามช่องของ Vercel

## 3. ตั้งค่าบนเครื่องสำหรับทดสอบ

เพิ่มในไฟล์ `.env` ที่ root ของโปรเจกต์สำหรับ Backend:

```env
AUTH_SECRET=<secret-กลาง>
```

สร้างไฟล์ `frontend/.env.local` สำหรับ Frontend:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<secret-กลาง>
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>
```

ค่า `AUTH_SECRET` และ `NEXTAUTH_SECRET` ต้องตรงกันทุกตัวอักษร

## 4. รันบนเครื่อง

เริ่ม Backend:

```powershell
docker compose up -d backend postgres redis
```

เริ่ม Frontend:

```powershell
cd frontend
npm run dev
```

เปิด:

```text
http://localhost:3000/login
```

เมื่อเข้าสู่ระบบสำเร็จ ระบบจะส่งไปหน้า `/projects`

## 5. ตั้งค่าบน Render

เพิ่ม Environment Variables ในบริการ `ralphguard-api`:

```env
AUTH_SECRET=<secret-กลาง>
CORS_ORIGINS=https://<โดเมน-vercel>
```

จากนั้นกด **Save Changes** และ Redeploy Backend การเริ่ม Container จะรัน Database migration เพื่อเพิ่มเจ้าของให้ตาราง Project และ Assessment

## 6. ตั้งค่าบน Vercel

ไปที่ **Project Settings > Environment Variables** แล้วเพิ่ม:

```env
NEXT_PUBLIC_API_URL=https://<render-api>.onrender.com
NEXT_PUBLIC_APP_NAME=RalphGuard
NEXTAUTH_URL=https://<โดเมน-vercel>
NEXTAUTH_SECRET=<secret-กลาง>
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>
```

เลือก Production และ Preview ตามที่ต้องการ แล้ว Redeploy Frontend

## 7. ตรวจสอบหลัง Deploy

1. เปิด `https://<โดเมน-vercel>/login`
2. กด **เข้าสู่ระบบด้วย Google**
3. สร้างโปรเจกต์และทดลองประเมินสูตร
4. ออกจากระบบแล้วเข้าสู่บัญชี Google อื่น
5. ตรวจว่าบัญชีใหม่ไม่เห็นโปรเจกต์ของบัญชีแรก

## การแก้ปัญหาที่พบบ่อย

### Error 400: redirect_uri_mismatch

ตรวจว่า Redirect URI ใน Google Cloud ตรงกับโดเมนจริงทุกตัวอักษร:

```text
https://<โดเมน-vercel>/api/auth/callback/google
```

### Configuration หรือ Server error หลัง Login

ตรวจว่า Vercel มี `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` และ `NEXTAUTH_URL` ครบ แล้ว Redeploy

### Backend ตอบ 401

ตรวจว่า `AUTH_SECRET` บน Render ตรงกับ `NEXTAUTH_SECRET` บน Vercel แล้ว Redeploy ทั้งสองฝั่ง

### โปรเจกต์เก่าไม่แสดง

ข้อมูลที่สร้างก่อนมีระบบผู้ใช้ยังไม่มี `owner_id` ระบบจึงซ่อนไว้เพื่อไม่ให้ข้อมูลเดิมหลุดไปยังบัญชีใดโดยอัตโนมัติ

## ตรวจ Production ครบในคำสั่งเดียว

หลังตั้งค่าและ Redeploy ทั้ง Vercel กับ Render แล้ว ให้รันจาก root ของโปรเจกต์:

```powershell
.\scripts\verify_deployment.ps1 `
  -FrontendUrl "https://ralphguard.vercel.app" `
  -BackendUrl "https://ralphguard-api.onrender.com" `
  -AuthSecret "<ค่าเดียวกับ NEXTAUTH_SECRET บน Vercel>"
```

คำสั่งนี้ตรวจ Backend, Database schema, CORS, Auth/AI configuration, Google provider, ไฟล์โมเดล 3D, QSAR metrics, คลังสาร, สมุนไพรไทย, เรียก AI จริงหนึ่งครั้ง และ Projects API ที่มี token หากมีข้อใดไม่พร้อมจะคืน exit code 1 ทันที โดยจะไม่แสดง secret หรือ token ในผลลัพธ์

หากพบ `AUTH_SECRET not configured` ให้เปิด **Render > ralphguard-api > Environment** เพิ่ม `AUTH_SECRET` โดยใช้ค่าเดียวกับ `NEXTAUTH_SECRET` บน Vercel แล้วกด **Save and Deploy**

## ข้อควรระวัง

- ห้ามใส่ Secret จริงในไฟล์ที่ commit ขึ้น GitHub
- เปลี่ยน Secret จะทำให้ session เดิมและ backend token เดิมใช้งานไม่ได้ ผู้ใช้ต้อง Login ใหม่
- Preview URL แต่ละอันต้องเพิ่ม Redirect URI ใน Google Cloud หากต้องการทดสอบ Google Login บน Preview
