export const endpoints = ["ระคายเคืองผิว", "ระคายเคืองตา", "แพ้สัมผัส", "พิษเฉียบพลัน"] as const;
export const substances = ["Water", "Ethanol", "Glycerin"] as const;
export type VersionId = "V1" | "V2-A" | "V2-B";

type Formula = {
  id: VersionId;
  parent?: VersionId;
  name: string;
  status: string;
  tone: "amber" | "teal" | "slate";
  amounts: [number, number, number];
  scores: [number | null, number | null, number | null, number | null];
  finding: string;
  limit: string;
};

// Illustrative UI fixtures only. Scores are independent of ingredient percentages.
export const formulas: Formula[] = [
  { id: "V1", name: "โทนเนอร์สูตรตั้งต้น", status: "พบจุดทบทวน", tone: "amber",
    amounts: [75, 20, 5], scores: [62, 48, 18, 12],
    finding: "ผลตัวอย่างด้านผิวสูงที่สุดในรุ่นตั้งต้น จึงแยกทดลองสองแนวทางเพื่อเทียบกับ V1",
    limit: "ใช้เป็นจุดอ้างอิงสำหรับรุ่นลูกทั้งสอง" },
  { id: "V2-A", parent: "V1", name: "ลดสัดส่วนเอทานอล", status: "รุ่นแนะนำ", tone: "teal",
    amounts: [85, 10, 5], scores: [28, 30, 18, 12],
    finding: "คะแนนด้านผิวในตัวอย่างลดจาก 62 เป็น 28 และมีผลครบทั้งสี่ด้าน ผู้ประเมินจึงเลือกรุ่นนี้ไว้ทดลองต่อ",
    limit: "ยังไม่มีผลทดสอบประสิทธิผลของสูตร" },
  { id: "V2-B", parent: "V1", name: "เพิ่มสัดส่วนกลีเซอริน", status: "ข้อมูลจำกัด", tone: "slate",
    amounts: [70, 20, 10], scores: [45, 44, null, 13],
    finding: "คะแนนด้านผิวในตัวอย่างลดลงจาก V1 แต่ยังเปรียบเทียบความเสี่ยงได้เพียงสามด้าน",
    limit: "แพ้สัมผัสยังสรุปไม่ได้ เนื่องจากหลักฐานของรุ่นนี้มีไม่เพียงพอ" },
];
