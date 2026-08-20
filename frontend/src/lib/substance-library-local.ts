import type { IngredientRegistryItem } from "@/lib/api";
import type { CatalogGroup } from "@/lib/catalog";

const STORAGE_VERSION = 1 as const;
export const CUSTOM_SUBSTANCES_STORAGE_KEY = "ralphguard:custom-substances:v1";
export const SUBSTANCE_FAVORITES_STORAGE_KEY = "ralphguard:substance-favorites:v1";
const MAX_CUSTOM_SUBSTANCES = 500;
const MAX_FAVORITES = 2_000;

export type SubstanceSource = "system" | "local" | "herb";

export type LocalSubstance = {
  id: string;
  name: string;
  smiles: string;
  category: string;
  molecularFormula?: string;
  molecularWeight?: number;
  createdAt: string;
  updatedAt: string;
};

export type LibrarySubstance = {
  key: string;
  source: SubstanceSource;
  name: string;
  smiles: string;
  category: string;
  concentration: number;
  molecularFormula?: string;
  molecularWeight?: number;
  substanceType?: string;
  qsarEligible?: boolean;
  localId?: string;
  herbId?: number;
  botanicalName?: string;
};

type VersionedItems<T> = { version: typeof STORAGE_VERSION; items: T[] };

const cleanText = (value: unknown, limit: number) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

const finiteWeight = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1_000_000 ? parsed : undefined;
};

export const normalizedSmiles = (smiles: string) => smiles.trim();

export const systemSubstanceKey = (smiles: string) => `system:${normalizedSmiles(smiles)}`;

export const localSubstanceKey = (id: string) => `local:${id}`;

export function normalizeLocalSubstance(value: unknown): LocalSubstance | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = cleanText(record.id, 120);
  const name = cleanText(record.name, 180);
  const smiles = cleanText(record.smiles, 1_500);
  if (!id || !name || !smiles) return null;

  const createdAt = cleanText(record.createdAt, 40) || new Date(0).toISOString();
  const updatedAt = cleanText(record.updatedAt, 40) || createdAt;
  const molecularFormula = cleanText(record.molecularFormula, 120) || undefined;

  return {
    id,
    name,
    smiles,
    category: cleanText(record.category, 140) || "สารที่เพิ่มเอง",
    ...(molecularFormula ? { molecularFormula } : {}),
    ...(finiteWeight(record.molecularWeight) != null
      ? { molecularWeight: finiteWeight(record.molecularWeight) }
      : {}),
    createdAt,
    updatedAt,
  };
}

function readVersionedItems(storage: Pick<Storage, "getItem"> | null, key: string): unknown[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<VersionedItems<unknown>>;
    return parsed.version === STORAGE_VERSION && Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

export function loadLocalSubstances(storage: Pick<Storage, "getItem"> | null): LocalSubstance[] {
  const seenIds = new Set<string>();
  const seenSmiles = new Set<string>();
  const result: LocalSubstance[] = [];
  for (const value of readVersionedItems(storage, CUSTOM_SUBSTANCES_STORAGE_KEY)) {
    const item = normalizeLocalSubstance(value);
    if (!item || seenIds.has(item.id) || seenSmiles.has(normalizedSmiles(item.smiles))) continue;
    seenIds.add(item.id);
    seenSmiles.add(normalizedSmiles(item.smiles));
    result.push(item);
    if (result.length >= MAX_CUSTOM_SUBSTANCES) break;
  }
  return result;
}

export function saveLocalSubstances(
  storage: Pick<Storage, "setItem"> | null,
  items: LocalSubstance[],
) {
  if (!storage) throw new Error("ไม่สามารถเข้าถึง Local storage ได้");
  const normalized = items
    .map(normalizeLocalSubstance)
    .filter((item): item is LocalSubstance => Boolean(item))
    .slice(0, MAX_CUSTOM_SUBSTANCES);
  storage.setItem(
    CUSTOM_SUBSTANCES_STORAGE_KEY,
    JSON.stringify({ version: STORAGE_VERSION, items: normalized } satisfies VersionedItems<LocalSubstance>),
  );
}

export function loadFavoriteSubstanceKeys(storage: Pick<Storage, "getItem"> | null): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of readVersionedItems(storage, SUBSTANCE_FAVORITES_STORAGE_KEY)) {
    const key = cleanText(value, 1_700);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
    if (result.length >= MAX_FAVORITES) break;
  }
  return result;
}

