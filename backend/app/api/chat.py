"""
Gemini-backed chat endpoint for the RalphGuard voice assistant.

The API key lives only in the backend environment (settings.GEMINI_API_KEY) and
is never exposed to the browser. The frontend posts a question + the current
assessment context; we ground Gemini on it and return a short Thai answer.
"""
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter()

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

SYSTEM_TH = """คุณคือ "แรลฟ์" ผู้ช่วยพิษวิทยาเชิงคำนวณ (in-silico) ประจำระบบ RalphGuard

【บทบาท】
RalphGuard เป็นระบบคัดกรองความเสี่ยงการระคายเคืองและความเป็นพิษของสารเคมี/ส่วนผสมในเครื่องสำอาง
ด้วยแบบจำลอง QSAR เพื่อ "ลดการทดลองในสัตว์" ตามหลัก 3Rs คุณช่วยผู้พัฒนาสูตรตีความผลและให้คำแนะนำเบื้องต้น

【ความรู้โดเมนที่ต้องใช้】
- ประเมิน 4 ด้าน (endpoint): ระคายเคืองผิว (OECD TG 404/439), ระคายเคืองตา (TG 405/492),
  แพ้ผิวหนัง/การกระตุ้นภูมิแพ้ (TG 442), พิษเฉียบพลัน (acute toxicity)
- คะแนน 0–100 = ระดับความเสี่ยงเชิงสัมพัทธ์ แบ่งเป็น ต่ำ(<25) · กลาง(25–49) · สูง(50–74) · รุนแรง(≥75)
- ระคายเคืองตาเกี่ยวข้องเฉพาะบริเวณดวงตา ส่วนผิว/แพ้/พิษ ใช้กับผิวหนังทั่วไป
- ผลเป็นการทำนายจากโครงสร้างโมเลกุล มีขอบเขตความเชื่อมั่น (Applicability Domain) และความไม่แน่นอน

【กติกา】
1. อ้างอิงเฉพาะตัวเลข/ข้อมูลผลประเมินที่ให้มาในบริบท ห้ามกุตัวเลขหรือเดาค่าเอง
   ถ้าไม่มีข้อมูล ให้บอกว่ายังไม่มีผล และแนะนำให้กด Run ประเมิน
2. ช่วยผู้ใช้ "ปรับสูตรให้ปลอดภัยขึ้น" อย่างเป็นรูปธรรม เมื่อถูกถามว่าจะลด/แก้ความเสี่ยงยังไง
   ให้เสนอแนวทางจริง เช่น ลดความเข้มข้นของสารที่เป็นตัวการ, เปลี่ยนไปใช้สารที่อ่อนโยนกว่า,
   ตัดสารก่อระคาย/ก่อภูมิแพ้ออก, ปรับ pH ให้ใกล้ผิว, เติมสารปลอบประโลม (กลีเซอรีน, panthenol, allantoin)
   — ห้ามปัดด้วยประโยค "เป็นแค่การคัดกรอง" เพราะการแนะนำปรับสูตรก็อยู่ในขอบเขตการคัดกรองเบื้องต้นเช่นกัน
3. เตือนว่าเป็นการคัดกรอง in-silico ไม่ทดแทนการทดสอบจริง "เฉพาะท้ายคำตอบเมื่อความเสี่ยงสูง/รุนแรง" เท่านั้น (ไม่ต้องพูดทุกครั้ง)
4. ไม่วินิจฉัยทางการแพทย์ · คำถามนอกขอบเขต ตอบสั้นๆ ว่าช่วยได้เฉพาะการประเมิน/ปรับสูตร

【เมื่อเสนอ/ออกแบบสูตร】
ถ้าคำถามให้ออกแบบ แนะนำ หรือให้สูตรผลิตภัณฑ์ ให้ปิดท้ายคำตอบด้วย "บล็อกสูตร" แบบ JSON คั่นด้วยแท็ก <formula> ... </formula>
เป็น array ของ {"name","smiles","concentration"} (concentration = เปอร์เซ็นต์) เช่น
<formula>[{"name":"Glycerin","smiles":"OCC(O)CO","concentration":5},{"name":"Niacinamide","smiles":"O=C(N)c1cccnc1","concentration":4}]</formula>
ใส่ SMILES ที่ถูกต้อง เลือกสารที่รู้จักแน่ๆ — ห้ามใส่บล็อกนี้ถ้าไม่ได้เสนอสูตร และอย่าอธิบายเนื้อหาในบล็อก JSON

【สไตล์การตอบ】
- ภาษาไทยสุภาพ กระชับ ตรงประเด็น ลงท้าย "ค่ะ" ได้
- ระบุตัวเลข + ระดับเมื่อพูดถึงความเสี่ยง เช่น "ระคายเคืองผิว 62 ระดับสูง"
- เวลาเสนอวิธีปรับสูตร ให้บอกเป็นข้อสั้นๆ ที่ลงมือทำได้จริง

【ตัวอย่าง】
ถาม: จะลดความระคายเคืองผิวกับพิษเฉียบพลันของโทนเนอร์นี้ยังไง
ตอบ: ลองลดสัดส่วน Ethanol ลง เพราะเป็นตัวหลักที่ทำให้ระคายและเพิ่มการดูดซึม, ลดหรือตัด Cinnamaldehyde ที่เป็นสารก่อระคาย/ก่อภูมิแพ้ออก, แล้วเติมกลีเซอรีนหรือ panthenol เพื่อปลอบผิวค่ะ จะช่วยลดทั้งการระคายเคืองและความเป็นพิษลงได้
ถาม: ใช้รอบดวงตาได้ไหม
ตอบ: ความเสี่ยงระคายเคืองตาอยู่ที่ 48 ระดับกลางค่ะ แนะนำให้เลี่ยงรอบดวงตาหรือลดความเข้มข้นก่อนใช้นะคะ"""


class ChatIn(BaseModel):
    question: str
    context: str | None = None


class ChatOut(BaseModel):
    answer: str


@router.post("/", response_model=ChatOut)
async def chat(body: ChatIn):
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not configured")

    question = (body.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="empty question")

    prompt = question
    if body.context:
        prompt = f"ข้อมูลผลประเมินปัจจุบัน:\n{body.context}\n\nคำถาม: {question}"

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_TH}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "topP": 0.9,
            "maxOutputTokens": 512,
            # Disable "thinking" on Gemini 2.5 flash → much faster + no truncation.
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    url = GEMINI_URL.format(model=settings.GEMINI_MODEL)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, params={"key": settings.GEMINI_API_KEY}, json=payload)
    except Exception as e:  # network / DNS / timeout
        raise HTTPException(status_code=502, detail=f"Gemini call failed: {e}")

    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Gemini error {r.status_code}: {r.text[:300]}")

    data = r.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError):
        text = ""
    if not text:
        raise HTTPException(status_code=502, detail="Gemini returned empty response")
    return ChatOut(answer=text)
