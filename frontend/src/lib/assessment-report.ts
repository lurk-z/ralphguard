import type {
  AssessmentRecord,
  FormulaItem,
  ModelInfoPayload,
  ModelMetricsPayload,
} from "@/lib/api";

const ENDPOINT_KEYS = ["skin", "eye", "sens", "acute"] as const;
const DAY_LABELS = [1, 3, 7] as const;
const ENDPOINT_LABELS = {
  skin: "ระคายเคืองผิว",
  eye: "ระคายเคืองตา",
  sens: "แพ้ผิวหนัง",
  acute: "พิษเฉียบพลันต่อร่างกาย",
} as const;
const ENDPOINT_COLORS = {
  skin: "#F43F5E",
  eye: "#06B6D4",
  sens: "#8B5CF6",
  acute: "#D97706",
} as const;
const BAND_COLORS = {
  low: "#15803D",
  moderate: "#B45309",
  high: "#C2410C",
  severe: "#B91C1C",
} as const;
const BAND_LABELS = {
  low: "ต่ำ",
  moderate: "ปานกลาง",
  high: "สูง",
  severe: "รุนแรง",
} as const;
const CONFIDENCE_LABELS: Record<string, string> = {
  High: "สูง",
  Medium: "ปานกลาง",
  Low: "ต่ำ",
};

type RiskBand = keyof typeof BAND_COLORS;

export type AssessmentReportInput = {
  projectName: string;
  projectId: number | null;
  formulaName: string;
  formulaType: string;
  regionLabel: string;
  formula: FormulaItem[];
  assessment: AssessmentRecord | null;
  modelMetrics: ModelMetricsPayload | null;
  modelInfo: ModelInfoPayload | null;
  generatedAt: Date;
  logoUrl: string;
};

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const bandOf = (score: number): RiskBand =>
  score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "severe";