export function saveFavoriteSubstanceKeys(
  storage: Pick<Storage, "setItem"> | null,
  keys: string[],
) {
  if (!storage) throw new Error("ไม่สามารถเข้าถึง Local storage ได้");
  const items = Array.from(new Set(keys.map((key) => cleanText(key, 1_700)).filter(Boolean))).slice(
    0,
    MAX_FAVORITES,
  );
  storage.setItem(
    SUBSTANCE_FAVORITES_STORAGE_KEY,
    JSON.stringify({ version: STORAGE_VERSION, items } satisfies VersionedItems<string>),
  );
}

export function mergeSubstanceLibrary(
  catalogGroups: CatalogGroup[],
  registryItems: IngredientRegistryItem[],
  localItems: LocalSubstance[],
): LibrarySubstance[] {
  const systemBySmiles = new Map<string, LibrarySubstance>();

  for (const registryItem of registryItems) {
    const smiles = normalizedSmiles(registryItem.canonical_smiles || "");
    if (!smiles || registryItem.verification_status !== "verified") continue;
    systemBySmiles.set(smiles, {
      key: systemSubstanceKey(smiles),
      source: "system",
      name: registryItem.inci_name || registryItem.canonical_name,
      smiles,
      category: "สารจากฐานข้อมูลที่ยืนยันแล้ว",
      concentration: 1,
      ...(registryItem.molecular_formula ? { molecularFormula: registryItem.molecular_formula } : {}),
      ...(registryItem.molecular_weight != null
        ? { molecularWeight: registryItem.molecular_weight }
        : {}),
      substanceType: registryItem.substance_type,
      qsarEligible: registryItem.qsar_eligible,
    });
  }

  for (const group of catalogGroups) {
    for (const catalogItem of group.items) {
      const smiles = normalizedSmiles(catalogItem.smiles);
      if (!smiles) continue;
      const existing = systemBySmiles.get(smiles);
      systemBySmiles.set(smiles, {
        ...(existing || {
          key: systemSubstanceKey(smiles),
          source: "system" as const,
          smiles,
          concentration: catalogItem.conc,
        }),
        // Keep the curated product-facing name (for example "Glycerin")
        // while enriching it with verified Registry metadata.
        name: catalogItem.name,
        category: group.category,
        concentration: catalogItem.conc,
      });
    }
  }

  const systemItems = Array.from(systemBySmiles.values());
  const systemSmiles = new Set(systemItems.map((item) => normalizedSmiles(item.smiles)));
  const systemNames = new Set(systemItems.map((item) => item.name.trim().toLocaleLowerCase()));
  const localLibraryItems = localItems.flatMap((item) => {
    if (
      systemSmiles.has(normalizedSmiles(item.smiles)) ||
      systemNames.has(item.name.trim().toLocaleLowerCase())
    ) {
      return [];
    }
    return [{
      key: localSubstanceKey(item.id),
      source: "local" as const,
      name: item.name,
      smiles: item.smiles,
      category: item.category,
      concentration: 0,
      ...(item.molecularFormula ? { molecularFormula: item.molecularFormula } : {}),
      ...(item.molecularWeight != null ? { molecularWeight: item.molecularWeight } : {}),
      localId: item.id,
    }];
  });

  return [...systemItems, ...localLibraryItems];
}

export function findSystemSubstanceMatch(
  items: LibrarySubstance[],
  name: string,
  smiles: string,
) {
  const cleanName = name.trim().toLocaleLowerCase();
  const cleanSmiles = normalizedSmiles(smiles);
  const nameMatch = cleanName
    ? items.find((item) => item.source === "system" && item.name.trim().toLocaleLowerCase() === cleanName)
    : undefined;
  const smilesMatch = cleanSmiles
    ? items.find((item) => item.source === "system" && normalizedSmiles(item.smiles) === cleanSmiles)
    : undefined;
  return { nameMatch, smilesMatch };
}
