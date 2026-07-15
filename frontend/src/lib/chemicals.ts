// Shared mock chemical library — used by the assess workspace's substance
// picker and the project-wide "สารเคมี" (chemical library) page.
export type Chemical = {
  id: string;
  name: string;
  cas: string;
  role: string;
  color: string; // flask icon tint
};

export const CHEMICALS: Chemical[] = [
  { id: "water", name: "Water (Aqua)", cas: "7732-18-5", role: "ตัวทำละลายหลัก", color: "#3B82F6" },
  { id: "glycerin", name: "Glycerin", cas: "56-81-5", role: "สารให้ความชุ่มชื้น", color: "#0EA5E9" },
  { id: "cetearyl", name: "Cetearyl Alcohol", cas: "67762-27-0", role: "สารเพิ่มความข้น", color: "#EC4899" },
  { id: "cct", name: "Caprylic/Capric Triglyceride", cas: "73398-61-5", role: "สารให้ความลื่น", color: "#F97316" },
  { id: "dimethicone", name: "Dimethicone", cas: "63148-62-9", role: "สารเคลือบผิว", color: "#22C55E" },
  { id: "niacinamide", name: "Niacinamide", cas: "98-92-0", role: "สารออกฤทธิ์", color: "#22C55E" },
  { id: "phenoxyethanol", name: "Phenoxyethanol", cas: "122-99-6", role: "สารกันเสีย", color: "#EC4899" },
  { id: "carbomer", name: "Carbomer", cas: "9007-20-9", role: "สารเพิ่มความหนืด", color: "#3B82F6" },
  { id: "tea", name: "Triethanolamine", cas: "102-71-6", role: "สารปรับค่า pH", color: "#3B82F6" },
  { id: "allantoin", name: "Allantoin", cas: "97-59-6", role: "สารปลอบผิว", color: "#22C55E" },
];

export const chemById = (id: string) => CHEMICALS.find((c) => c.id === id)!;
