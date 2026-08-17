import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFormulaGraphSnapshot,
  formulaGraphItemsSignature,
  formulaItemsConnectedToResults,
  formulaItemsFromGraph,
  formulaResultScope,
  initializeFormulaGraphSnapshot,
  mergeDuplicateFormulaItems,
  synchronizeGraphWithFormula,
} from "../src/lib/formula-graph.ts";

test("builds one connected substance node per selected formula item", () => {
  const graph = buildFormulaGraphSnapshot(
    [
      { name: "Ethanol", smiles: "CCO", concentration: 40 },
      { name: "Glycerin", smiles: "OCC(O)CO", concentration: 10 },
    ],
    "face",
  );

  assert.equal(graph.nodes.filter((node) => node.type === "substance").length, 2);
  assert.equal(graph.nodes.filter((node) => node.type === "result").length, 1);
  assert.equal(graph.edges.length, 2);
});

test("formula graph signatures do not change when the panel order changes", () => {
  const first = [
    { name: "Ethanol", smiles: "CCO", concentration: 40 },
    { name: "Glycerin", smiles: "OCC(O)CO", concentration: 10 },
  ];

  assert.equal(
    formulaGraphItemsSignature(first),
    formulaGraphItemsSignature([...first].reverse()),
  );
});

test("a saved graph draft is not overwritten by later formula panel changes", () => {
  const draft = buildFormulaGraphSnapshot(
    [{ name: "Ethanol", smiles: "CCO", concentration: 20 }],
    "face",
  );
  draft.nodes[0].position = { x: 180, y: 260 };
  draft.viewport = { x: 14, y: -22, zoom: 1.3 };

  const initialized = initializeFormulaGraphSnapshot(
    draft,
    [{ name: "Glycerin", smiles: "OCC(O)CO", concentration: 10 }],
    "eye",
  );

  assert.deepEqual(formulaItemsFromGraph(initialized), [
    { name: "Ethanol", smiles: "CCO", concentration: 20 },
  ]);
  assert.deepEqual(initialized.nodes[0].position, { x: 180, y: 260 });
  assert.deepEqual(initialized.viewport, { x: 14, y: -22, zoom: 1.3 });
});

test("a formula is used only to seed a graph that has no saved draft", () => {
  const initialized = initializeFormulaGraphSnapshot(
    null,
    [{ name: "Glycerin", smiles: "OCC(O)CO", concentration: 10 }],
    "eye",
  );

  assert.deepEqual(formulaItemsFromGraph(initialized), [
    { name: "Glycerin", smiles: "OCC(O)CO", concentration: 10 },
  ]);
  assert.equal(
    initialized.nodes.find((node) => node.type === "result")?.data.region,
    "eye",
  );
});

test("duplicate chemical identities merge without losing their concentration", () => {
  assert.deepEqual(
    mergeDuplicateFormulaItems([
      { name: "Ethanol", smiles: "CCO", concentration: 25 },
      { name: "Alcohol", smiles: " cco ", concentration: 15 },
    ]),
    [{ name: "Ethanol", smiles: "CCO", concentration: 40 }],
  );
});

test("sync replaces stale formula nodes, preserves layout, and invalidates stale results", () => {
  const original = buildFormulaGraphSnapshot(
    [{ name: "Ethanol", smiles: "CCO", concentration: 40 }],
    "face",
  );
  original.nodes[0].position = { x: 123, y: 456 };
  original.nodes[1].data = {
    region: "face",
    status: "completed",
    endpoints: { skin: { peak_score: 35 } },
  };
  original.viewport = { x: 30, y: 20, zoom: 1.4 };

  const synced = synchronizeGraphWithFormula(
    original,
    [
      { name: "Ethanol", smiles: "CCO", concentration: 20 },
      { name: "Glycerin", smiles: "OCC(O)CO", concentration: 5 },
    ],
    "face",
  );

  assert.equal(synced.nodes[0].position.x, 123);
  assert.equal(synced.nodes[0].data.concentration, 20);
  assert.equal(synced.nodes.filter((node) => node.type === "substance").length, 2);
  assert.equal(synced.nodes.find((node) => node.type === "result")?.data.status, "idle");
  assert.equal(synced.nodes.find((node) => node.type === "result")?.data.endpoints, undefined);
  assert.deepEqual(synced.viewport, { x: 30, y: 20, zoom: 1.4 });
  assert.equal(synced.edges.length, 2);
});

test("sync keeps a completed result when formula inputs are unchanged", () => {
  const graph = buildFormulaGraphSnapshot(
    [{ name: "Ethanol", smiles: "CCO", concentration: 40 }],
    "face",
  );
  graph.nodes.find((node) => node.type === "result")!.data = {
    region: "face",
    status: "completed",
    endpoints: { skin: { peak_score: 22 } },
  };

  const synced = synchronizeGraphWithFormula(
    graph,
    [{ name: "Ethanol", smiles: "CCO", concentration: 40 }],
    "face",
  );
  assert.equal(
    synced.nodes.find((node) => node.type === "result")?.data.endpoints?.skin.peak_score,
    22,
  );
});

test("sync removes substances and dangling edges that no longer exist in the formula", () => {
  const graph = buildFormulaGraphSnapshot(
    [
      { name: "Ethanol", smiles: "CCO", concentration: 40 },
      { name: "Glycerin", smiles: "OCC(O)CO", concentration: 10 },
    ],
    "face",
  );

  const synced = synchronizeGraphWithFormula(
    graph,
    [{ name: "Glycerin", smiles: "OCC(O)CO", concentration: 8 }],
    "face",
  );
  assert.deepEqual(formulaItemsFromGraph(synced), [
    { name: "Glycerin", smiles: "OCC(O)CO", concentration: 8 },
  ]);
  assert.equal(synced.edges.some((edge) => edge.source === "s1"), false);
});

