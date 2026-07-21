"""Groq-backed, context-grounded chat endpoint for the RalphGuard assistant.

The API key stays in the backend environment. The frontend posts the current
formula/assessment context and previews every mutating action before execution.
"""
import json
import re

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter()

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

UNSUPPORTED_COMPOSITION = re.compile(
    r"\b(witch\s*hazel|hamamelis|aloe\s*vera|extract|leaf\s+juice|fragrance|parfum|essential\s+oil)\b",
    re.IGNORECASE,
)

# A small, verified action palette for correcting gentle water-based formulas.
# This is not the OCR/INCI registry; it only constrains substances the LLM is
# allowed to create autonomously in a fallback formula.
GENTLE_ACTION_SUBSTANCES = {
    "Water (Aqua)": "O",
    "Glycerin": "OCC(O)CO",
    "Panthenol": "OCC(C)(C)C(O)C(=O)NCCCO",
    "Betaine": "C[N+](C)(C)CC(=O)[O-]",
    "Allantoin": "NC(=O)NC1NC(=O)NC1=O",
    "Phenoxyethanol": "OCCOc1ccccc1",
}

# Reviewed UI fixture for demonstrating a sensitisation score above 50 with
# the currently bundled QSAR models. This is intentionally not a cosmetic
# formulation: at 65% the model yields sens ~=63.5 at peak and ~=52 on Day 3.
# Keeping it deterministic prevents the LLM from promising a target score from
# an arbitrary high-hazard ingredient used at a token concentration.
SENSITISATION_UI_TEST_FORMULA = [
    {"name": "Water (Aqua)", "smiles": "O", "concentration": 35.0},
    {
        "name": "Cinnamaldehyde",
        "smiles": "O=C/C=C/c1ccccc1",
        "concentration": 65.0,
    },
]


def _parse_actions(text: str) -> list[dict]:
    match = re.search(r"<action>([\s\S]*?)</action>", text, flags=re.IGNORECASE)
    if not match:
        return []
    try:
        actions = json.loads(match.group(1).strip())
    except (TypeError, ValueError):
        return []
    return [item for item in actions if isinstance(item, dict)] if isinstance(actions, list) else []


def _unsupported_action_ingredients(text: str) -> list[str]:
    """Find extract/mixture names the model attempted to create as molecules."""
    names: list[str] = []
    for action in _parse_actions(text):
        action_type = action.get("type")
        candidates: list[dict] = []
        if action_type in {"create_formula", "set_formula"}:
            candidates = [item for item in action.get("items", []) if isinstance(item, dict)]
        elif action_type == "add_substance":
            candidates = [action]
        elif action_type == "replace_substance":
            candidates = [{"name": action.get("to") or action.get("to_name")}]
        for candidate in candidates:
            name = str(candidate.get("name") or "").strip()
            if name and UNSUPPORTED_COMPOSITION.search(name) and name not in names:
                names.append(name)
    return names


def _gentle_toner_fallback(question: str) -> str | None:
    """Deterministic safe-to-execute fallback when the LLM ignores constraints."""
    if not re.search(r"(โทนเนอร์|toner)", question, flags=re.IGNORECASE):
        return None
    concentrations = {
        "Water (Aqua)": 89.9,
        "Glycerin": 5.0,
        "Panthenol": 2.0,
        "Betaine": 2.0,
        "Allantoin": 0.3,
        "Phenoxyethanol": 0.8,
    }
    items = [
        {"name": name, "smiles": smiles, "concentration": concentrations[name]}
        for name, smiles in GENTLE_ACTION_SUBSTANCES.items()
    ]
    actions: list[dict] = [
        {"type": "create_formula", "name": "โทนเนอร์สูตรตั้งต้นอ่อนโยน", "items": items}
    ]
    if re.search(r"\bnode\b|โหนด", question, flags=re.IGNORECASE):
        actions.append({"type": "goto", "tab": "nodes"})
    return (
        "จัดเป็นสูตรตั้งต้นสำหรับคัดกรองความเสี่ยงต่ำให้แล้วค่ะ มี Glycerin 5%, "
        "Panthenol 2%, Betaine 2%, Allantoin 0.3% และ Phenoxyethanol 0.8% "
        "โดยใช้น้ำเป็นเบส สูตรนี้ยังต้องกด Run เพื่อประเมินแบบ in-silico นะคะ\n"
        f"<action>{json.dumps(actions, ensure_ascii=False)}</action>"
    )


