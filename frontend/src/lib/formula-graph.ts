import type { FormulaItem, Region } from "@/lib/api";
import {
  normalizeFormulaGraphSnapshot,
  type FormulaGraphNodeSnapshot,
  type FormulaGraphSnapshot,
} from "./project-workspace.ts";

export const formulaGraphItemIdentity = (item: { name?: string; smiles?: string }) => {
  const smiles = String(item.smiles || "").trim().toLowerCase();
  if (smiles) return `smiles:${smiles}`;
  const name = String(item.name || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return name ? `name:${name}` : "";
};

export function mergeDuplicateFormulaItems(items: FormulaItem[]): FormulaItem[] {
  const merged: FormulaItem[] = [];
  const indexByIdentity = new Map<string, number>();

  for (const item of items) {
    const normalized: FormulaItem = {
      name: String(item.name || ""),
      smiles: String(item.smiles || ""),
      concentration: Number(item.concentration) || 0,
    };
    const identity = formulaGraphItemIdentity(normalized);
    if (!identity) {
      merged.push(normalized);
      continue;
    }

    const existingIndex = indexByIdentity.get(identity);
    if (existingIndex === undefined) {
      indexByIdentity.set(identity, merged.length);
      merged.push(normalized);
      continue;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = {
      name: existing.name || normalized.name,
      smiles: existing.smiles || normalized.smiles,
      concentration: existing.concentration + normalized.concentration,
    };
  }

  return merged;
}

const isChemicalNode = (node: FormulaGraphNodeSnapshot) =>
  node.type === "substance" || node.type === "modifier";

const nextNodeId = (nodes: FormulaGraphNodeSnapshot[], prefix: string) => {
  const used = new Set(nodes.map((node) => node.id));
  let index = 1;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
};

export function formulaGraphItemsSignature(items: FormulaItem[]): string {
  return JSON.stringify(
    items.map((item) => ({
      name: String(item.name || "").trim(),
      smiles: item.smiles.trim(),
      concentration: Number(Number(item.concentration).toFixed(6)),
    })).sort((left, right) => {
      const leftKey = `${left.smiles.toLowerCase()}\u0000${left.name.toLowerCase()}\u0000${left.concentration}`;
      const rightKey = `${right.smiles.toLowerCase()}\u0000${right.name.toLowerCase()}\u0000${right.concentration}`;
      return leftKey.localeCompare(rightKey);
    }),
  );
}

export function formulaItemsFromGraph(snapshot: FormulaGraphSnapshot): FormulaItem[] {
  return snapshot.nodes.filter(isChemicalNode).map((node) => ({
    name: String(node.data.name || ""),
    smiles: String(node.data.smiles || ""),
    concentration: Number(node.data.concentration) || 0,
  }));
}

export type FormulaGraphResultScope = {
  items: FormulaItem[];
  connectedChemicalNodeIds: string[];
  disconnectedChemicalNodeIds: string[];
};

/** Resolve the deterministic chemical input that reaches one Result node. */
export function formulaResultScope(
  graph: Pick<FormulaGraphSnapshot, "nodes" | "edges">,
  resultNodeId: string,
): FormulaGraphResultScope {
  const incomingByTarget = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const incoming = incomingByTarget.get(edge.target);
    if (incoming) incoming.push(edge.source);
    else incomingByTarget.set(edge.target, [edge.source]);
  }

  const upstreamNodeIds = new Set<string>();
  const visited = new Set<string>([resultNodeId]);
  const stack = [resultNodeId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const source of incomingByTarget.get(current) ?? []) {
      if (visited.has(source)) continue;
      visited.add(source);
      upstreamNodeIds.add(source);
      stack.push(source);
    }
  }

  const chemicalNodes = graph.nodes.filter(isChemicalNode);
  const connectedChemicalNodes = chemicalNodes.filter((node) => upstreamNodeIds.has(node.id));
  const disconnectedChemicalNodes = chemicalNodes.filter((node) => !upstreamNodeIds.has(node.id));

  return {
    items: connectedChemicalNodes.map((node) => ({
      name: String(node.data.name || ""),
      smiles: String(node.data.smiles || ""),
      concentration: Number(node.data.concentration) || 0,
    })),
    connectedChemicalNodeIds: connectedChemicalNodes.map((node) => node.id),
    disconnectedChemicalNodeIds: disconnectedChemicalNodes.map((node) => node.id),
  };
}

