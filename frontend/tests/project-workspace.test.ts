import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteProjectWorkspace,
  FORMULA_GRAPH_DRAFT_ID,
  formulaAssessmentSignature,
  loadProjectWorkspace,
  normalizeFormulaGraphSnapshot,
  normalizeProjectWorkspace,
  saveProjectWorkspace,
  type ProjectWorkspaceDraft,
  type WorkspaceStorage,
} from "../src/lib/project-workspace.ts";

class MemoryStorage implements WorkspaceStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const draft = (name: string): ProjectWorkspaceDraft => ({
  formulas: [
    {
      id: "formula-1",
      name,
      type: "ครีม / โลชั่น",
      region: "face",
      items: [{ name: "Ethanol", smiles: "CCO", concentration: 40 }],
    },
  ],
  activeFormulaId: "formula-1",
  region: "face",
  dayIdx: 2,
  mode: "assess",
  formulaPanelOpen: false,
  assessmentByFormulaId: {},
  paintByFormulaId: {},
  graphByFormulaId: {},
});

test("saves and restores workspaces independently by project id", () => {
  const storage = new MemoryStorage();
  assert.equal(saveProjectWorkspace(1, draft("Project one"), storage), true);
  assert.equal(saveProjectWorkspace(2, draft("Project two"), storage), true);

  assert.equal(loadProjectWorkspace(1, storage)?.formulas[0].name, "Project one");
  assert.equal(loadProjectWorkspace(2, storage)?.formulas[0].name, "Project two");
});

test("normalizes unsafe browser data before restoring it", () => {
  const workspace = normalizeProjectWorkspace({
    version: 1,
    formulas: [
      {
        id: "formula-1",
        name: "Formula",
        items: [
          { name: "Too high", smiles: "CCO", concentration: 140 },
          { name: "Invalid", smiles: "CCC", concentration: "not-a-number" },
        ],
      },
      { id: "formula-1", name: "Duplicate", items: [] },
    ],
    activeFormulaId: "missing",
    region: "unknown",
    dayIdx: 99,
    mode: "unknown",
    formulaPanelOpen: "no",
  });

  assert.ok(workspace);
  assert.equal(workspace.formulas.length, 1);
  assert.equal(workspace.formulas[0].items.length, 1);
  assert.equal(workspace.formulas[0].items[0].concentration, 100);
  assert.equal(workspace.activeFormulaId, "formula-1");
  assert.equal(workspace.region, "face");
  assert.equal(workspace.dayIdx, 1);
  assert.equal(workspace.mode, "assess");
  assert.equal(workspace.formulaPanelOpen, true);
});

test("supports an empty formula workspace and rejects unsupported or invalid projects", () => {
  const storage = new MemoryStorage();
  assert.equal(normalizeProjectWorkspace({ version: 2, formulas: [] }), null);
  const emptyWorkspace = normalizeProjectWorkspace({
    version: 1,
    formulas: [],
    activeFormulaId: "missing",
  });
  assert.ok(emptyWorkspace);
  assert.deepEqual(emptyWorkspace.formulas, []);
  assert.equal(emptyWorkspace.activeFormulaId, "");
  assert.equal(saveProjectWorkspace(0, draft("Invalid"), storage), false);
  assert.equal(loadProjectWorkspace(-1, storage), null);
});

test("saves and restores a workspace after its last formula is deleted", () => {
  const storage = new MemoryStorage();
  const emptyDraft: ProjectWorkspaceDraft = {
    ...draft("Deleted"),
    formulas: [],
    activeFormulaId: "",
  };

  assert.equal(saveProjectWorkspace(1, emptyDraft, storage), true);
  const restored = loadProjectWorkspace(1, storage);
  assert.ok(restored);
  assert.deepEqual(restored.formulas, []);
  assert.equal(restored.activeFormulaId, "");
});

test("preserves an explicit no-formula selection when formulas still exist", () => {
  const storage = new MemoryStorage();
  const deselectedDraft: ProjectWorkspaceDraft = {
    ...draft("Deselected"),
    activeFormulaId: "",
  };

  assert.equal(saveProjectWorkspace(1, deselectedDraft, storage), true);
  const restored = loadProjectWorkspace(1, storage);
  assert.ok(restored);
  assert.equal(restored.formulas.length, 1);
  assert.equal(restored.activeFormulaId, "");
});

test("deletes only the selected project's workspace", () => {
  const storage = new MemoryStorage();
  saveProjectWorkspace(1, draft("Project one"), storage);
  saveProjectWorkspace(2, draft("Project two"), storage);

  assert.equal(deleteProjectWorkspace(1, storage), true);
  assert.equal(loadProjectWorkspace(1, storage), null);
  assert.equal(loadProjectWorkspace(2, storage)?.formulas[0].name, "Project two");
});

