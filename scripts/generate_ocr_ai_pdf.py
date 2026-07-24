"""Generate the Thai OCR and AI Assistant development summary PDF."""
from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "RalphGuard_OCR_AI_Assistant_Development.pdf"

TEAL = colors.HexColor("#00A6A6")
TEAL_DARK = colors.HexColor("#087878")
NAVY = colors.HexColor("#102A43")
SLATE = colors.HexColor("#52667A")
PALE = colors.HexColor("#ECFBFA")
PALE_BLUE = colors.HexColor("#F3F7FB")
ORANGE = colors.HexColor("#F59E0B")
RED = colors.HexColor("#DC4C4C")
WHITE = colors.white


def register_fonts() -> tuple[str, str]:
    candidates = [
        (Path(r"C:\Windows\Fonts\tahoma.ttf"), Path(r"C:\Windows\Fonts\tahomabd.ttf")),
        (Path(r"C:\Windows\Fonts\leelawad.ttf"), Path(r"C:\Windows\Fonts\leelawdb.ttf")),
        (Path(r"C:\Windows\Fonts\LeelawUI.ttf"), Path(r"C:\Windows\Fonts\LeelUIsl.ttf")),
    ]
    for regular, bold in candidates:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont("RGThai", str(regular)))
            pdfmetrics.registerFont(TTFont("RGThaiBold", str(bold)))
            return "RGThai", "RGThaiBold"
    raise FileNotFoundError("A Thai TTF font was not found in C:/Windows/Fonts")


REGULAR, BOLD = register_fonts()


class RalphGuardDoc(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=17 * mm,
            rightMargin=17 * mm,
            topMargin=19 * mm,
            bottomMargin=17 * mm,
            title="การพัฒนา OCR และ AI Assistant ของ RalphGuard",
            author="RalphGuard Development Team",
            subject="OCR and AI Assistant development summary",
        )
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="normal",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates(PageTemplate(id="all", frames=[frame], onPage=self.decorate))

    def decorate(self, canvas, doc):
        canvas.saveState()
        if doc.page > 1:
            canvas.setFillColor(TEAL)
            canvas.rect(0, A4[1] - 4 * mm, A4[0], 4 * mm, fill=1, stroke=0)
            canvas.setFont(BOLD, 8)
            canvas.setFillColor(NAVY)
            canvas.drawString(17 * mm, 9 * mm, "RalphGuard | OCR and AI Assistant")
            canvas.setFont(REGULAR, 8)
            canvas.setFillColor(SLATE)
            canvas.drawRightString(A4[0] - 17 * mm, 9 * mm, f"หน้า {doc.page}")
        canvas.restoreState()


styles = getSampleStyleSheet()
TITLE = ParagraphStyle(
    "TitleThai", fontName=BOLD, fontSize=28, leading=36, textColor=WHITE,
    alignment=TA_LEFT, spaceAfter=4 * mm,
)
SUBTITLE = ParagraphStyle(
    "SubtitleThai", fontName=REGULAR, fontSize=12, leading=19, textColor=colors.HexColor("#DFF8F7"),
)
H1 = ParagraphStyle(
    "H1Thai", fontName=BOLD, fontSize=20, leading=26, textColor=NAVY,
    spaceBefore=2 * mm, spaceAfter=4 * mm,
)
H2 = ParagraphStyle(
    "H2Thai", fontName=BOLD, fontSize=13, leading=18, textColor=TEAL_DARK,
    spaceBefore=2.5 * mm, spaceAfter=2 * mm,
)
BODY = ParagraphStyle(
    "BodyThai", fontName=REGULAR, fontSize=9.3, leading=14.4, textColor=NAVY,
    spaceAfter=2.2 * mm,
)
SMALL = ParagraphStyle(
    "SmallThai", fontName=REGULAR, fontSize=8, leading=12, textColor=SLATE,
)
BULLET = ParagraphStyle(
    "BulletThai", parent=BODY, leftIndent=5 * mm, firstLineIndent=-3.2 * mm,
    bulletIndent=0, spaceAfter=1.2 * mm,
)
CARD_TITLE = ParagraphStyle(
    "CardTitle", fontName=BOLD, fontSize=10, leading=14, textColor=TEAL_DARK,
    spaceAfter=1 * mm,
)
CARD_BODY = ParagraphStyle(
    "CardBody", fontName=REGULAR, fontSize=8.2, leading=12, textColor=NAVY,
)
CENTER = ParagraphStyle(
    "CenterThai", fontName=BOLD, fontSize=9, leading=12, textColor=NAVY,
    alignment=TA_CENTER,
)