export function buildFormulaGraphSnapshot(
  formula: FormulaItem[],
  region: Region,
): FormulaGraphSnapshot {
  const workingFormula = mergeDuplicateFormulaItems(formula);
  const nodes: FormulaGraphNodeSnapshot[] = workingFormula.map((item, index) => ({
    id: `s${index + 1}`,
    type: "substance",
    position: { x: 40, y: 40 + index * 200 },
    data: {
      name: item.name || "",
      smiles: item.smiles,
      concentration: item.concentration,
    },
  }));
  const resultY = 40 + Math.max(0, workingFormula.length - 1) * 100;
  nodes.push({
    id: "r1",
    type: "result",
    position: { x: 620, y: resultY },
    data: { region, status: "idle" },
  });
  return {
    nodes,
    edges: workingFormula.map((_, index) => ({
      id: `e-s${index + 1}`,
      source: `s${index + 1}`,
      target: "r1",
      animated: true,
    })),
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/**
 * Open a Graph workspace without mutating it from later Formula Panel changes.
 * A saved Graph draft always wins; the selected formula is only the first seed.
 */
export function initializeFormulaGraphSnapshot(
  existing: FormulaGraphSnapshot | null | undefined,
  seed: FormulaItem[],
  region: Region,
): FormulaGraphSnapshot {
  const draft = existing ? normalizeFormulaGraphSnapshot(existing) : null;
  return draft ?? buildFormulaGraphSnapshot(seed, region);
}

/** Keep layout/result nodes, but make chemical nodes exactly match a formula. */
export function synchronizeGraphWithFormula(
  existing: FormulaGraphSnapshot | null | undefined,
  formula: FormulaItem[],
  region: Region,
): FormulaGraphSnapshot {
  const workingFormula = mergeDuplicateFormulaItems(formula);
  if (!existing) return buildFormulaGraphSnapshot(workingFormula, region);

  const graph = normalizeFormulaGraphSnapshot(existing);
  if (!graph) return buildFormulaGraphSnapshot(workingFormula, region);
  // An empty graph is an intentional persisted state. Do not recreate the
  // default Result node after the user has removed every node from an empty formula.
  if (graph.nodes.length === 0 && workingFormula.length === 0) return graph;
  const formulaChanged =
    formulaGraphItemsSignature(formulaItemsFromGraph(graph)) !==
    formulaGraphItemsSignature(workingFormula);
  const regionChanged = graph.nodes.some(
    (node) => node.type === "result" && node.data.region !== region,
  );

  const chemicalNodes = graph.nodes.filter(isChemicalNode);
  const usedNodeIds = new Set<string>();
  const replacementById = new Map<string, FormulaGraphNodeSnapshot>();
  const appended: FormulaGraphNodeSnapshot[] = [];

  workingFormula.forEach((item, formulaIndex) => {
    const identity = formulaGraphItemIdentity(item);
    const matched = chemicalNodes.find(
      (node) =>
        !usedNodeIds.has(node.id) &&
        (identity
          ? formulaGraphItemIdentity({ name: node.data.name, smiles: node.data.smiles }) === identity
          : chemicalNodes.indexOf(node) === formulaIndex),
    );
    const positionalFallback = chemicalNodes[formulaIndex];
    const reusable = matched || (
      positionalFallback && !usedNodeIds.has(positionalFallback.id)
        ? positionalFallback
        : chemicalNodes.find((node) => !usedNodeIds.has(node.id))
    );
    if (reusable) {
      usedNodeIds.add(reusable.id);
      replacementById.set(reusable.id, {
        ...reusable,
        data: {
          name: item.name || "",
          smiles: item.smiles,
          concentration: item.concentration,
        },
      });
      return;
    }

    const combinedNodes = [...graph.nodes, ...appended];
    const id = nextNodeId(combinedNodes, "s");
    appended.push({
      id,
      type: "substance",
      position: { x: 40, y: 40 + formulaIndex * 200 },
      data: {
        name: item.name || "",
        smiles: item.smiles,
        concentration: item.concentration,
      },
    });
  });

  const removedChemicalIds = new Set(
    chemicalNodes.filter((node) => !usedNodeIds.has(node.id)).map((node) => node.id),
  );
  const nodes = [
    ...graph.nodes
      .filter((node) => !removedChemicalIds.has(node.id))
      .map((node) => {
        const replacement = replacementById.get(node.id);
        if (replacement) return replacement;
        if ((formulaChanged || regionChanged) && node.type === "result") {
          return {
            ...node,
            data: { region, status: "idle" as const },
          };
        }
        return node;
      }),
    ...appended,
  ];
  let resultNode = nodes.find((node) => node.type === "result");
  if (!resultNode) {
    resultNode = {
      id: nextNodeId(nodes, "r"),
      type: "result",
      position: { x: 620, y: 40 + Math.max(0, workingFormula.length - 1) * 100 },
      data: { region, status: "idle" },
    };
    nodes.push(resultNode);
  }

  const edges = graph.edges.filter(
    (edge) => !removedChemicalIds.has(edge.source) && !removedChemicalIds.has(edge.target),
  );
  const edgeIds = new Set(edges.map((edge) => edge.id));
  for (const node of appended) {
    let id = `e-${node.id}-${resultNode.id}`;
    let suffix = 1;
    while (edgeIds.has(id)) {
      suffix += 1;
      id = `e-${node.id}-${resultNode.id}-${suffix}`;
    }
    edgeIds.add(id);
    edges.push({ id, source: node.id, target: resultNode.id, animated: true });
  }

  return {
    nodes,
    edges,
    viewport: graph.viewport,
  };
}