test("assessment signatures ignore names and order but detect material changes", () => {
  const first = formulaAssessmentSignature(
    [
      { name: "Ethanol", smiles: "CCO", concentration: 40 },
      { name: "Glycerin", smiles: "OCC(O)CO", concentration: 10 },
    ],
    "face",
  );
  const reorderedAndRenamed = formulaAssessmentSignature(
    [
      { name: "Renamed", smiles: "OCC(O)CO", concentration: 10 },
      { name: "Alcohol", smiles: "CCO", concentration: 40 },
    ],
    "face",
  );

  assert.equal(first, reorderedAndRenamed);
  assert.notEqual(
    first,
    formulaAssessmentSignature([{ smiles: "CCO", concentration: 41 }], "face"),
  );
  assert.notEqual(
    first,
    formulaAssessmentSignature(
      [
        { smiles: "CCO", concentration: 40 },
        { smiles: "OCC(O)CO", concentration: 10 },
      ],
      "eye",
    ),
  );
});

test("persists an assessment only under its owning formula", () => {
  const storage = new MemoryStorage();
  const workspace = draft("Formula with result");
  const inputSignature = formulaAssessmentSignature(workspace.formulas[0].items, "face");
  workspace.assessmentByFormulaId = {
    "formula-1": {
      inputSignature,
      jobId: "job-1",
      startedAt: "2026-07-21T00:00:00Z",
      assessment: {
        id: "job-1",
        status: "completed",
        region: "face",
        formula: workspace.formulas[0].items,
        result: {
          region: "face",
          endpoints: {},
          substances: [],
          errors: [],
          disclaimer_th: "screening only",
        },
        error: null,
        created_at: "2026-07-21T00:00:00Z",
        completed_at: "2026-07-21T00:00:01Z",
      },
    },
    missing: {
      inputSignature: "invalid-owner",
      jobId: "job-2",
      startedAt: "2026-07-21T00:00:00Z",
      assessment: null,
    },
  };

  assert.equal(saveProjectWorkspace(1, workspace, storage), true);
  const restored = loadProjectWorkspace(1, storage);
  assert.equal(restored?.assessmentByFormulaId["formula-1"]?.assessment?.id, "job-1");
  assert.equal(restored?.assessmentByFormulaId.missing, undefined);
});

test("persists only valid paint masks under their owning formula", () => {
  const storage = new MemoryStorage();
  const workspace = draft("Painted formula");
  workspace.paintByFormulaId = {
    "formula-1": {
      exposure: "data:image/png;base64,EXPOSURE",
      redness: "data:image/png;base64,AAAA",
      papule: "not-a-data-url",
      hasPaint: true,
    },
    missing: {
      redness: "data:image/png;base64,BBBB",
    },
  };

  assert.equal(saveProjectWorkspace(1, workspace, storage), true);
  const restored = loadProjectWorkspace(1, storage);
  assert.equal(
    restored?.paintByFormulaId["formula-1"]?.exposure,
    "data:image/png;base64,EXPOSURE",
  );
  assert.equal(
    restored?.paintByFormulaId["formula-1"]?.redness,
    "data:image/png;base64,AAAA",
  );
  assert.equal(restored?.paintByFormulaId["formula-1"]?.papule, undefined);
  assert.equal(restored?.paintByFormulaId["formula-1"]?.hasPaint, true);
  assert.equal(restored?.paintByFormulaId.missing, undefined);
});

test("keeps legacy paint presence unknown until its mask is inspected", () => {
  const workspace = normalizeProjectWorkspace({
    version: 1,
    formulas: [
      {
        id: "formula-1",
        name: "Legacy paint",
        items: [],
      },
    ],
    paintByFormulaId: {
      "formula-1": {
        redness: "data:image/png;base64,LEGACY",
      },
    },
  });

  assert.ok(workspace);
  assert.equal(workspace.paintByFormulaId["formula-1"]?.hasPaint, undefined);
  assert.equal(
    workspace.paintByFormulaId["formula-1"]?.redness,
    "data:image/png;base64,LEGACY",
  );
});