test("an empty selected formula clears every chemical node but keeps its result layout", () => {
  const graph = buildFormulaGraphSnapshot(
    [{ name: "Ethanol", smiles: "CCO", concentration: 40 }],
    "face",
  );
  const result = graph.nodes.find((node) => node.type === "result")!;
  result.position = { x: 720, y: 180 };

  const synced = synchronizeGraphWithFormula(graph, [], "face");

  assert.deepEqual(formulaItemsFromGraph(synced), []);
  assert.equal(synced.edges.length, 0);
  assert.deepEqual(
    synced.nodes.find((node) => node.type === "result")?.position,
    { x: 720, y: 180 },
  );
});

test("sync updates the Result region and invalidates its stale assessment", () => {
  const graph = buildFormulaGraphSnapshot(
    [{ name: "Ethanol", smiles: "CCO", concentration: 40 }],
    "face",
  );
  graph.nodes.find((node) => node.type === "result")!.data = {
    region: "face",
    status: "completed",
    endpoints: { eye: { peak_score: 44 } },
  };

  const synced = synchronizeGraphWithFormula(
    graph,
    [{ name: "Ethanol", smiles: "CCO", concentration: 40 }],
    "eye",
  );
  const result = synced.nodes.find((node) => node.type === "result");

  assert.equal(result?.data.region, "eye");
  assert.equal(result?.data.status, "idle");
  assert.equal(result?.data.endpoints, undefined);
});

test("sync reuses a positional node when its chemical identity is replaced", () => {
  const graph = buildFormulaGraphSnapshot(
    [{ name: "Ethanol", smiles: "CCO", concentration: 40 }],
    "face",
  );
  graph.nodes[0].position = { x: 155, y: 275 };

  const synced = synchronizeGraphWithFormula(
    graph,
    [{ name: "Glycerin", smiles: "OCC(O)CO", concentration: 12 }],
    "face",
  );

  const chemical = synced.nodes.find((node) => node.type === "substance");
  assert.equal(chemical?.id, "s1");
  assert.equal(chemical?.data.smiles, "OCC(O)CO");
  assert.deepEqual(chemical?.position, { x: 155, y: 275 });
  assert.equal(synced.edges.some((edge) => edge.source === "s1" && edge.target === "r1"), true);
});

test("sync preserves an explicitly empty graph after reload", () => {
  const emptyGraph = {
    nodes: [],
    edges: [],
    viewport: { x: 12, y: -8, zoom: 1.25 },
  };

  const synced = synchronizeGraphWithFormula(emptyGraph, [], "face");

  assert.deepEqual(synced, emptyGraph);
});

test("result scope excludes unconnected chemicals from assessment selection", () => {
  const graph = buildFormulaGraphSnapshot(
    [
      { name: "Ethanol", smiles: "CCO", concentration: 40 },
      { name: "Glycerin", smiles: "OCC(O)CO", concentration: 10 },
    ],
    "face",
  );
  graph.nodes.splice(2, 0, {
    id: "m1",
    type: "modifier",
    position: { x: 330, y: 40 },
    data: {
      name: "Panthenol",
      smiles: "CC(C)(CO)C(O)C(=O)NCCC(O)CO",
      concentration: 2,
    },
  });
  graph.edges = graph.edges.filter((edge) => edge.source !== "s2");
  graph.edges.push({ id: "e-s1-m1", source: "s1", target: "m1" });
  graph.edges.push({ id: "e-m1-r1", source: "m1", target: "r1" });

  const scope = formulaResultScope(graph, "r1");

  assert.deepEqual(scope.connectedChemicalNodeIds, ["s1", "m1"]);
  assert.deepEqual(scope.disconnectedChemicalNodeIds, ["s2"]);
  assert.deepEqual(scope.items.map((item) => item.name), ["Ethanol", "Panthenol"]);
  assert.equal(scope.items.some((item) => item.name === "Glycerin"), false);
});

test("result scope terminates safely when an upstream graph contains a cycle", () => {
  const graph = buildFormulaGraphSnapshot(
    [{ name: "Ethanol", smiles: "CCO", concentration: 40 }],
    "eye",
  );
  graph.edges.push({ id: "e-r1-s1", source: "r1", target: "s1" });

  const scope = formulaResultScope(graph, "r1");

  assert.deepEqual(scope.connectedChemicalNodeIds, ["s1"]);
  assert.deepEqual(scope.disconnectedChemicalNodeIds, []);
});

test("save scope includes only chemicals connected to a Result node", () => {
  const graph = buildFormulaGraphSnapshot(
    [
      { name: "Isopropanol", smiles: "CC(C)O", concentration: 30 },
      { name: "Propylene Glycol", smiles: "CC(O)CO", concentration: 10 },
      { name: "Butylene Glycol", smiles: "CC(O)CCO", concentration: 8 },
      { name: "Ethylhexylglycerin", smiles: "CCCCCC(CC)COCC(O)CO", concentration: 1 },
    ],
    "face",
  );
  graph.edges = graph.edges.filter(
    (edge) => edge.source === "s1" || edge.source === "s3",
  );

  const items = formulaItemsConnectedToResults(graph);

  assert.deepEqual(items.map((item) => item.name), ["Isopropanol", "Butylene Glycol"]);
  assert.equal(items.some((item) => item.name === "Propylene Glycol"), false);
  assert.equal(items.some((item) => item.name === "Ethylhexylglycerin"), false);
});
