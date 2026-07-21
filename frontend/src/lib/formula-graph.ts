import type { FormulaItem, Region } from "@/lib/api";
import {
  normalizeFormulaGraphSnapshot,
  type FormulaGraphNodeSnapshot,
  type FormulaGraphSnapshot,
} from "./project-workspace.ts";

const normalizedIdentity = (item: { name?: string; smiles?: string }) => {
  const smiles = String(item.smiles || "").trim().toLowerCase();
  if (smiles) return `smiles:${smiles}`;
  const name = String(item.name || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return name ? `name:${name}` : "";
};

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
    })),
  );
}

export function formulaItemsFromGraph(snapshot: FormulaGraphSnapshot): FormulaItem[] {
  return snapshot.nodes.filter(isChemicalNode).map((node) => ({
    name: String(node.data.name || ""),
    smiles: String(node.data.smiles || ""),
    concentration: Number(node.data.concentration) || 0,
  }));
}

export function buildFormulaGraphSnapshot(
  formula: FormulaItem[],
  region: Region,
): FormulaGraphSnapshot {
  const nodes: FormulaGraphNodeSnapshot[] = formula.map((item, index) => ({
    id: `s${index + 1}`,
    type: "substance",
    position: { x: 40, y: 40 + index * 200 },
    data: {
      name: item.name || "",
      smiles: item.smiles,
      concentration: item.concentration,
    },
  }));
  const resultY = 40 + Math.max(0, formula.length - 1) * 100;
  nodes.push({
    id: "r1",
    type: "result",
    position: { x: 460, y: resultY },
    data: { region, status: "idle" },
  });
  return {
    nodes,
    edges: formula.map((_, index) => ({
      id: `e-s${index + 1}`,
      source: `s${index + 1}`,
      target: "r1",
      animated: true,
    })),
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/** Keep layout/result nodes, but make chemical nodes exactly match a formula. */
export function synchronizeGraphWithFormula(
  existing: FormulaGraphSnapshot | null | undefined,
  formula: FormulaItem[],
  region: Region,
): FormulaGraphSnapshot {
  if (!existing) return buildFormulaGraphSnapshot(formula, region);

  const graph = normalizeFormulaGraphSnapshot(existing);
  if (!graph) return buildFormulaGraphSnapshot(formula, region);
  const formulaChanged =
    formulaGraphItemsSignature(formulaItemsFromGraph(graph)) !==
    formulaGraphItemsSignature(formula);

  const chemicalNodes = graph.nodes.filter(isChemicalNode);
  const usedNodeIds = new Set<string>();
  const replacementById = new Map<string, FormulaGraphNodeSnapshot>();
  const appended: FormulaGraphNodeSnapshot[] = [];

  formula.forEach((item, formulaIndex) => {
    const identity = normalizedIdentity(item);
    const matched = chemicalNodes.find(
      (node) =>
        !usedNodeIds.has(node.id) &&
        (identity
          ? normalizedIdentity({ name: node.data.name, smiles: node.data.smiles }) === identity
          : chemicalNodes.indexOf(node) === formulaIndex),
    );
    if (matched) {
      usedNodeIds.add(matched.id);
      replacementById.set(matched.id, {
        ...matched,
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
        if (formulaChanged && node.type === "result") {
          return {
            ...node,
            data: { region: node.data.region ?? region, status: "idle" as const },
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
      position: { x: 460, y: 40 + Math.max(0, formula.length - 1) * 100 },
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