def _is_toner_creation_request(question: str) -> bool:
    return bool(
        re.search(r"(โทนเนอร์|toner)", question, flags=re.IGNORECASE)
        and re.search(r"(สร้าง|ทำให้|จัดให้|create|make|build)", question, flags=re.IGNORECASE)
    )


def _is_sensitisation_ui_test_request(question: str) -> bool:
    """Match an explicit high-sensitisation score request made for UI testing."""
    endpoint = re.search(
        r"(แพ้ผิว(?:หนัง)?|การแพ้ผิว(?:หนัง)?|skin\s*sensiti[sz]ation|sensiti[sz]ation)",
        question,
        flags=re.IGNORECASE,
    )
    test_intent = re.search(
        r"(ทดสอบ|ทดลอง|test|demo|แสดงผล|visual)",
        question,
        flags=re.IGNORECASE,
    )
    requested_scores = [int(value) for value in re.findall(r"(?<!\d)(\d{2,3})(?!\d)", question)]
    return bool(endpoint and test_intent and requested_scores and max(requested_scores) >= 50)


def _sensitisation_ui_test_fallback(question: str) -> str | None:
    """Return a reviewed test fixture instead of an LLM concentration guess."""
    if not _is_sensitisation_ui_test_request(question):
        return None
    actions = [
        {
            "type": "create_formula",
            "name": "TEST ONLY — แพ้ผิวหนัง 50+",
            "items": SENSITISATION_UI_TEST_FORMULA,
        }
    ]
    return (
        "สร้างสูตรจำลองสำหรับทดสอบการแสดงผลให้แล้วค่ะ สูตรนี้ใช้ Cinnamaldehyde 65% "
        "เพื่อให้โมเดลชุดปัจจุบันประเมินการแพ้ผิวหนังประมาณ 64 ที่จุดสูงสุด "
        "และประมาณ 52 ใน Day 3 หลังยืนยันการสร้างสูตร ให้ระบายพื้นที่ทดสอบแล้วกด Run "
        "เพื่อยืนยันผลจริง สูตรนี้มีความเข้มข้นที่ไม่ใช่สูตรเครื่องสำอางและห้ามผลิตหรือใช้กับผิวโดยเด็ดขาดค่ะ\n"
        f"<action>{json.dumps(actions, ensure_ascii=False)}</action>"
    )

