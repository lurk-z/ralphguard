# เอกสาร RalphGuard และ Ralph Lab

## เริ่มจากเอกสารชุดไหน

- [Ralph Lab · เอกสารส่งต่อสำหรับ Claude](ralph-lab/README.md) รวมแนวคิดของเจ้าของโครงการ ระบบ RalphGuard เดิม และบริบทการแข่งขัน
- [README ของ RalphGuard](../README.md) สำหรับภาพรวมระบบเดิม และ [SETUP](../SETUP.md) สำหรับขั้นตอนเริ่มต้นใช้งาน
- ใช้เอกสารในหมวดประวัติเพื่อดูสถานะ ณ วันที่บันทึก ส่วนโค้ดที่ใช้งานอ้างอิงได้จาก [บริบทและระบบ RalphGuard](ralph-lab/RALPHGUARD_CONTEXT.md)

## Ralph Lab

| เอกสาร | เนื้อหา |
| --- | --- |
| [แนวคิด Ralph Lab](ralph-lab/RALPH_LAB_CONCEPT.md) | โครงการทดลอง บทบาท การส่งใบงาน สูตรแต่ละรุ่น Node Graph และห้องแล็บ 3D |
| [บริบทและระบบ RalphGuard](ralph-lab/RALPHGUARD_CONTEXT.md) | ที่มาของโครงการและข้อเท็จจริงจาก source code เดิม |
| [Sea x OpenAI Regional Codex Hackathon Thailand](ralph-lab/HACKATHON.md) | วันและสถานที่ กำหนดการ กติกา และข้อความแจ้งทีม |

## ฟีเจอร์ RalphGuard

| เอกสาร | เนื้อหา |
| --- | --- |
| [Ingredient Registry](ralphguard/features/INGREDIENT_REGISTRY.md) | ทะเบียนสารและการเสริมข้อมูล PubChem |
| [Thai Herbal Registry](ralphguard/features/THAI_HERBAL_REGISTRY.md) | ข้อมูลพืช วัสดุ และสารองค์ประกอบ |
| [OCR และ AI Assistant](ralphguard/features/OCR_AND_AI_ASSISTANT.md) | ขั้นตอนพัฒนาการอ่านฉลากและผู้ช่วย |
| [รายละเอียดการพัฒนา OCR และ AI Assistant](OCR_AI_ASSISTANT_DEVELOPMENT.md) | เส้นทางการทำงาน Guardrails และการตรวจความพร้อม |
| [OCR Concentration Estimation](ralphguard/features/OCR_CONCENTRATION_ESTIMATION.md) | หลักการประมาณสัดส่วนจากฉลาก |
| [AI Assistant Spec](ralphguard/features/AI_ASSISTANT_SPEC.md) | สเปกผู้ช่วยและตัวอย่างคำสั่ง |
| [Projects Page UI Plan](ralphguard/features/PROJECTS_PAGE_UI_RESPONSIVE_PLAN.md) | แผนหน้า Projects และ responsive UI |
| [Use Cases](ralphguard/features/USE_CASES.md) | เคสตัวอย่างสำหรับใช้งานและทดสอบ |

## วิทยาศาสตร์และข้อมูล

| เอกสาร | เนื้อหา |
| --- | --- |
| [Algorithm และ ML Workflow](ralphguard/science/ALGORITHM_AND_ML_WORKFLOW.md) | วิธีทำงานของโมเดล ข้อมูล และการอ่านผล |
| [Model Evaluation](ralphguard/science/MODEL_EVALUATION.md) | ผลประเมินโมเดลหลักที่บันทึกไว้ |
| [External Validation](ralphguard/science/EXTERNAL_VALIDATION.md) | สถานะชุดทดสอบภายนอกและปัญหาข้อมูลซ้ำ |
| [Model Improvement](MODEL_IMPROVEMENT.md) | วิธีพัฒนาโมเดลที่โค้ด scientific อ้างถึง |
| [Model v2 Workflow](ralphguard/science/MODEL_V2_WORKFLOW.md) | การเตรียมข้อมูล เทรน และตรวจ candidate |
| [Data Preparation](ralphguard/science/DATA_PREPARATION.md) | การเตรียมข้อมูลและการคัดกรองก่อนฝึก |
| [NICE/ICE Bulk Training](ralphguard/science/ICE_BULK_TRAINING.md) | ข้อมูลอ้างอิงระดับหลักหมื่นและขั้นตอนประมวลผล |
| [NICE/ICE Evidence Mapping](ralphguard/science/NICE_EVIDENCE_MAPPING.md) | การ map หลักฐานและเกณฑ์ทบทวน |
| [PubChem Training Evidence](ralphguard/science/PUBCHEM_TRAINING_EVIDENCE.md) | หลักฐาน PubChem สำหรับพิจารณาเพิ่มข้อมูลฝึก |
| [Experimental Negative Pipeline](ralphguard/science/EXPERIMENTAL_NEGATIVE_PIPELINE.md) | การเตรียม experimental negative labels |
| [Continual Learning](ralphguard/science/CONTINUAL_LEARNING.md) | เกณฑ์รับหลักฐานเข้าสู่กระบวนการเรียนรู้ |
| [Skin Dryness Endpoint](ralphguard/science/SKIN_DRYNESS_ENDPOINT.md) | ขอบเขต endpoint และสถานะ research |
| [Skin Dryness Label Policy](ralphguard/science/SKIN_DRYNESS_LABEL_POLICY.md) | วิธีพิจารณา label สำหรับ Skin Dryness |

## การตั้งระบบและ Deploy

- [Google Login Setup](ralphguard/operations/GOOGLE_LOGIN_SETUP.md)
- [Deployment บน Vercel และ Render](ralphguard/operations/DEPLOYMENT_VERCEL_RENDER.md)

## ประวัติโครงการและรายงาน

- [สรุปการปรับปรุง 21 กรกฎาคม 2026](ralphguard/history/2026-07-21_IMPLEMENTATION_SUMMARY.md)
- [Full Project Test Report 11 สิงหาคม 2026](ralphguard/history/FULL_PROJECT_TEST_REPORT_2026-08-11.md)
- [Handoff Implementation Status 20 สิงหาคม 2026](ralphguard/history/HANDOFF_IMPLEMENTATION_STATUS_2026-08-20.md)
- [Current Project Changes](ralphguard/history/CURRENT_PROJECT_CHANGES.md)
- [Main Logic Completion Plan](ralphguard/history/MAIN_LOGIC_COMPLETION_PLAN.md)
- [Reviewer Response](ralphguard/history/REVIEWER_RESPONSE.md)

`MODEL_IMPROVEMENT.md` และ `OCR_AI_ASSISTANT_DEVELOPMENT.md` อยู่ที่ระดับ `docs/` ตามพาธที่โค้ดและสคริปต์ตรวจความพร้อมของ clone อ้างถึง
