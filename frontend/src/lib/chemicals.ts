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
  { id: "hyaluronic", name: "Hyaluronic Acid", cas: "9004-61-9", role: "สารออกฤทธิ์", color: "#0EA5E9" },
  { id: "panthenol", name: "Panthenol (Vitamin B5)", cas: "81-13-0", role: "สารปลอบผิว", color: "#22C55E" },
  { id: "tocopherol", name: "Tocopherol (Vitamin E)", cas: "1406-18-4", role: "สารต้านอนุมูลอิสระ", color: "#F97316" },
  { id: "salicylic", name: "Salicylic Acid", cas: "69-72-7", role: "สารผลัดเซลล์ผิว", color: "#8B5CF6" },
  { id: "glycolic", name: "Glycolic Acid", cas: "79-14-1", role: "สารผลัดเซลล์ผิว", color: "#8B5CF6" },
  { id: "squalane", name: "Squalane", cas: "111-01-3", role: "สารให้ความชุ่มชื้น", color: "#0EA5E9" },
  { id: "ceramide", name: "Ceramide NP", cas: "100403-19-8", role: "สารบำรุงเกราะป้องกันผิว", color: "#22C55E" },
  { id: "centella", name: "Centella Asiatica Extract", cas: "84696-21-9", role: "สารปลอบผิว", color: "#22C55E" },
  { id: "sheabutter", name: "Shea Butter (Butyrospermum Parkii)", cas: "194043-92-0", role: "สารให้ความชุ่มชื้น", color: "#F97316" },
  { id: "kojic", name: "Kojic Acid", cas: "501-30-4", role: "สารออกฤทธิ์", color: "#22C55E" },
  { id: "retinol", name: "Retinol", cas: "68-26-8", role: "สารออกฤทธิ์", color: "#8B5CF6" },
  { id: "adenosine", name: "Adenosine", cas: "58-61-7", role: "สารลดเลือนริ้วรอย", color: "#22C55E" },
  { id: "greentea", name: "Camellia Sinensis (Green Tea) Leaf Extract", cas: "84650-60-2", role: "สารต้านอนุมูลอิสระ", color: "#22C55E" },
  { id: "xanthan", name: "Xanthan Gum", cas: "11138-66-2", role: "สารเพิ่มความหนืด", color: "#3B82F6" },
  { id: "collagen", name: "Hydrolyzed Collagen", cas: "9015-54-7", role: "สารออกฤทธิ์", color: "#22C55E" },
  { id: "zincoxide", name: "Zinc Oxide", cas: "1314-13-2", role: "สารป้องกันแสงแดด", color: "#64748B" },
  { id: "titanium", name: "Titanium Dioxide", cas: "13463-67-7", role: "สารป้องกันแสงแดด", color: "#64748B" },
  { id: "aloe", name: "Aloe Barbadensis Leaf Juice", cas: "85507-69-3", role: "สารปลอบผิว", color: "#22C55E" },
  { id: "sodium_hyaluronate", name: "Sodium Hyaluronate", cas: "9067-32-7", role: "สารออกฤทธิ์", color: "#0EA5E9" },
  { id: "polysorbate", name: "Polysorbate 20", cas: "9005-64-5", role: "สารประสาน", color: "#EC4899" },
];

export const chemById = (id: string) => CHEMICALS.find((c) => c.id === id)!;