SYSTEM_TH = """คุณคือ "แรลฟ์" (Ralph) เพื่อนร่วมทีมช่วยพัฒนาสูตรเครื่องสำอางในระบบ RalphGuard —
ระบบคัดกรองความเสี่ยงการระคายเคือง/ความเป็นพิษของสารเคมีด้วยแบบจำลอง QSAR (in-silico) เพื่อลดการทดลองในสัตว์

บุคลิก: เป็นกันเอง อบอุ่น พูดจาธรรมชาติเหมือนคนจริง ไม่แข็งทื่อ ไม่พูดซ้ำซาก ตอบกระชับตรงประเด็น
ภาษาไทยลงท้าย "ค่ะ/นะคะ" ได้ตามบริบท และปรับคำพูดให้หลากหลาย ไม่ท่องประโยคเดิมทุกครั้ง

สิ่งที่รู้ (หยิบมาใช้เมื่อเกี่ยวข้อง ไม่ต้องท่องทั้งหมด):
- ประเมิน 4 ด้าน: ระคายเคืองผิว, ระคายเคืองตา, แพ้ผิวหนัง, พิษเฉียบพลัน
- คะแนน 0–100 : ต่ำ(<25) กลาง(25–49) สูง(50–74) รุนแรง(≥75) · ระคายเคืองตาใช้กับรอบดวงตาเท่านั้น
- ปรับสูตรให้ปลอดภัยขึ้นได้จริง เช่น ลดความเข้มข้นตัวการ, เปลี่ยนสารที่อ่อนโยนกว่า, ตัดสารก่อระคาย/ก่อภูมิแพ้,
  ปรับ pH ให้ใกล้ผิว, เติมสารปลอบผิว (กลีเซอรีน, panthenol, allantoin)

หลักการ:
- อ้างเฉพาะตัวเลขในบริบทที่ให้มา ห้ามกุ · ถ้าผู้ใช้ถามถึง "ผล" แต่ยังไม่มีข้อมูล ค่อยชวนให้กด Run —
  แต่ถ้าเขา "สั่งให้สร้าง/ทำ" อะไร ให้ลงมือทำเลย ไม่ต้องพูดเรื่องยังไม่มีผลประเมิน
- เตือนว่าเป็นการคัดกรอง in-silico ไม่ทดแทนการทดสอบจริง เฉพาะตอนความเสี่ยงสูง/รุนแรง ไม่ต้องพูดทุกครั้ง
- ไม่วินิจฉัยทางการแพทย์ · เรื่องนอกขอบเขตบอกสั้นๆ ว่าถนัดเรื่องสูตร/ความปลอดภัย

ลงมือทำได้ (Agent): เมื่อผู้ใช้สั่งสร้าง/เพิ่ม/รัน/สลับหน้า ให้ทำจริงโดยแนบคำสั่งท้ายคำตอบในแท็ก
<action>[ ... ]</action> (ผู้ใช้จะไม่เห็น JSON นี้ — ให้ตอบเป็นภาษาคนตามปกติ ไม่ต้องอ่าน/อธิบาย JSON)
คำสั่งที่ใช้ได้: add_substance{name,smiles,concentration} · set_concentration{name,concentration} ·
remove_substance{name} · replace_substance{from,to,smiles,concentration?} · rename_formula{name} ·
set_formula{items} · create_formula{name,items} · goto{tab:"assess"|"nodes"|"trust"} · run · clear
- ปรับ/ลด/เพิ่มความเข้มข้นของสารที่ "มีอยู่แล้ว" ในสูตร → ใช้ set_concentration (ระบุ name ให้ตรงชื่อสารในสูตร)
  ห้ามใช้ add_substance ซ้ำ (จะกลายเป็นเพิ่มสารใหม่ ไม่ใช่ลดของเดิม) · ตัดสารออก → remove_substance
- "เปลี่ยนสาร X เป็น Y" → ใช้ replace_substance{from:"X",to:"Y",smiles:"<SMILES ของ Y>"} (from ให้ตรงชื่อสารเดิม)
- "ตั้งชื่อสูตร/เปลี่ยนชื่อสูตรเป็น ..." → ใช้ rename_formula{name:"..."} (เปลี่ยนชื่อสูตรที่เปิดอยู่)
- สำคัญมาก: ทำ "ทุกอย่าง" ที่ผู้ใช้สั่งในข้อความเดียวให้ครบ โดยแนบหลายคำสั่งใน <action>[...]</action> เดียว
  เช่นถ้าเขาบอก "ลด A, เปลี่ยน B เป็น C, เติม D, ตั้งชื่อสูตร E แล้ว Run" → ต้องมีครบทั้ง 5 คำสั่ง อย่าทำแค่บางอัน
- ถ้าเขาสั่ง "สร้างให้เลย/ทำให้หน่อย" → ใช้ <action> create_formula (ลงมือทำ)
- ถ้าเขาแค่ "ขอสูตร/แนะนำสูตร" ให้เขากดนำเข้าเอง → แนบ <formula>[{name,smiles,concentration}]</formula> (แสดงเป็นการ์ดให้กด Add)
ใส่ SMILES ที่ถูกต้องเสมอ
สำคัญ: ทุกสูตรต้องรวม ~100% w/w — ให้ใส่ "Water (Aqua)" SMILES "O" เป็นเบสเติมส่วนที่เหลือให้ครบเสมอ
(เช่น เซรั่มที่มี actives รวม 19% ให้ใส่ Water 81% ด้วย) ยกเว้นผลิตภัณฑ์ไม่มีน้ำ เช่น น้ำมัน/บาล์ม

ตัวอย่างการตอบที่ควรเป็น (ธรรมชาติ):
ผู้ใช้: สร้างเซรั่มผลัดเซลล์ AHA ให้หน่อย
แรลฟ์: จัดให้แล้วค่ะ เซรั่ม AHA ตัวนี้มี Glycolic Acid 5% กับ Niacinamide 4% ช่วยผลัดผิวพร้อมปลอบผิวไปด้วย กด Run ประเมินดูได้เลยนะคะ
<action>[{"type":"create_formula","name":"เซรั่มผลัดเซลล์ AHA","items":[{"name":"Water (Aqua)","smiles":"O","concentration":90},{"name":"Glycolic Acid","smiles":"OCC(=O)O","concentration":5},{"name":"Niacinamide","smiles":"O=C(N)c1cccnc1","concentration":4},{"name":"Phenoxyethanol","smiles":"OCCOc1ccccc1","concentration":1}]}]</action>

ผู้ใช้: อันไหนเสี่ยงสุด
แรลฟ์: ตัวที่ต้องระวังสุดคือระคายเคืองผิว 62 อยู่ระดับสูงเลยค่ะ ลองลดตัวที่เข้มข้นลงหน่อยน่าจะช่วยได้เยอะ

ผู้ใช้: ลด Ethanol ลงหน่อย ค่าระคายเคืองสูงไป
แรลฟ์: ได้เลยค่ะ ลด Ethanol จาก 50 เหลือ 20% แล้วเติม Glycerin ปลอบผิวอีกนิด กด Run ประเมินใหม่ดูนะคะ
<action>[{"type":"set_concentration","name":"Ethanol","concentration":20},{"type":"add_substance","name":"Glycerin","smiles":"OCC(O)CO","concentration":5}]</action>

ผู้ใช้: ลด Ethanol เหลือ 8% เปลี่ยน Cinnamaldehyde เป็น Vanillin ที่อ่อนโยนกว่า เติม Glycerin แล้วตั้งชื่อสูตรว่า "ผิวสุข" แล้ว Run
แรลฟ์: ปรับให้ครบแล้วค่ะ ลด Ethanol เหลือ 8% เปลี่ยนเป็น Vanillin ที่อ่อนโยนกว่า เติม Glycerin ปลอบผิว ตั้งชื่อสูตร "ผิวสุข" เรียบร้อย กำลัง Run ประเมินให้เลยนะคะ
<action>[{"type":"set_concentration","name":"Ethanol","concentration":8},{"type":"replace_substance","from":"Cinnamaldehyde","to":"Vanillin","smiles":"O=Cc1ccc(O)c(OC)c1","concentration":1},{"type":"add_substance","name":"Glycerin","smiles":"OCC(O)CO","concentration":5},{"type":"rename_formula","name":"ผิวสุข"},{"type":"run"}]</action>"""

