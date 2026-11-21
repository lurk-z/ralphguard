"use client";

import { useState } from "react";
import Image from "next/image";
import { BoxSelect, ChevronDown, FlaskConical, GitBranch, Hand, Layers, Maximize, Minus, Plus, Sprout, Target } from "lucide-react";
import ReactFlow, { Background, Handle, MiniMap, Panel, Position, ReactFlowProvider, SelectionMode, useNodesState, useReactFlow, type Edge, type Node, type NodeProps } from "reactflow";
import { endpoints, formulas, substances, type VersionId } from "./example";

type Formula = (typeof formulas)[number];
type CardData = { formula: Formula; active: boolean; select: () => void };
type IngredientData = { name: typeof substances[number]; amount: number };
const smiles = { Water: "O", Ethanol: "CCO", Glycerin: "OCC(O)CO" };
const positions = [{ x: 237, y: 0 }, { x: 0, y: 288 }, { x: 474, y: 288 }];
const fmt = (score: number | null) => score === null ? "—" : score;

function FormulaCard({ data }: NodeProps<CardData>) {
  const f = data.formula;
  return <div className={`np-card ${data.active ? "np-active" : ""}`}>
    {f.parent ? <Handle type="target" position={Position.Top} id="parent" /> : <>
      <Handle type="source" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
    </>}
    <Handle type="target" position={Position.Bottom} id="composition" />
    <button type="button" className="np-card-button" aria-label={`ดูสูตร ${f.id} ${f.name}`} aria-pressed={data.active} onClick={data.select}>
      <span className="np-card-top"><strong><Target size={15} /> {f.id}</strong><span className={`np-tag ${f.tone}`}>{f.status}</span></span>
      <b>{f.name}</b>
      <span className="np-parent">{f.parent ? `ต่อจาก ${f.parent}` : "สูตรตั้งต้น"}</span>
      <span className="np-card-scores">{["ผิว", "ตา", "แพ้", "พิษ"].map((s, i) => <span key={s}>{s} <b>{fmt(f.scores[i])}</b></span>)}</span>
    </button>
  </div>;
}

function SubstanceCard({ data }: NodeProps<IngredientData>) {
  return <div className="np-ingredient"><Handle type="source" position={Position.Top} />
    <span className="np-ingredient-head"><FlaskConical size={14} />{data.name}</span>
    <span className="np-ingredient-body"><code>{smiles[data.name]}</code><strong>{data.amount}%</strong></span>
  </div>;
}

const nodeTypes = { formula: FormulaCard, substance: SubstanceCard };
function makeGraph() {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  formulas.forEach((f, index) => {
    const { x, y } = positions[index];
    nodes.push({ id: f.id, type: "formula", position: { x, y }, data: { formula: f } });
    if (f.parent) edges.push({ id: `branch-${f.id}`, source: f.parent, sourceHandle: index === 1 ? "left" : "right",
      target: f.id, targetHandle: "parent", className: "np-branch" });
    substances.forEach((name, i) => {
      const id = f.id + "-" + name;
      nodes.push({ id, type: "substance", position: { x: x - 87 + i * 140, y: y + 184 }, data: { name, amount: f.amounts[i] } });
      edges.push({ id: "edge-" + id, source: id, target: f.id, targetHandle: "composition" });
    });
  });
  return { nodes, edges };
}
const initialGraph = makeGraph();
const edgeDefaults = { animated: true, selectable: false };