const percent = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}%`;
};

export function buildAssessmentReportHtml(input: AssessmentReportInput) {
  const result = input.assessment?.result ?? null;
  const endpoints = result?.endpoints ?? null;
  const completed = input.assessment?.status === "completed" && Boolean(endpoints);
  const generatedDate = input.generatedAt.toLocaleString("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const assessedDate = input.assessment?.completed_at
    ? new Date(input.assessment.completed_at).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    })
    : "ยังไม่ประเมินสำเร็จ";
  const assessmentId = input.assessment?.id ?? "DRAFT";
  const reportId = `RG-${input.projectId ?? "LOCAL"}-${assessmentId.slice(0, 8).toUpperCase()}`;
  const coverage = result?.formula_coverage;
  const ingredientAssessments = result?.ingredient_assessments ?? [];
  const totalConcentration = input.formula.reduce(
    (sum, item) => sum + Number(item.concentration || 0),
    0,
  );

  const riskSeries = ENDPOINT_KEYS.map((key) => {
    const endpoint = endpoints?.[key];
    const scores = DAY_LABELS.map((_, index) =>
      Math.round(endpoint?.timecourse?.[index] ?? endpoint?.peak_score ?? 0),
    );
    const peakScore = Math.max(...scores);
    return {
      key,
      label: ENDPOINT_LABELS[key],
      color: ENDPOINT_COLORS[key],
      scores,
      peakScore,
      peakDay: DAY_LABELS[scores.indexOf(peakScore)],
      band: bandOf(peakScore),
      confidence: endpoint?.confidence ?? null,
    };
  });
  const topRisk = riskSeries.reduce((highest, current) =>
    current.peakScore > highest.peakScore ? current : highest,
  );
  const confidenceOrder: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
  const availableConfidence = riskSeries.filter((item) => item.confidence);
  const overallConfidence = availableConfidence.length
    ? availableConfidence.reduce((lowest, current) =>
      (confidenceOrder[current.confidence?.level ?? ""] ?? 0) <
        (confidenceOrder[lowest.confidence?.level ?? ""] ?? 0)
        ? current
        : lowest,
    ).confidence
    : null;
  const outOfDomainCount = riskSeries.filter(
    (item) => item.confidence?.in_domain === false,
  ).length;
  const metricByEndpoint = new Map(
    (input.modelMetrics?.endpoints ?? []).map((item) => [item.endpoint, item]),
  );

  // ── Derived values ──────────────────────────────────────────────────────
  const methodology = input.modelInfo?.methodology ?? {};
  const limitations = Array.isArray(methodology.limitations)
    ? (methodology.limitations as string[]).slice(0, 4)
    : [];
  const coverageResolved = coverage
    ? coverage.qsar_assessed_ingredients + coverage.known_carrier_ingredients
    : ingredientAssessments.filter((item) => item.resolved).length;
  const coveragePct = coverage ? `${coverage.coverage_percentage}%` : "&mdash;";
  const overallConfLabel = overallConfidence
    ? (CONFIDENCE_LABELS[overallConfidence.level] ?? esc(overallConfidence.level))
    : "&mdash;";
  const overallRiskColor = completed ? BAND_COLORS[topRisk.band] : "#64747B";

  // ── SVG line chart ──────────────────────────────────────────────────────
  // ViewBox 320x160 for a compact horizontal aspect ratio (~2:1)
  const SX = 320, SY = 160;
  const PL = 28, PB = 18, PT = 10, PR = 10;
  const PW = SX - PL - PR, PH = SY - PT - PB;
  const dx = DAY_LABELS.map((_, i) => PL + (i / (DAY_LABELS.length - 1)) * PW);
  const sy = (s: number) =>
    +(PT + PH * (1 - Math.max(0, Math.min(100, s)) / 100)).toFixed(1);

  const svgGrid = [0, 25, 50, 75, 100]
    .map((v) => {
      const y = sy(v);
      return (
        `<line x1="${PL}" y1="${y}" x2="${PL + PW}" y2="${y}"` +
        ` stroke="${v === 0 ? "#9BADB5" : "#E2EBF0"}" stroke-width="${v === 0 ? 1.5 : 0.8}"/>` +
        `<text x="${PL - 4}" y="${+y + 3}" font-size="8.5" fill="#64747B" text-anchor="end">${v}</text>`
      );
    })
    .join("");

  const svgXLabels = DAY_LABELS.map(
    (d, i) =>
      `<text x="${dx[i]}" y="${SY - 2}" font-size="9" fill="#64747B" text-anchor="middle">Day ${d}</text>`,
  ).join("");

  const svgLines = riskSeries
    .map((ep) => {
      const pts = ep.scores.map((s, i) => `${dx[i]},${sy(s)}`).join(" ");
      const dots = ep.scores
        .map(
          (s, i) =>
            `<circle cx="${dx[i]}" cy="${sy(s)}" r="4" fill="${ep.color}" stroke="#fff" stroke-width="1.5"/>`,
        )
        .join("");
      const pkI = ep.scores.indexOf(ep.peakScore);
      return (
        `<polyline points="${pts}" fill="none" stroke="${ep.color}" stroke-width="2"` +
        ` stroke-linejoin="round" stroke-linecap="round"/>` +
        dots +
        `<text x="${dx[pkI]}" y="${+sy(ep.peakScore) - 6}" font-size="10"` +
        ` fill="${ep.color}" text-anchor="middle" font-weight="600">${ep.peakScore}</text>`
      );
    })
    .join("");

  const svgChart =
    `<svg viewBox="0 0 ${SX} ${SY}" xmlns="http://www.w3.org/2000/svg"` +
    ` preserveAspectRatio="xMinYMin meet" style="width:100%;height:100%;display:block;overflow:visible">` +
    svgGrid +
    `<line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT + PH}" stroke="#9BADB5" stroke-width="1.5"/>` +
    svgXLabels +
    svgLines +
    `</svg>`;

  // Use inline SVG lines for legend (avoids any non-ASCII in inline styles)
  const chartLegend = riskSeries
    .map(
      (ep) =>
        `<span style="display:inline-flex;align-items:center;gap:2px;font-size:6pt;color:#243B45;margin-right:7px">` +
        `<svg width="15" height="2" style="display:inline-block;overflow:visible">` +
        `<line x1="0" y1="1" x2="15" y2="1" stroke="${ep.color}" stroke-width="2"/></svg>` +
        esc(ep.label) +
        `</span>`,
    )
    .join("");

  // ── Table rows ──────────────────────────────────────────────────────────
  const riskRows = riskSeries
    .map(
      (ep) =>
        `<tr>` +
        `<td style="white-space:nowrap">${esc(ep.label)}</td>` +
        ep.scores.map((s) => `<td class="tn">${completed ? s : "&mdash;"}</td>`).join("") +
        `<td class="tn" style="font-weight:600;color:${BAND_COLORS[ep.band]}">` +
        `${completed ? `${ep.peakScore}/100` : "&mdash;"}</td>` +
        `<td style="color:${BAND_COLORS[ep.band]};font-weight:600;white-space:nowrap">` +
        `${completed ? esc(BAND_LABELS[ep.band]) : "&mdash;"}</td>` +
        `</tr>`,
    )
    .join("");

  const formulaRows = input.formula.length
    ? input.formula
      .map((item, idx) => {
        const assessment = ingredientAssessments[idx];
        const unresolved = completed && assessment && !assessment.resolved;
        return (
          `<tr${unresolved ? ' style="background:#FFF9ED"' : ""}>` +
          `<td class="tn">${idx + 1}</td>` +
          `<td>${esc(item.name || "&mdash;")}</td>` +
          `<td class="tn">${Number(item.concentration).toFixed(2)}</td>` +
          `<td style="color:${unresolved ? "#B45309" : completed ? "#299764" : "#64747B"};font-weight:600">` +
          `${unresolved ? "Review" : completed ? "Assessed" : "Pending"}</td>` +
          `</tr>`
        );
      })
      .join("")
    : `<tr><td colspan="4" style="text-align:center;color:#64747B;padding:3mm">ยังไม่มีสารในสูตร</td></tr>`;

  const reliabilityRows = riskSeries
    .map((ep) => {
      const conf = ep.confidence;
      const metric = metricByEndpoint.get(ep.key)?.metrics;
      const inDomain = conf?.in_domain;
      const dc = inDomain === true ? "#299764" : inDomain === false ? "#E5484D" : "#64747B";
      const confLevelText = conf ? (CONFIDENCE_LABELS[conf.level] ?? esc(conf.level)) : "";
      const confText = conf
        ? `${percent(conf.score)} <span style="font-size:6pt;color:#64747B;font-weight:400">(${confLevelText})</span>`
        : "&mdash;";
      const domainText = conf
        ? `${inDomain ? "In Domain" : "Out of Domain"} <span style="font-size:6pt;color:#64747B;font-weight:400">(Sim. ${percent(conf.domain_similarity)})</span>`
        : "&mdash;";
      return (
        `<tr>` +
        `<td style="white-space:nowrap">${esc(ep.label)}</td>` +
        `<td class="tn" style="white-space:nowrap">${confText}</td>` +
        `<td style="color:${dc};font-weight:600;white-space:nowrap">${domainText}</td>` +
        `<td class="tn">${metric ? percent(metric.balanced_accuracy) : "&mdash;"}</td>` +
        `</tr>`
      );
    })
    .join("");

  // ── Interpretation items (use HTML entities for special chars) ──────────
  const keyInterpItems = completed
    ? [
      `Primary concern: <b>${esc(ENDPOINT_LABELS[topRisk.key])}</b>`,
      `Peak risk score: <b style="color:${BAND_COLORS[topRisk.band]}">${topRisk.peakScore}/100</b> (Day ${topRisk.peakDay})`,
      `Risk level: <b style="color:${BAND_COLORS[topRisk.band]}">${esc(BAND_LABELS[topRisk.band])}</b>`,
      `Formula coverage: <b>${coveragePct}</b> (${coverage ? `${coverageResolved}/${coverage.total_ingredients}` : "&mdash;"} ingredients)`,
      outOfDomainCount > 0
        ? `<b>${outOfDomainCount}</b> endpoint(s) outside applicability domain`
        : "All endpoints within applicability domain",
    ]
    : ["Please run assessment before using this report"];

  const limitationItems = [
    "Computational (in silico) screening only",
    "Not equivalent to laboratory testing",
    "Does not constitute regulatory certification",
    ...(limitations.length
      ? limitations
      : ["Interpret results with experimental evidence"]),
  ];

  const modelItems = [
    `Model: <b>RG-QSAR Ensemble v1.0</b>`,
    `Method: <b>${esc(typeof methodology.algorithm === "string" ? methodology.algorithm : "Soft-Voting Ensemble")}</b>`,
    ...(typeof methodology.features === "string"
      ? [`Features: ${esc(methodology.features)}`]
      : ["Components: RF, Extra Trees, Logistic Regression, HGB"]),
    ...(typeof methodology.validation === "string"
      ? [`Validation: ${esc(methodology.validation)}`]
      : []),
  ];

  const li = (items: string[]) => items.map((t) => `<li>${t}</li>`).join("");

  // ── CSS (all ASCII — no literal Unicode chars) ──────────────────────────
  // NOTE: Use \2013 for en-dash in CSS content, &ndash; in HTML.
  // Font: LINE Seed Sans TH (matches app-wide font).
  const FONT = '"LINE Seed Sans TH","Sarabun","Noto Sans Thai","Segoe UI",sans-serif';
  const MONO = 'ui-monospace,monospace';

  const css = [
    `@page{size:A4 portrait;margin:0}`,
    `*,*::before,*::after{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;padding:0}`,
    `html,body{background:#D1D8DC;font-family:${FONT};font-size:7.5pt;color:#243B45;line-height:1.35}`,
    `.page{position:relative;width:210mm;height:297mm;margin:8mm auto;background:#fff;overflow:hidden;display:flex;flex-direction:column}`,

    `.hdr{display:flex;align-items:center;justify-content:space-between;padding:5mm 11mm 3mm;gap:4mm;border-bottom:1pt solid #009FA5;flex-shrink:0}`,
    `.hdr-brand{display:flex;align-items:center;gap:2.5mm;flex-shrink:0}`,
    `.hdr-brand img{width:9mm;height:9mm;object-fit:contain}`,
    `.hdr-brand b{display:block;font-size:11pt;font-weight:700;color:#153A42}`,
    `.hdr-brand small{display:block;font-size:6pt;color:#64747B}`,
    `.hdr-center{flex:1;text-align:center;padding:0 3mm}`,
    `.hdr-ey{font-size:5.5pt;letter-spacing:0.14em;color:#009FA5;font-weight:700;text-transform:uppercase;margin-bottom:0.5mm}`,
    `.hdr-tt{font-size:15pt;font-weight:700;color:#153A42;line-height:1.1}`,
    `.hdr-sb{font-size:6pt;color:#64747B;margin-top:0.8mm}`,
    `.hdr-meta{text-align:right;flex-shrink:0}`,
    `.rid{display:block;font-family:${MONO};font-size:7.5pt;font-weight:600;color:#153A42;margin-bottom:0.8mm}`,
    `.hdr-meta span{display:block;font-size:6.5pt;color:#64747B;line-height:1.5}`,

    `.stitle{display:block;font-size:6.5pt;font-weight:700;color:#009FA5;letter-spacing:0.1em;text-transform:uppercase;padding-bottom:1.2mm;border-bottom:0.5pt solid #D5E1E5;margin-bottom:2.5mm}`,

    `.proj{padding:3.5mm 11mm 4mm;border-bottom:0.5pt solid #D5E1E5;flex-shrink:0}`,
    `.proj-grid{display:grid;grid-template-columns:1.2fr auto 1fr auto 1fr;gap:0}`,
    `.vcol{padding:0 3.5mm;display:flex;flex-direction:column;justify-content:space-evenly;gap:2mm}`,
    `.vdiv{width:0.5pt;background:#D5E1E5;align-self:stretch}`,
    `.pf label{display:block;font-size:5.5pt;font-weight:700;color:#64747B;letter-spacing:0.07em;text-transform:uppercase;margin-bottom:0.4mm}`,
    `.pf .v{font-size:8pt;font-weight:600;color:#153A42}`,
    `.pf .v.mono{font-family:${MONO};font-size:7pt}`,

    `.summ{padding:3.5mm 11mm 4mm;border-bottom:0.5pt solid #D5E1E5;flex-shrink:0}`,
    `.summ-strip{display:grid;grid-template-columns:60% 40%;height:16.5mm;border:0.5pt solid #D5E1E5}`,
    `.summ-left{display:grid;grid-template-columns:repeat(3,1fr);height:100%;border-right:0.5pt solid #D5E1E5}`,
    `.summ-right{display:grid;grid-template-columns:repeat(2,1fr);height:100%}`,
    `.si{padding:2.5mm 3mm;position:relative;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}`,
    `.si+.si::before{content:"";position:absolute;left:0;top:2mm;bottom:2mm;width:0.5pt;background:#D5E1E5}`,
    `.si label{display:block;font-size:5pt;font-weight:700;color:#64747B;letter-spacing:0.07em;text-transform:uppercase}`,
    `.kv{font-size:13pt;font-weight:700;line-height:1;margin-top:0.5mm}`,
    `.ks{font-size:5.5pt;color:#64747B;line-height:1.3}`,

    `.main{flex:1;min-height:0;display:grid;grid-template-columns:60% 40%;margin-bottom:12mm}`,
    `.ml{padding:4.5mm 4mm 4mm 11mm;border-right:0.5pt solid #D5E1E5;overflow:hidden;display:flex;flex-direction:column}`,
    `.mr{padding:4.5mm 11mm 4mm 4mm;overflow:hidden;display:flex;flex-direction:column}`,

    `table{width:100%;border-collapse:collapse;font-size:7pt}`,
    `thead th{background:#F5FAFA;font-size:6pt;font-weight:700;color:#64747B;text-align:left;padding:2.2mm 2.5mm;border:0.5pt solid #D5E1E5;white-space:nowrap;letter-spacing:0.03em}`,
    `tbody td{padding:2.2mm 2.5mm;border:0.5pt solid #D5E1E5;vertical-align:middle;color:#243B45}`,
    `tbody tr:nth-child(even) td{background:#FAFCFC}`,
    `tfoot td{padding:2.2mm 2.5mm;border:0.5pt solid #D5E1E5;font-weight:700;background:#F5FAFA;font-size:7pt}`,
    `.tn{text-align:center;font-family:${MONO};font-size:6.5pt}`,

    `.chart-blk{margin-top:5mm;display:flex;flex-direction:column;flex:1;min-height:0}`,
    `.chart-svg{width:100%;flex:1;min-height:50mm;max-height:75mm}`,
    `.gap{margin-top:5mm;flex-shrink:0}`,
    `.note{font-size:5.5pt;color:#64747B;margin-top:1.2mm}`,
    `.defs{margin-top:2.5mm}`,
    `.defs p{font-size:5.5pt;color:#64747B;line-height:1.4;margin-bottom:0.8mm}`,
    `.defs p b{color:#153A42}`,

    `.ftr-div{position:absolute;bottom:12mm;left:0;right:0;height:0.5pt;background:#D5E1E5}`,
    `.ftr{position:absolute;bottom:0;left:0;right:0;height:12mm;padding:2.5mm 11mm 1mm;display:flex;align-items:center;justify-content:space-between;gap:5mm}`,
    `.ftr-brand b{display:block;font-size:7pt;font-weight:700;color:#153A42}`,
    `.ftr-brand small{display:block;font-size:5.5pt;color:#64747B}`,
    `.ftr-mid{flex:1;text-align:center}`,
    `.ftr-mono{font-family:${MONO};font-size:6pt;color:#153A42;display:block;margin-bottom:0.5mm}`,
    `.ftr-disc{font-size:5.5pt;color:#64747B;line-height:1.4}`,
    `.ftr-pg b{display:block;font-size:7pt;font-weight:700;color:#153A42;text-align:right}`,
    `.ftr-pg small{display:block;font-size:5.5pt;color:#64747B;text-align:right;margin-top:0.5mm}`,

    `@media print{html,body{background:#fff}.page{margin:0}}`,
  ].join("");

  // ── HTML ────────────────────────────────────────────────────────────────
  return (
    `<!doctype html><html lang="th"><head>` +
    `<meta charset="utf-8">` +
    `<title>${esc(reportId)} &ndash; Scientific Screening Report</title>` +
    `<style>${css}</style>` +
    `</head><body>` +
    `<div class="page">` +

    // HEADER
    `<header class="hdr">` +
    `<div class="hdr-brand">` +
    `<img src="${esc(input.logoUrl)}" alt="RalphGuard">` +
    `<div><b>RalphGuard</b><small>Scientific Screening Platform</small></div>` +
    `</div>` +
    `<div class="hdr-center">` +
    `<div class="hdr-ey">SCIENTIFIC SCREENING REPORT</div>` +
    `<div class="hdr-tt">รายงานเเบบประเมินความเสี่ยงของสูตร</div>` +
    `<div class="hdr-sb">การประเมินความเสี่ยงของสารเคมีและองค์ประกอบสูตร</div>` +
    `</div>` +
    `<div class="hdr-meta">` +
    `<span class="rid">${esc(reportId)}</span>` +
    `<span>Assessment: ${esc(assessedDate)}</span>` +
    `</div>` +
    `</header>` +

    // 01 PROJECT INFORMATION
    `<section class="proj">` +
    `<div class="stitle">01 &nbsp; Project Information</div>` +
    `<div class="proj-grid">` +
    `<div class="vcol" style="padding-left:0">` +
    `<div class="pf"><label>Project / Formula</label><div class="v">${esc(input.projectName)} / ${esc(input.formulaName)}</div></div>` +
    `<div class="pf"><label>Product Type</label><div class="v">${esc(input.formulaType) || "&mdash;"}</div></div>` +
    `</div>` +
    `<div class="vdiv"></div>` +
    `<div class="vcol">` +
    `<div class="pf"><label>Total Ingredients</label><div class="v">${input.formula.length} รายการ</div></div>` +
    `<div class="pf"><label>Concentration Coverage</label><div class="v" style="color:#009FA5">${completed ? coveragePct : "&mdash;"}</div></div>` +
    `</div>` +
    `<div class="vdiv"></div>` +
    `<div class="vcol" style="padding-right:0">` +
    `<div class="pf"><label>Assessment Status</label><div class="v" style="color:${completed ? "#299764" : "#B45309"}">${completed ? "Completed" : "Pending"}</div></div>` +
    `</div>` +
    `</div>` +
    `</section>` +

    // 02 ASSESSMENT SUMMARY
    `<section class="summ">` +
    `<div class="stitle">02 &nbsp; Assessment Summary</div>` +
    `<div class="summ-strip">` +
    `<div class="summ-left">` +
    `<div class="si"><label>Overall Assessment</label>` +
    `<div class="kv" style="color:${overallRiskColor}">${completed ? esc(BAND_LABELS[topRisk.band]).toUpperCase() : "&mdash;"}</div>` +
    `<div class="ks">Risk Classification</div></div>` +
    `<div class="si"><label>Primary Concern</label>` +
    `<div class="kv" style="font-size:9pt">${completed ? esc(ENDPOINT_LABELS[topRisk.key]) : "&mdash;"}</div>` +
    `<div class="ks">${completed ? `Day ${topRisk.peakDay} &middot; Peak` : "&mdash;"}</div></div>` +
    `<div class="si"><label>Maximum Risk Score</label>` +
    `<div class="kv" style="color:${overallRiskColor}">${completed ? topRisk.peakScore : "&mdash;"}` +
    `<span style="font-size:7.5pt;color:#64747B;font-weight:400"> /100</span></div>` +
    `<div class="ks">${completed ? `${esc(ENDPOINT_LABELS[topRisk.key])} &middot; Day ${topRisk.peakDay}` : "&mdash;"}</div></div>` +
    `</div>` +
    `<div class="summ-right">` +
    `<div class="si"><label>Formula Coverage</label>` +
    `<div class="kv" style="color:#009FA5">${completed ? coveragePct : "&mdash;"}</div>` +
    `<div class="ks">${coverage ? `${coverageResolved}/${coverage.total_ingredients} ingredients` : "&mdash;"}</div></div>` +
    `<div class="si"><label>Overall Confidence</label>` +
    `<div class="kv" style="font-size:8.5pt">${overallConfLabel}</div>` +
    `<div class="ks">${outOfDomainCount > 0 ? `${outOfDomainCount} out-of-domain` : completed ? "All in domain" : "&mdash;"}</div></div>` +
    `</div>` +
    `</div>` +
    `</section>` +

    // MAIN 2-COLUMN (LEFT 60%, RIGHT 40%)
    `<div class="main">` +
    `<div class="ml">` +
    `<div class="stitle">03 &nbsp; Risk Scores by Endpoint</div>` +
    `<table><thead><tr>` +
    `<th style="white-space:nowrap">Endpoint</th><th class="tn">Day 1</th><th class="tn">Day 3</th>` +
    `<th class="tn">Day 7</th><th class="tn">Max Score</th><th>Risk Level</th>` +
    `</tr></thead><tbody>${riskRows}</tbody></table>` +
    `<div class="gap"></div>` +
    `<div class="stitle">05 &nbsp; Model Reliability</div>` +
    `<table><thead><tr>` +
    `<th style="white-space:nowrap">Endpoint</th><th class="tn" style="white-space:nowrap">Confidence</th>` +
    `<th style="white-space:nowrap">Applicability Domain</th><th class="tn" style="width:16mm;white-space:nowrap">Exp. Accuracy</th>` +
    `</tr></thead><tbody>${reliabilityRows}</tbody></table>` +
    `<div class="defs">` +
    `<p><b>Confidence:</b> Prediction certainty of the model for this chemical structure.</p>` +
    `<p><b>Applicability Domain:</b> Whether the chemical falls within the model&#39;s reliable prediction space (Tanimoto similarity &ge; 0.6).</p>` +
    `<p><b>Expected Accuracy:</b> Estimated model performance based on validation data (balanced accuracy).</p>` +
    `</div>` +
    `<div class="chart-blk">` +
    `<div class="stitle">Risk Trend Over Time (0&ndash;100)</div>` +
    `<div class="chart-svg">${svgChart}</div>` +
    `<div style="display:flex;flex-wrap:wrap;gap:0 4mm;margin-top:1.5mm">${chartLegend}</div>` +
    `</div>` +
    `</div>` +

    `<div class="mr">` +
    `<div class="stitle">04 &nbsp; Formula Composition</div>` +
    `<table><thead><tr>` +
    `<th class="tn" style="width:8mm">No.</th><th>Ingredient</th>` +
    `<th class="tn" style="width:19mm">Conc. (%)</th><th style="width:14mm">Status</th>` +
    `</tr></thead>` +
    `<tbody>${formulaRows}</tbody>` +
    `<tfoot><tr><td colspan="2" style="font-weight:700">Total</td>` +
    `<td class="tn">${totalConcentration.toFixed(2)}</td><td></td></tr></tfoot>` +
    `</table>` +
    `<p class="note">* Concentration by weight (%)</p>` +
    `</div>` +
    `</div>` +

    // FOOTER
    `<div class="ftr-div"></div>` +
    `<footer class="ftr">` +
    `<div class="ftr-brand"><b>RalphGuard</b><small>Scientific Screening Platform</small></div>` +
    `<div class="ftr-mid">` +
    `<span class="ftr-mono">Model: RG-QSAR Ensemble v1.0</span>` +
    `<span class="ftr-disc">For computational screening and research purposes only. ` +
    `This report does not constitute laboratory, clinical, or regulatory certification.</span>` +
    `</div>` +
    `<div class="ftr-pg"><b>Page 1 of 1</b><small>${esc(generatedDate)}</small></div>` +
    `</footer>` +

    `</div>` +
    `</body></html>`
  );
}