# These constraints are kept separate from the conversational prompt so the
# chemistry boundary remains explicit and easy to test/review.
SCIENTIFIC_AGENT_GUARD = """

กฎวิทยาศาสตร์และคำสั่ง Agent ที่ต้องทำตาม:
- ห้ามรับรองสูตรว่า "ปลอดภัย" หรือ "ไม่อันตราย" ก่อนมีผลประเมิน ให้เรียกว่า
  "สูตรตั้งต้นสำหรับคัดกรองความเสี่ยงต่ำ" และย้ำว่าเป็นผล in-silico
- QSAR นี้รับสารที่มีโครงสร้างโมเลกุลชัดเจนเท่านั้น ห้ามแทนสารสกัดพืชหรือสารผสม
  เช่น Witch Hazel/Hamamelis extract ด้วย SMILES ของโมเลกุลตัวแทนเพียงตัวเดียว
- เมื่อสร้างสูตรอ่อนโยน ให้เลือกสารโครงสร้างชัดเจนก่อน เช่น
  Glycerin = OCC(O)CO, Panthenol = OCC(C)(C)C(O)C(=O)NCCCO,
  Allantoin = NC(=O)NC1NC(=O)NC1=O, Betaine = C[N+](C)(C)CC(=O)[O-]
- ถ้าผู้ใช้ขอ "node" หรือ "node graph" ให้ส่ง create_formula แล้วตามด้วย
  {"type":"goto","tab":"nodes"} ใน action ชุดเดียวกัน
- ถ้าผลมี confidence ต่ำหรือ out-of-domain ห้ามสรุปว่าคะแนนสูงนั้นคือความรุนแรงจริง
  ให้บอกก่อนว่าผลไม่น่าเชื่อถือและควรตรวจ structure/coverage หรือใช้วิธี fallback
- คะแนนสูตรคำนวณแบบถ่วงความเข้มข้น ดังนั้นสารที่ได้คะแนนรายสารสูงแต่ใส่เพียง 5%
  มักเพิ่มคะแนนสูตรได้เพียงประมาณ 5 คะแนน ห้ามอ้างว่าสูตรจะถึงคะแนนเป้าหมายจากชื่อสารอย่างเดียว
- ถ้าผู้ใช้ระบุคะแนนเป้าหมาย ห้ามรับรองว่าถึงเป้าหมายก่อน Run ต้องเรียกว่า "ออกแบบเพื่อทดสอบ"
  และให้ผลจาก assessment engine เป็นตัวยืนยัน ห้ามเสนอสูตรอันตรายเป็นผลิตภัณฑ์ใช้งานจริง
"""


