import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFormulaGraphSnapshot,
  formulaItemsFromGraph,
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