test("persists node graphs independently under their owning formula", () => {
  const storage = new MemoryStorage();
  const workspace = draft("Formula graph");
  workspace.formulas.push({
    id: "formula-2",
    name: "Second formula",
    type: "เซรั่ม / เอสเซนส์",
    region: "eye",
    items: [{ name: "Glycerin", smiles: "OCC(O)CO", concentration: 8 }],
  });
  workspace.graphByFormulaId = {
    "formula-1": {
      nodes: [
        {
          id: "s1",
          type: "substance",
          position: { x: 24, y: 48 },
          data: { name: "Ethanol", smiles: "CCO", concentration: 40 },
        },
        {
          id: "r1",
          type: "result",
          position: { x: 420, y: 48 },
          data: {
            region: "face",
            status: "completed",
            endpoints: { skin: { peak_score: 36, timecourse: [22, 36, 18] } },
          },
        },
      ],
      edges: [{ id: "e1", source: "s1", target: "r1", animated: true }],
      viewport: { x: 10, y: 20, zoom: 1.2 },
    },
    "formula-2": {
      nodes: [
        {
          id: "s1",
          type: "substance",
          position: { x: 80, y: 120 },
          data: { name: "Glycerin", smiles: "OCC(O)CO", concentration: 8 },
        },
      ],
      edges: [],
      viewport: { x: -10, y: 4, zoom: 0.8 },
    },
    missing: {
      nodes: [{ id: "bad", type: "substance", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };

  assert.equal(saveProjectWorkspace(1, workspace, storage), true);
  const restored = loadProjectWorkspace(1, storage);
  assert.equal(restored?.graphByFormulaId["formula-1"]?.nodes.length, 2);
  assert.equal(
    restored?.graphByFormulaId["formula-1"]?.nodes[1].data.endpoints?.skin.peak_score,
    36,
  );
  assert.deepEqual(
    restored?.graphByFormulaId["formula-1"]?.nodes[1].data.endpoints?.skin.timecourse,
    [22, 36, 18],
  );
  assert.equal(restored?.graphByFormulaId["formula-1"]?.viewport.zoom, 1.2);
  assert.equal(
    restored?.graphByFormulaId["formula-2"]?.nodes[0].data.smiles,
    "OCC(O)CO",
  );
  assert.equal(restored?.graphByFormulaId["formula-2"]?.viewport.zoom, 0.8);
  assert.equal(restored?.graphByFormulaId.missing, undefined);
});

test("persists an intentionally empty node graph instead of restoring defaults", () => {
  const storage = new MemoryStorage();
  const workspace = draft("Empty graph");
  workspace.mode = "nodes";
  workspace.graphByFormulaId = {
    "formula-1": {
      nodes: [],
      edges: [],
      viewport: { x: 25, y: -15, zoom: 1.35 },
    },
  };

  assert.equal(saveProjectWorkspace(1, workspace, storage), true);
  const restored = loadProjectWorkspace(1, storage);

  assert.ok(restored);
  assert.equal(restored.mode, "nodes");
  assert.equal(Object.hasOwn(restored.graphByFormulaId, "formula-1"), true);
  assert.deepEqual(restored.graphByFormulaId["formula-1"].nodes, []);
  assert.deepEqual(restored.graphByFormulaId["formula-1"].edges, []);
  assert.deepEqual(
    restored.graphByFormulaId["formula-1"].viewport,
    { x: 25, y: -15, zoom: 1.35 },
  );
});

test("persists a project graph draft when the workspace has no formula", () => {
  const storage = new MemoryStorage();
  const workspace: ProjectWorkspaceDraft = {
    ...draft("Standalone graph"),
    formulas: [],
    activeFormulaId: "",
    mode: "nodes",
    graphByFormulaId: {
      [FORMULA_GRAPH_DRAFT_ID]: {
        nodes: [
          {
            id: "s1",
            type: "substance",
            position: { x: 90, y: 140 },
            data: { name: "Ethanol", smiles: "CCO", concentration: 40 },
          },
        ],
        edges: [],
        viewport: { x: 5, y: -12, zoom: 1.15 },
      },
    },
  };

  assert.equal(saveProjectWorkspace(77, workspace, storage), true);
  const restored = loadProjectWorkspace(77, storage);

  assert.ok(restored);
  assert.equal(restored.activeFormulaId, "");
  assert.equal(
    restored.graphByFormulaId[FORMULA_GRAPH_DRAFT_ID]?.nodes[0].data.smiles,
    "CCO",
  );
  assert.deepEqual(
    restored.graphByFormulaId[FORMULA_GRAPH_DRAFT_ID]?.viewport,
    { x: 5, y: -12, zoom: 1.15 },
  );
});

test("normalizes an empty graph snapshot as valid project data", () => {
  assert.deepEqual(
    normalizeFormulaGraphSnapshot({
      nodes: [],
      edges: [{ id: "orphan", source: "missing-a", target: "missing-b" }],
      viewport: { x: 0, y: 0, zoom: 1 },
    }),
    {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  );
});

test("sanitizes corrupt node graph data during restore", () => {
  const workspace = normalizeProjectWorkspace({
    ...draft("Unsafe graph"),
    version: 1,
    graphByFormulaId: {
      "formula-1": {
        nodes: [
          {
            id: "s1",
            type: "substance",
            position: { x: Number.POSITIVE_INFINITY, y: -200_000 },
            data: { name: "Unsafe", smiles: "CC", concentration: 999 },
          },
          { id: "invalid", type: "script", position: { x: 0, y: 0 }, data: {} },
        ],
        edges: [{ id: "bad-edge", source: "s1", target: "missing" }],
        viewport: { x: 0, y: 0, zoom: 999 },
      },
    },
  });

  const graph = workspace?.graphByFormulaId["formula-1"];
  assert.ok(graph);
  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0].data.concentration, 100);
  assert.equal(graph.nodes[0].position.x, 0);
  assert.equal(graph.nodes[0].position.y, -100_000);
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.viewport.zoom, 4);
});