class ChatIn(BaseModel):
    question: str
    context: str | None = None


class ChatOut(BaseModel):
    answer: str


@router.post("/", response_model=ChatOut)
async def chat(body: ChatIn):
    question = (body.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="empty question")

    # High-frequency demo intent: use a reviewed template rather than allowing
    # stochastic LLM output to invent extracts, omit preservation, or drift in
    # concentration on every request.
    if _is_toner_creation_request(question):
        return ChatOut(answer=_gentle_toner_fallback(question) or "")

    sensitisation_fixture = _sensitisation_ui_test_fallback(question)
    if sensitisation_fixture:
        return ChatOut(answer=sensitisation_fixture)

    if not settings.GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY not configured")

    prompt = question
    if body.context:
        prompt = f"ข้อมูลผลประเมินปัจจุบัน:\n{body.context}\n\nคำถาม: {question}"

    payload = {
        "model": settings.GROQ_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_TH + SCIENTIFIC_AGENT_GUARD},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.6,
        "top_p": 0.95,
        "max_tokens": 800,
    }

    text = ""
    invalid_names: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            for attempt in range(2):
                r = await client.post(
                    GROQ_URL,
                    headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                    json=payload,
                )
                if r.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"LLM error {r.status_code}: {r.text[:300]}")
                data = r.json()
                try:
                    text = data["choices"][0]["message"]["content"].strip()
                except (KeyError, IndexError):
                    text = ""
                if not text:
                    raise HTTPException(status_code=502, detail="LLM returned empty response")

                invalid_names = _unsupported_action_ingredients(text)
                if not invalid_names:
                    break
                if attempt == 0:
                    allowed = ", ".join(GENTLE_ACTION_SUBSTANCES)
                    payload["messages"].extend(
                        [
                            {"role": "assistant", "content": text},
                            {
                                "role": "user",
                                "content": (
                                    "คำตอบก่อนหน้าถูกระบบปฏิเสธ เพราะพยายามแทนสารสกัด/สารผสมด้วย SMILES เดี่ยว: "
                                    f"{', '.join(invalid_names)} กรุณาตอบใหม่และสร้าง action ใหม่โดยไม่กล่าวถึงหรือใช้สารเหล่านั้น "
                                    f"สำหรับสูตรอ่อนโยนให้เลือกจากรายการที่ตรวจสอบแล้วนี้เท่านั้น: {allowed}"
                                ),
                            },
                        ]
                    )
    except HTTPException:
        raise
    except Exception as e:  # network / DNS / timeout
        raise HTTPException(status_code=502, detail=f"LLM call failed: {e}")

    # A model can ignore the corrective turn. Toner creation still has a
    # deterministic, registry-backed path so the user never receives an action
    # that is guaranteed to fail only after confirmation.
    if invalid_names:
        fallback = _gentle_toner_fallback(question)
        if fallback:
            text = fallback
        else:
            text = re.sub(r"<action>[\s\S]*?</action>", "", text, flags=re.IGNORECASE).strip()
            text += "\n\nยังไม่เปลี่ยน workspace เพราะสูตรมีสารสกัดที่ไม่มีโครงสร้างโมเลกุลเดี่ยว กรุณาเลือกสารที่มีโครงสร้างยืนยันแล้วค่ะ"
    return ChatOut(answer=text)
