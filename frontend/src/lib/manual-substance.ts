import type { IngredientRegistryItem, SubstanceProfile } from "@/lib/api";

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

export function searchManualSubstanceSuggestions(
  items: IngredientRegistryItem[],
  query: string,
  limit = 6,
): IngredientRegistryItem[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  return items
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
 * autocomplete. This keeps the common "select a suggestion, then add" path
 * local and avoids duplicate profile requests for the same substance.
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
  const normalizedName = normalizeSearchText(name);
  const cleanSmiles = smiles.trim();
  const nameMatch = normalizedName
    ? items.find((item) =>
        registryItemNames(item).some(
          (candidate) => normalizeSearchText(candidate) === normalizedName,
        ),
      ) ?? null
    : null;
  const smilesMatch = cleanSmiles
    ? items.find((item) => item.canonical_smiles?.trim() === cleanSmiles) ?? null
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
      error: "ไม่พบสารนี้ในฐานข้อมูล กรุณาตรวจสอบชื่อหรือ SMILES",
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