def p(text: str, style=BODY) -> Paragraph:
    return Paragraph(text, style)


def bullet(text: str) -> Paragraph:
    return Paragraph(f"- {text}", BULLET)


def section(title: str) -> Paragraph:
    return p(title, H1)


def pill(text: str, color=TEAL) -> Table:
    pill_text = ParagraphStyle(
        "PillThai", parent=CENTER, textColor=WHITE, fontSize=8.5,
    )
    table = Table([[p(text, pill_text)]], colWidths=[42 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.Color(color.red, color.green, color.blue, alpha=0.10)),
        ("BOX", (0, 0), (-1, -1), 0.7, color),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return table


def callout(title: str, text: str, color=TEAL) -> Table:
    content = [p(title, CARD_TITLE), p(text, CARD_BODY)]
    table = Table([[content]], colWidths=[171 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.Color(color.red, color.green, color.blue, alpha=0.07)),
        ("LINEBEFORE", (0, 0), (0, -1), 3, color),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D8E4EA")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def flow_row(labels: list[str]) -> Table:
    cells = []
    widths = []
    for index, label in enumerate(labels):
        cells.append(p(label, CENTER))
        widths.append(27 * mm)
        if index < len(labels) - 1:
            cells.append(p("→", CENTER))
            widths.append(7 * mm)
    table = Table([cells], colWidths=widths, hAlign="CENTER")
    style = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]
    for index in range(0, len(cells), 2):
        style.extend([
            ("BACKGROUND", (index, 0), (index, 0), PALE),
            ("BOX", (index, 0), (index, 0), 0.7, TEAL),
        ])
    table.setStyle(TableStyle(style))
    return table


def table_from_rows(headers: list[str], rows: list[list[str]], widths: list[float]) -> Table:
    data = [[p(value, ParagraphStyle("th", parent=CARD_TITLE, textColor=WHITE)) for value in headers]]
    data += [[p(value, CARD_BODY) for value in row] for row in rows]
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL_DARK),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PALE_BLUE]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CEDAE3")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def build_story():
    story = []

    cover = Table([
        [p("RALPHGUARD", ParagraphStyle("Brand", parent=H1, textColor=colors.HexColor("#BFF7F3"), fontSize=12))],
        [Spacer(1, 18 * mm)],
        [p("การพัฒนา OCR<br/>และ AI Assistant", TITLE)],
        [p("สรุปสถาปัตยกรรม กระบวนการตรวจสอบ และแนวทางใช้งานอย่างรับผิดชอบ", SUBTITLE)],
        [Spacer(1, 35 * mm)],
        [Table([[pill("OCR หลายรอบ"), pill("ทะเบียนสาร 1,336 รายการ"), pill("AI พร้อมเสียง", ORANGE)]], colWidths=[54 * mm] * 3)],
        [Spacer(1, 18 * mm)],
        [p("เอกสารฉบับพัฒนา | 24 กรกฎาคม 2026", ParagraphStyle("CoverDate", parent=SUBTITLE, fontSize=9))],
    ], colWidths=[176 * mm])
    cover.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("BOX", (0, 0), (-1, -1), 0, NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 14 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 8 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8 * mm),
    ]))
    story += [cover, PageBreak()]

    story += [section("ภาพรวมระบบ"), p(
        "RalphGuard แยกปัญหา <b>การรู้จักส่วนผสม</b> ออกจาก <b>การทำนายพิษ</b> "
        "ชื่อที่อ่านได้ทุกตัวต้องคงอยู่ในผลลัพธ์ แม้ไม่มีโครงสร้างโมเลกุลเดี่ยวหรือยังไม่เหมาะกับ QSAR"
    ), Spacer(1, 3 * mm), flow_row(["ภาพฉลาก", "OCR + consensus", "Entity linking", "QSAR / fallback", "ผลโปร่งใส"]), Spacer(1, 6 * mm)]

    overview_rows = [
        ["OCR", "แปลงฉลากเป็นรายชื่อ INCI ด้วย 3 image variants x 3 PSM และ consensus"],
        ["Ingredient registry", "เชื่อมชื่อ, synonym, CAS, PubChem CID, SMILES และ InChIKey พร้อม provenance"],
        ["QSAR gate", "รับเฉพาะโครงสร้างโมเลกุลที่ตรวจแล้วและ qsar_eligible=true"],
        ["AI Assistant", "ตอบจากบริบทสูตร/ผลปัจจุบัน พร้อม action schema และ preview-confirm"],
        ["Speech", "รับเสียงด้วย Web Speech API และตอบด้วย Edge Neural TTS พร้อม browser fallback"],
    ]
    story += [table_from_rows(["ส่วน", "หน้าที่"], overview_rows, [38 * mm, 133 * mm]), Spacer(1, 5 * mm)]
    story += [callout(
        "หลักการสำคัญ",
        "ระบบห้ามสร้าง SMILES หรือ toxicity label ขึ้นเอง และห้ามทำส่วนผสมที่ประเมินไม่ได้หายไป "
        "สารทุกตัวต้องแสดงสถานะ recognized, resolved, qsar_eligible, assessment method และเหตุผลเมื่อ unresolved.",
        ORANGE,
    ), Spacer(1, 6 * mm)]
    story += [p("ผลลัพธ์ในเวอร์ชันนี้", H2)]
    story += [bullet("ทะเบียนสาร offline seed 1,336 รายการ: เข้า QSAR 1,329 และรู้จักแต่ไม่เข้า QSAR 7 รายการ"),
              bullet("หน้าประเมินและ Node graph ดึง registry แบบแบ่งหน้า แทนการหยุดอยู่ที่คลังคงที่ 53 สาร"),
              bullet("เครื่อง Clone ใหม่สร้างข้อมูลชุดเดียวกันผ่าน Alembic migration โดยไม่พึ่ง Docker volume เครื่องเดิม"),
              PageBreak()]

    story += [section("OCR: จากภาพฉลากสู่รายชื่อส่วนผสม"), p("กระบวนการออกแบบให้ตรวจสอบซ้ำได้และลด false positive จากภาพที่มีแสง เงา ความโค้ง หรือ comma หาย"), Spacer(1, 2 * mm)]
    ocr_rows = [
        ["1. Validate", "ตรวจชนิดไฟล์ ขนาด จำนวนพิกเซล และหมุนตาม EXIF"],
        ["2. Deskew", "ทดลองมุม -6 ถึง +6 องศา ช่วง 0.5 องศา เลือกแนวข้อความดีที่สุด"],
        ["3. Normalize", "grayscale และปรับความกว้างเป้าหมายประมาณ 2,200 px จำกัด upscale 4 เท่า"],
        ["4. Variants", "Autocontrast, sharpened และ binary Otsu"],
        ["5. OCR passes", "Tesseract PSM 4, 6, 11 รวมสูงสุด 9 รอบ พร้อม timeout ต่อรอบ"],
        ["6. Consensus", "ให้คะแนนผล อ่านซ้ำระดับชื่อเต็ม และบังคับ approximate match ให้มีอย่างน้อย 2 votes"],
    ]
    story += [table_from_rows(["ขั้นตอน", "การทำงาน"], ocr_rows, [35 * mm, 136 * mm]), Spacer(1, 5 * mm)]
    story += [p("การเชื่อมชื่ออย่างระมัดระวัง", H2),
              bullet("ตัดข้อความหลัง Ingredients จนถึง section boundary เช่น warning, address, lot และ marketing"),
              bullet("รองรับช่องว่าง/comma หายด้วย phrase recovery แต่เปรียบเทียบชื่อ INCI เต็ม ไม่จับคำทั่วไปเดี่ยว ๆ"),
              bullet("threshold ของ fuzzy matching เปลี่ยนตามความยาวชื่อ สารชื่อสั้นต้องเข้มงวดกว่า"),
              bullet("raw PubChem candidate ไม่ถูกส่งเข้า QSAR อัตโนมัติ ต้องผ่าน verification และ structure checks ก่อน"),
              Spacer(1, 4 * mm),
              callout("OCR confidence แปลว่าอะไร", "เป็นตัวชี้วัดคุณภาพการอ่านข้อความ ไม่ใช่ความน่าจะเป็นว่ารายชื่อทุกตัวถูกต้อง ผู้ใช้ต้องตรวจรายชื่อและความเข้มข้นก่อนยืนยัน", RED),
              PageBreak()]

    story += [section("Ingredient recognition ไม่เท่ากับ QSAR eligibility"), p(
        "หลัง OCR ระบบจัดสถานะสารเป็นลำดับ แทนการกรองรายการไม่มี SMILES ทิ้งก่อนแสดงผล"
    ), Spacer(1, 3 * mm), flow_row(["Recognized", "Resolved", "Structure valid", "QSAR eligible", "Assessment"]), Spacer(1, 6 * mm)]
    state_rows = [
        ["Single substance", "อาจเข้า QSAR", "ต้องมี canonical SMILES ที่ผ่าน RDKit และ provenance"],
        ["Salt / inorganic", "พิจารณาเป็นรายกรณี", "ต้องสอดคล้องกับขอบเขต descriptor และโมเดล"],
        ["Polymer / silicone", "มักไม่เข้า", "ใช้ knowledge base หรือแสดงข้อจำกัด"],
        ["Botanical / mixture / fragrance", "ไม่แทนด้วยโมเลกุลเดียว", "ใช้ fallback, read-across หรือ unresolved"],
        ["Unknown composition", "ไม่เข้า", "คงชื่อและเหตุผลไว้ใน formula coverage"],
    ]
    story += [table_from_rows(["ประเภท", "QSAR", "หลักปฏิบัติ"], state_rows, [43 * mm, 35 * mm, 93 * mm]), Spacer(1, 5 * mm)]
    story += [p("ข้อมูลที่ส่งกลับเพื่อความโปร่งใส", H2),
              bullet("raw OCR text, parsed/normalized ingredient, match candidates และ match confidence"),
              bullet("structure availability, QSAR eligibility, assessment method และ unresolved reason"),
              bullet("summary: total, recognized, structure-resolved, QSAR-assessable, knowledge-base-assessed, unresolved และ coverage"),
              Spacer(1, 3 * mm),
              callout("บทบาทของ PubChem", "PubChem ช่วยยืนยัน identity, synonym และ structure แต่ไม่ใช่ toxicity training label โดยอัตโนมัติ ข้อมูลที่นำเข้า offline ต้องผ่านตัวกรองและ verification ก่อน", ORANGE),
              PageBreak()]

    story += [section("AI Assistant: รับคำสั่ง ตอบ และแก้ workspace อย่างควบคุม"), flow_row(["เสียง/ข้อความ", "Context", "Groq", "Guardrails", "Preview + Confirm"]), Spacer(1, 6 * mm)]
    ai_rows = [
        ["Input", "ข้อความหรือ Web Speech API เมื่อเบราว์เซอร์รองรับ"],
        ["Grounding", "ชื่อสูตร ส่วนผสม ความเข้มข้น คะแนน 4 ด้าน confidence, domain และ coverage"],
        ["Generation", "Groq OpenAI-compatible Chat Completions; API key อยู่ฝั่ง Backend"],
        ["Actions", "schema จำกัด: create/set/replace/remove/rename/goto/run/clear"],
        ["Mutation safety", "Frontend แสดงรายการเปลี่ยนแปลงและรอการยืนยันก่อนแก้ workspace"],
        ["Voice output", "Edge Neural TTS ภาษาไทย; browser speechSynthesis เป็น fallback"],
    ]
    story += [table_from_rows(["ชั้น", "รายละเอียด"], ai_rows, [40 * mm, 131 * mm]), Spacer(1, 5 * mm)]
    story += [p("Scientific guardrails", H2),
              bullet("ห้ามรับรองสูตรว่าปลอดภัยก่อน Run และห้ามอ้างคะแนนที่ไม่มีใน context"),
              bullet("ห้ามสร้าง SMILES สำหรับสารสกัด/สารผสม และตรวจ action ที่ LLM สร้างก่อนส่งให้ UI"),
              bullet("คำขอสูตรทดสอบคะแนนสูงใช้ reviewed fixture แทนการเดาความเข้มข้นจากชื่อสาร"),
              bullet("confidence ต่ำหรือ out-of-domain ต้องแสดงข้อจำกัดก่อนสรุป"),
              Spacer(1, 3 * mm),
              callout("ไม่ใช่การ fine-tune", "AI Assistant ปัจจุบันเป็น context-grounded assistant ที่ควบคุมด้วย system prompt และกฎเชิงโปรแกรม ไม่ได้ฝึกโมเดลใหม่จากบทสนทนาของผู้ใช้", TEAL),
              PageBreak()]

    story += [section("การทดสอบและความพร้อมสำหรับเครื่อง Clone ใหม่"), p("เกณฑ์ส่งมอบใช้ทั้ง automated tests, fresh database migration และ browser smoke test"), Spacer(1, 3 * mm)]
    test_rows = [
        ["Frontend", "TypeScript type-check และ Next.js production build"],
        ["Backend", "API, OCR, registry, PubChem evidence และ smoke tests"],
        ["Scientific", "worker tests และ model artifacts ครบ skin, eye, sens, acute"],
        ["Fresh database", "Alembic upgrade บนฐานข้อมูลใหม่ และ registry seed อย่างน้อย 1,000 แถว"],
        ["Runtime", "CORS/API health, assessment queue, chat, TTS, CSS และ WebGL"],
        ["Repository", "verify-clone-ready ตรวจไฟล์สำคัญว่ามีอยู่และถูก track ใน Git"],
    ]
    story += [table_from_rows(["ขอบเขต", "สิ่งที่ตรวจ"], test_rows, [40 * mm, 131 * mm]), Spacer(1, 5 * mm)]
    story += [p("วิธีเริ่มระบบหลัง Clone", H2),
              bullet("คัดลอก `.env.example` เป็น `.env` แล้วใส่ `GROQ_API_KEY` เฉพาะในเครื่องหรือ deploy secret"),
              bullet("รัน `docker compose up --build` สำหรับ PostgreSQL, Redis, Backend และ Scientific worker"),
              bullet("เปิด terminal ใหม่: `cd frontend`, `npm ci`, `npm run dev`"),
              bullet("รัน `powershell -ExecutionPolicy Bypass -File scripts/verify-clone-ready.ps1` เพื่อตรวจ assets และ models"),
              Spacer(1, 4 * mm),
              callout("ความลับและความปลอดภัย", "ห้ามใส่ GROQ_API_KEY จริงใน Git, `.env.example`, screenshot หรือเอกสาร PDF ให้ใช้ secret manager ของแพลตฟอร์มเมื่อ deploy", RED),
              PageBreak()]

    story += [section("ข้อจำกัดและไฟล์อ้างอิง"), p("RalphGuard เป็นระบบคัดกรอง in-silico ผลไม่ได้ทดแทนการทดสอบมาตรฐาน การประเมินความปลอดภัยโดยผู้เชี่ยวชาญ หรือการวินิจฉัยทางการแพทย์"), Spacer(1, 3 * mm)]
    limits = [
        "พอลิเมอร์ สารสกัด น้ำหอม สารผสม และ UVCB อาจไม่มีโครงสร้างเดี่ยวสำหรับ QSAR",
        "ภาพ 3D เป็นการสื่อสารคะแนน ไม่ใช่การจำลองอาการทางคลินิก",
        "คุณภาพ OCR ขึ้นกับความคมชัด มุม แสง และความครบของช่วง Ingredients",
        "คำสั่งเสียงขึ้นกับการรองรับ Web Speech API และสิทธิ์ไมโครโฟนของเบราว์เซอร์",
        "บริการ Groq และ Edge TTS ต้องเชื่อมต่อเครือข่าย; ระบบมี fallback เฉพาะ TTS",
    ]
    story += [KeepTogether([p("ข้อจำกัดที่ต้องสื่อสาร", H2), *[bullet(item) for item in limits]]), Spacer(1, 5 * mm)]
    files = [
        ["OCR", "backend/app/api/ocr.py"],
        ["Registry", "backend/app/services/ingredient_registry.py"],
        ["PubChem evidence", "backend/app/services/pubchem_evidence.py"],
        ["AI and TTS", "backend/app/api/chat.py, backend/app/api/tts.py"],
        ["Frontend", "LabelScanModal.tsx, VoiceAssistant.tsx, SubstanceHoverCard.tsx"],
        ["Clone check", "scripts/verify-clone-ready.ps1"],
    ]
    story += [table_from_rows(["ส่วน", "ไฟล์หลัก"], files, [42 * mm, 129 * mm]), Spacer(1, 6 * mm)]
    story += [callout("สรุป", "ระบบพัฒนาโดยให้ traceability มาก่อนความครอบคลุม: อ่านซ้ำอย่างควบคุม เชื่อมชื่อด้วยหลักฐาน แยก QSAR eligibility ชัดเจน และให้ผู้ใช้ยืนยันทุกการเปลี่ยนสูตรจาก AI", TEAL)]
    return story


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = RalphGuardDoc(str(OUTPUT))
    doc.build(build_story())
    print(OUTPUT)


if __name__ == "__main__":
    main()
