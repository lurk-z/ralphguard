import type { IngredientRegistryItem, SubstanceProfile } from "@/lib/api";

const ONLINE_CACHE_LIMIT = 50;
const onlineSubstanceCache: IngredientRegistryItem[] = [];

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type ManualSubstanceMatch = {
  profile: SubstanceProfile | null;
  error: string | null;
};

export type ManualSubstanceRegistryMatch = {
  item: IngredientRegistryItem | null;
  error: string | null;
};

function registryItemNames(item: IngredientRegistryItem): string[] {
  return [
    item.inci_name,
    item.canonical_name,
    ...item.synonyms,
    ...item.thai_names,
  ].filter((value): value is string => Boolean(value?.trim()));
}

function sameRegistryIdentity(
  left: IngredientRegistryItem,
  right: IngredientRegistryItem,
): boolean {
  if (left.id === right.id) return true;
  const leftKey = left.inchikey?.trim();
  const rightKey = right.inchikey?.trim();
  if (leftKey && rightKey && leftKey === rightKey) return true;
  const leftSmiles = left.canonical_smiles?.trim();
  const rightSmiles = right.canonical_smiles?.trim();
  return Boolean(leftSmiles && rightSmiles && leftSmiles === rightSmiles);
}

function registryItemsWithOnlineCache(
  items: IngredientRegistryItem[],
): IngredientRegistryItem[] {
  if (!onlineSubstanceCache.length) return items;
  const combined = [...items];
  for (const cached of onlineSubstanceCache) {
    if (!combined.some((item) => sameRegistryIdentity(item, cached))) {
      combined.push(cached);
    }
  }
  return combined;
}

/**
 * PubChem is used only to resolve an exact molecular identity/structure here.
 * A resolved PubChem compound is allowed into the formula only when the backend
 * has already classified it as a QSAR-eligible defined single substance.
 * Regulatory/toxicity evidence remains a separate reviewed training pipeline.
 */
export function manualOnlineSubstanceProblem(
  item: IngredientRegistryItem,
): string | null {
  if (!item.canonical_smiles?.trim() || item.structure_status !== "resolved") {
    return "พบสารออนไลน์ แต่ยังไม่มีโครงสร้างโมเลกุลที่ยืนยันแล้วสำหรับการประเมิน";
  }
  if (item.substance_type !== "defined_single_substance") {
    return "พบสารออนไลน์ แต่เป็นสารผสม/สารสกัด/องค์ประกอบไม่แน่นอน จึงไม่ใช้ SMILES โมเลกุลเดียวแทนสูตรจริง";
  }
  if (!item.qsar_eligible || item.assessment_method !== "qsar") {
    return "พบสารออนไลน์ แต่โครงสร้างนี้ไม่ผ่านเกณฑ์สำหรับ QSAR ของ RalphGuard";
  }
  return null;
}

/**
 * Keep a small in-memory cache of PubChem-resolved candidates for the current
 * browser session. This bridges the asynchronous online lookup back into the
 * existing synchronous registry matching flow without pretending that the
 * candidate is a reviewed toxicity-training record.
 *
 * Returns a user-facing problem when the candidate must not enter QSAR.
 */
export function rememberManualOnlineSubstance(
  item: IngredientRegistryItem,
): string | null {
  const problem = manualOnlineSubstanceProblem(item);
  if (problem) return problem;

  const existingIndex = onlineSubstanceCache.findIndex((cached) =>
    sameRegistryIdentity(cached, item),
  );
  if (existingIndex >= 0) onlineSubstanceCache.splice(existingIndex, 1);
  onlineSubstanceCache.unshift(item);
  if (onlineSubstanceCache.length > ONLINE_CACHE_LIMIT) {
    onlineSubstanceCache.length = ONLINE_CACHE_LIMIT;
  }
  return null;
}

