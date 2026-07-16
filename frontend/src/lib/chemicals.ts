// Chemical library for the project workspace's substance picker and the
// project-wide "สารเคมี" page.
//
// This is a thin adapter over catalog.ts — the real, shared ingredient database
// that also backs /assess and FormulaGraph. It exists so the workspace UI can
// keep addressing substances by a single `id` while the underlying source of
// truth stays SMILES-keyed, the way the scientific model needs.
//
// Note there is no CAS number here: the catalog does not carry one. SMILES is
// the identifier the model actually computes from.
import { SUBSTANCE_LIBRARY, SUBSTANCE_INFO } from "./catalog";

export type Chemical = {
  id: string; // SMILES — unique across the catalog, so it doubles as the key
  name: string;
  smiles: string;
  conc: number; // default concentration (%) suggested by the catalog
  category: string;
  role?: string; // Thai "what it does" blurb; absent for some substances
  note?: string; // Thai caution blurb; absent for some substances
};

export type ChemicalGroup = { category: string; items: Chemical[] };

/** The catalog's groups, flattened into the shape the workspace UI renders. */
export const CHEMICAL_GROUPS: ChemicalGroup[] = SUBSTANCE_LIBRARY.map((g) => ({
  category: g.category,
  items: g.items.map((it) => ({
    id: it.smiles,
    name: it.name,
    smiles: it.smiles,
    conc: it.conc,
    category: g.category,
    role: SUBSTANCE_INFO[it.smiles]?.role,
    note: SUBSTANCE_INFO[it.smiles]?.note,
  })),
}));

export const CHEMICALS: Chemical[] = CHEMICAL_GROUPS.flatMap((g) => g.items);

const BY_ID = new Map(CHEMICALS.map((c) => [c.id, c]));

/** Undefined for an unknown id — callers render nothing rather than crashing. */
export const chemById = (id: string): Chemical | undefined => BY_ID.get(id);