function LineageWorkspace() {
  const [selected, setSelected] = useState<VersionId>("V2-A");
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes);
  const [selectTool, setSelectTool] = useState(true);
  const [showIngredients, setShowIngredients] = useState(true);
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const formula = formulas.find((item) => item.id === selected)!;
  const parent = formulas.find((item) => item.id === formula.parent);
  const graphNodes = nodes.map((node) => node.type === "formula"
    ? { ...node, data: { ...node.data, active: node.id === selected, select: () => setSelected(node.data.formula.id) } }
    : { ...node, hidden: !showIngredients });
  const edges = initialGraph.edges.filter((e) => showIngredients || e.id.startsWith("branch-"));
  return <main className="np">
    <header className="np-nav"><div className="np-brand"><Image src="/icons/logo-new.png" alt="" width={32} height={32} /> Ralph Lab</div>
      <span className="np-nav-path">/ <GitBranch size={15} /> Nodes</span><span className="np-preview"><i />ข้อมูลตัวอย่าง</span>
    </header>
    <div className="np-page">
      <div className="np-heading"><div><h1>สายวิวัฒนาการของสูตร</h1><p>การทดลองโทนเนอร์ <span>·</span> 3 รุ่น <span>·</span> 2 แนวทาง</p></div></div>
      <div className="np-workspace">
        <section className="np-graph" aria-label="แผนผังการทดลอง">
          <div className="np-panel-head"><h2><GitBranch size={18} /> ผังการทดลอง</h2>
            <button type="button" className="np-switch" aria-pressed={showIngredients} onClick={() => {
              if (showIngredients) setNodes((current) => current.map((node) =>
                node.type === "substance" && node.selected ? { ...node, selected: false } : node));
              setShowIngredients(!showIngredients);
            }}><Layers size={15} />แสดงสาร<span className="np-track" /></button>
          </div>
          <div className="np-canvas">
            <ReactFlow nodes={graphNodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
              nodesConnectable={false} deleteKeyCode={null} edgesFocusable={false} defaultEdgeOptions={edgeDefaults}
              selectionOnDrag={selectTool} selectionMode={SelectionMode.Partial} panOnDrag={selectTool ? [1, 2] : true}
              minZoom={0.3} maxZoom={2} fitView fitViewOptions={{ padding: 0.12, maxZoom: 1.35 }}
              proOptions={{ hideAttribution: true }}>
              <Background color="#CBD5E1" gap={18} size={1.1} />
              <MiniMap position="top-right" pannable zoomable className="np-map" nodeColor={(n) => n.id === selected ? "#009fa5" : n.type === "formula" ? "#94bfc4" : "#dce3eb"} maskColor="rgba(248,250,252,0.64)" />
              <Panel position="top-left"><div className="np-tools">
                <button aria-label="ลากกรอบเลือกกล่อง" title="ลากกรอบเลือกกล่อง" aria-pressed={selectTool} onClick={() => setSelectTool(true)}><BoxSelect size={16} /></button>
                <button aria-label="เลื่อนผัง" title="เลื่อนผัง" aria-pressed={!selectTool} onClick={() => setSelectTool(false)}><Hand size={16} /></button>
                <button aria-label="ซูมออก" onClick={() => zoomOut({ duration: 180 })}><Minus size={16} /></button>
                <button aria-label="ซูมเข้า" onClick={() => zoomIn({ duration: 180 })}><Plus size={16} /></button>
                <button aria-label="แสดงทั้งผัง" onClick={() => fitView({ padding: 0.12, maxZoom: 1.35, duration: 250 })}><Maximize size={15} /></button>
              </div></Panel>
            </ReactFlow>
          </div>
          <div className="np-legend"><span><i />สายการทดลอง</span><span><i />ส่วนผสมของรุ่น</span></div>
        </section>
        <aside className="np-details" aria-label="รายละเอียดสูตร">
          <div className="np-panel-head"><h2><FlaskConical size={17} /> รายละเอียดสูตร</h2>
            <label className="np-select"><select aria-label="เลือกรุ่นสูตร" value={selected} onChange={(e) => setSelected(e.target.value as VersionId)}>{formulas.map((f) => <option key={f.id}>{f.id}</option>)}</select><ChevronDown size={13} /></label>
          </div>
          <div className="np-inside">
            <div className="np-detail-tags"><b>{formula.id}</b><span className={`np-tag ${formula.tone}`}>{formula.status}</span></div>
            <h3>{formula.name}</h3>
            <div className="np-author"><Image src="/images/lab-agents/formulator-Photoroom.png" alt="" width={28} height={28} />นักพัฒนาสูตร <span>·</span> {parent ? `ต่อจาก ${parent.id}` : "รุ่นเริ่มต้น"}</div>
            <section><h4>ผลคัดกรอง 4 ด้าน <small>คะแนน / 100</small></h4>
              {endpoints.map((label, i) => <div key={label} className="np-score"><span>{label}</span><div className="np-rail"><i style={{ width: (formula.scores[i] ?? 0) + "%" }} /></div><b aria-label={formula.scores[i] === null ? "ยังสรุปไม่ได้" : undefined}>{fmt(formula.scores[i])}</b></div>)}
            </section>
            <section><h4>{parent ? "สิ่งที่ปรับจาก V1" : "ส่วนผสมตั้งต้น"}</h4>
              {substances.map((name, i) => (!parent || parent.amounts[i] !== formula.amounts[i]) && <div className="np-change" key={name}><span>{name}</span><span>{parent && <><s>{parent.amounts[i]}%</s> → </>}<b>{formula.amounts[i]}%</b></span></div>)}
            </section>
            <div className="np-note"><h4><Sprout size={17} /> บันทึกผู้ประเมิน</h4><p>{formula.finding}</p><p><b>ข้อจำกัด</b> {formula.limit}</p></div>
          </div>
        </aside>
      </div>
    </div>
  </main>;
}

export default function NodesPreview() {
  return <ReactFlowProvider><LineageWorkspace /></ReactFlowProvider>;
}