export function searchManualSubstanceSuggestions(
  items: IngredientRegistryItem[],
  query: string,
  limit = 6,
): IngredientRegistryItem[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  return registryItemsWithOnlineCache(items)
    .flatMap((item) => {
      if (!item.canonical_smiles?.trim()) return [];
      const displayName = normalizeSearchText(item.inci_name || item.canonical_name);
      if (!displayName.startsWith(normalizedQuery)) return [];
      return [{ item, rank: displayName === normalizedQuery ? 0 : 1 }];
    })
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      const leftName = left.item.inci_name || left.item.canonical_name;
      const rightName = right.item.inci_name || right.item.canonical_name;
      return leftName.localeCompare(rightName, "en");
    })
    .slice(0, limit)
    .map(({ item }) => item);
}

/**
 * Resolves an exact identity from the verified registry already loaded for the
 * autocomplete plus QSAR-eligible PubChem candidates resolved during this
 * browser session. Local reviewed registry rows keep priority over online cache.
 */
export function resolveManualSubstanceRegistryMatch({
  items,
  name,
  smiles,
}: {
  items: IngredientRegistryItem[];
  name: string;
  smiles: string;
}): ManualSubstanceRegistryMatch {
  const searchableItems = registryItemsWithOnlineCache(items);
  const normalizedName = normalizeSearchText(name);
  const cleanSmiles = smiles.trim();
  const nameMatch = normalizedName
    ? searchableItems.find((item) =>
        registryItemNames(item).some(
          (candidate) => normalizeSearchText(candidate) === normalizedName,
        ),
      ) ?? null
    : null;
  const smilesMatch = cleanSmiles
    ? searchableItems.find((item) => item.canonical_smiles?.trim() === cleanSmiles) ?? null
    : null;

  if (normalizedName && cleanSmiles) {
    const sameCanonicalSmiles = Boolean(
      nameMatch?.canonical_smiles?.trim() &&
      smilesMatch?.canonical_smiles?.trim() &&
      nameMatch.canonical_smiles.trim() === smilesMatch.canonical_smiles.trim(),
    );
    return sameCanonicalSmiles
      ? { item: nameMatch, error: null }
      : {
        item: null,
        error: "ชื่อและ SMILES ไม่ตรงกัน หรือไม่มีข้อมูลคู่นี้ในฐานข้อมูล",
      };
  }

  const item = nameMatch || smilesMatch;
  return item
    ? { item, error: null }
    : {
      item: null,
      error: "ไม่พบสารนี้ในฐานข้อมูลภายในหรือ PubChem กรุณาตรวจสอบชื่อหรือ SMILES",
    };
}

export function resolveManualSubstanceMatch({
  hasName,
  hasSmiles,
  nameProfile,
  smilesProfile,
}: {
  hasName: boolean;
  hasSmiles: boolean;
  nameProfile: SubstanceProfile | null;
  smilesProfile: SubstanceProfile | null;
}): ManualSubstanceMatch {
  const nameMatch = nameProfile?.found_in_registry === true ? nameProfile : null;
  const smilesMatch = smilesProfile?.found_in_registry === true ? smilesProfile : null;

  if (hasName && hasSmiles) {
    const sameCanonicalSmiles = Boolean(
      nameMatch?.canonical_smiles &&
      smilesMatch?.canonical_smiles &&
      nameMatch.canonical_smiles === smilesMatch.canonical_smiles,
    );
    return sameCanonicalSmiles
      ? { profile: nameMatch, error: null }
      : {
        profile: null,
        error: "ชื่อและ SMILES ไม่ตรงกัน หรือไม่มีข้อมูลคู่นี้ในฐานข้อมูล",
      };
  }

  const profile = nameMatch || smilesMatch;
  return profile
    ? { profile, error: null }
    : {
      profile: null,
      error: "ไม่พบสารนี้ในฐานข้อมูล กรุณาตรวจสอบชื่อหรือ SMILES",
    };
}
