"""Reproducible plots and a Markdown report for candidate-v2 training.

Every validation plot is backed by an exported prediction CSV.  The plots are
therefore presentation-ready while the underlying sample-level outputs remain
auditable.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyBboxPatch  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.metrics import confusion_matrix, roc_curve  # noqa: E402


METRIC_KEYS = (
    "accuracy",
    "balanced_accuracy",
    "sensitivity",
    "specificity",
    "auc",
    "mcc",
)
METRIC_LABELS = {
    "accuracy": "Accuracy",
    "balanced_accuracy": "Balanced Acc.",
    "sensitivity": "Sensitivity",
    "specificity": "Specificity",
    "auc": "ROC-AUC",
    "mcc": "MCC",
}
COLORS = {
    "Production OOF": "#64748B",
    "Candidate OOF": "#0F766E",
    "Nested CV": "#2563EB",
    "Scaffold CV": "#7C3AED",
    "External": "#DC2626",
}


def _save(fig: plt.Figure, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path.with_suffix(".png"), dpi=180, bbox_inches="tight")
    fig.savefig(path.with_suffix(".svg"), bbox_inches="tight")
    plt.close(fig)


def _status_figure(title: str, status: Mapping[str, Any], path: Path) -> None:
    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.axis("off")
    reason = status.get("reason") or status.get("message") or status.get("status", "unavailable")
    ax.text(0.5, 0.62, title, ha="center", va="center", fontsize=18, weight="bold")
    ax.text(0.5, 0.43, "NOT AVAILABLE", ha="center", va="center", fontsize=15, color="#B91C1C", weight="bold")
    ax.text(0.5, 0.28, str(reason), ha="center", va="center", fontsize=10, color="#475569", wrap=True)
    _save(fig, path)


def export_predictions(payload: Mapping[str, Any] | None, path: Path) -> None:
    if not payload:
        # A candidate directory can be reused across validation profiles.  Do
        # not leave a CSV from an earlier, more expensive profile beside a
        # fresh "not run" plot because that would misrepresent this run.
        path.unlink(missing_ok=True)
        return
    columns: dict[str, Any] = {
        "sample_index": np.arange(len(payload["y_true"]), dtype=int),
        "observed_label": payload["y_true"],
        "predicted_probability": payload["probabilities"],
        "predicted_label": payload["predictions"],
    }
    for optional in ("fold", "threshold", "smiles", "identity_key", "training_origin", "name"):
        value = payload.get(optional)
        if value is not None:
            columns[optional] = value
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(columns).to_csv(path, index=False)


def plot_algorithm_pipeline(output_dir: Path) -> None:
    labels = [
        "1. Evidence sources\nBase + reviewed NICE + reviewed PubChem",
        "2. Molecular identity audit\nRDKit → canonical SMILES → InChIKey",
        "3. Clean training set\nEvidence-tier conflicts + exact dedup",
        "4. Endpoint featurization\nMorgan / MACCS / descriptors",
        "5. Soft-voting ensemble\nRF + ExtraTrees + LogReg + HistGB",
        "6. Validation\nOOF + Nested + Scaffold + External",
        "7. Candidate review\nCompare metrics; never auto-promote",
    ]
    # Use a two-row snake rather than seven auto-sized text boxes on one row.
    # Fixed box dimensions keep long labels readable in both slides and PDFs.
    positions = [
        (0.5, 1.35),
        (1.5, 1.35),
        (2.5, 1.35),
        (3.5, 1.35),
        (3.5, 0.55),
        (2.5, 0.55),
        (1.5, 0.55),
    ]
    box_width = 0.84
    box_height = 0.48
    fig, ax = plt.subplots(figsize=(16, 7))
    ax.set_xlim(0, 4)
    ax.set_ylim(0.1, 1.85)
    ax.axis("off")
    for (x, y), label in zip(positions, labels):
        box = FancyBboxPatch(
            (x - box_width / 2, y - box_height / 2),
            box_width,
            box_height,
            boxstyle="round,pad=0.035",
            facecolor="#F0FDFA",
            edgecolor="#0F766E",
            linewidth=2,
        )
        ax.add_patch(box)
        ax.text(
            x,
            y,
            label,
            ha="center",
            va="center",
            fontsize=10,
            color="#0F172A",
            linespacing=1.35,
        )
    for (x1, y1), (x2, y2) in zip(positions, positions[1:]):
        if y1 == y2:
            direction = 1 if x2 > x1 else -1
            start = (x1 + direction * box_width / 2, y1)
            end = (x2 - direction * box_width / 2, y2)
        else:
            direction = 1 if y2 > y1 else -1
            start = (x1, y1 + direction * box_height / 2)
            end = (x2, y2 - direction * box_height / 2)
        ax.annotate(
            "",
            xy=end,
            xytext=start,
            arrowprops={"arrowstyle": "-|>", "color": "#0F766E", "lw": 2},
        )
    ax.set_title(
        "RalphGuard Candidate-v2: auditable training and validation pipeline",
        fontsize=18,
        weight="bold",
        pad=18,
    )
    fig.tight_layout()
    _save(fig, output_dir / "00_algorithm_pipeline")


def plot_training_preflight(dataset_paths: Mapping[str, Path], output_dir: Path) -> None:
    endpoints = list(dataset_paths)
    present = [int(dataset_paths[endpoint].exists()) for endpoint in endpoints]
    colors = ["#16A34A" if value else "#DC2626" for value in present]
    fig, ax = plt.subplots(figsize=(9, 4.8))
    bars = ax.bar([endpoint.upper() for endpoint in endpoints], present, color=colors)
    ax.set_ylim(0, 1.22)
    ax.set_yticks([0, 1], ["Missing", "Present"])
    ax.set_title("Stage 0: raw training-data preflight", fontsize=15, weight="bold")
    ax.grid(axis="y", alpha=0.2)
    for bar, value in zip(bars, present):
        ax.text(bar.get_x() + bar.get_width() / 2, value + 0.04, "READY" if value else "BLOCKED", ha="center", weight="bold", color="#166534" if value else "#991B1B")
    fig.tight_layout()
    _save(fig, output_dir / "00_data_preflight")


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def plot_data_ingestion(repo_root: Path, output_dir: Path) -> None:
    """Show where every training row came from, before any cleaning happens.

    The previous preflight figure only reported that four CSV files existed,
    which tells a reviewer nothing about provenance. This reads the import
    manifests each collector already writes and plots the real numbers: how
    many raw evidence rows each public source held, why most of them could not
    become training rows, and which file hash the run consumed.
    """
    ice = _read_json(repo_root / "data" / "staging" / "ice_bulk_preparation_summary.json")
    negatives = _read_json(repo_root / "data" / "curated" / "experimental_negative_manifest.json")
    hppt = _read_json(repo_root / "data" / "curated" / "sens_hppt_import_report.json")
    pubchem = _read_json(repo_root / "data" / "curated" / "pubchem_global_import_report.json")
    ice_endpoints: Mapping[str, Any] = ice.get("endpoint_summaries", {}) or {}
    if not ice_endpoints:
        _status_figure(
            "Stage 1 — data ingestion",
            {"reason": "ICE bulk preparation summary was not found"},
            output_dir / "00_data_ingestion",
        )
        return

    endpoints = list(ice_endpoints)
    fig = plt.figure(figsize=(18, 9))
    grid = fig.add_gridspec(2, 2, height_ratios=[1.15, 1.0], hspace=0.42, wspace=0.22)

    # Panel A — how many usable identities each public source contributed.
    axis = fig.add_subplot(grid[0, 0])
    negative_endpoints = negatives.get("endpoints", {}) or {}
    pubchem_by_endpoint = pubchem.get("screened_unique_structures_by_endpoint", {}) or {}
    contributions = {
        "NICEATM ICE (experimental)": [
            int(ice_endpoints[name].get("training_identity_groups", 0)) for name in endpoints
        ],
        "STopTox (curated negatives)": [
            int((negative_endpoints.get(name) or {}).get("accepted_new_negative", 0))
            for name in endpoints
        ],
        "NICEATM HPPT (human patch)": [
            int(hppt.get("accepted_unique_structures", 0)) if name == "sens" else 0
            for name in endpoints
        ],
        "PubChem GHS (regulatory weak)": [
            int(pubchem_by_endpoint.get(name, 0)) for name in endpoints
        ],
    }
    offsets = np.arange(len(endpoints))
    bottom = np.zeros(len(endpoints))
    palette = ["#0F766E", "#16A34A", "#2563EB", "#F59E0B"]
    for (label, values), colour in zip(contributions.items(), palette):
        array = np.asarray(values, dtype=float)
        axis.bar(offsets, array, 0.6, bottom=bottom, label=label, color=colour)
        bottom += array
    axis.set_xticks(offsets)
    axis.set_xticklabels([name.upper() for name in endpoints])
    axis.set_yscale("symlog")
    axis.set_ylabel("Unique structures contributed (symlog)")
    axis.set_title("A. Public sources feeding each endpoint", fontsize=12, weight="bold")
    # Symlog bars reach the top of the axis, so the legend needs its own room
    # rather than sitting on top of the shortest endpoint's bar.
    axis.set_ylim(0, max(bottom.max(), 1) * 60)
    axis.legend(fontsize=8, loc="upper left")

    # Panel B — the ICE download is mostly unusable for a single-molecule QSAR.
    # Showing why is the honest answer to "why is the experimental set small?".
    axis = fig.add_subplot(grid[0, 1])
    reasons = {
        "Mixture / formulation": "mixture_or_formulation",
        "No defined structure": "missing_defined_structure",
        "Not in vivo": "not_in_vivo",
        "Sent to manual review": "group_conflict_review_required",
    }
    bottom = np.zeros(len(endpoints))
    reason_palette = ["#DC2626", "#EA580C", "#F59E0B", "#7C3AED"]
    for (label, key), colour in zip(reasons.items(), reason_palette):
        array = np.asarray(
            [float(ice_endpoints[name].get(key, 0) or 0) for name in endpoints]
        )
        axis.bar(offsets, array, 0.6, bottom=bottom, label=label, color=colour)
        bottom += array
    kept = np.asarray(
        [float(ice_endpoints[name].get("training_identity_groups", 0)) for name in endpoints]
    )
    axis.bar(offsets, kept, 0.6, bottom=bottom, label="Kept for training", color="#0F766E")
    axis.set_xticks(offsets)
    axis.set_xticklabels([name.upper() for name in endpoints])
    axis.set_ylabel("Raw evidence rows")
    axis.set_title(
        "B. Why most ICE rows cannot enter a single-molecule QSAR",
        fontsize=12,
        weight="bold",
    )
    axis.legend(fontsize=8)

    # Panel C — raw rows in versus training identities out, per endpoint.
    axis = fig.add_subplot(grid[1, 0])
    raw_rows = [float(ice_endpoints[name].get("raw_evidence_rows", 0)) for name in endpoints]
    axis.bar(offsets - 0.18, raw_rows, 0.36, label="Raw evidence rows", color="#94A3B8")
    axis.bar(offsets + 0.18, kept, 0.36, label="Training identities", color="#0F766E")
    axis.set_xticks(offsets)
    axis.set_xticklabels([name.upper() for name in endpoints])
    axis.set_yscale("symlog")
    axis.set_ylabel("Rows (symlog)")
    axis.set_title("C. ICE raw rows in vs training identities out", fontsize=12, weight="bold")
    axis.set_ylim(0, max(max(raw_rows), 1) * 60)
    axis.legend(fontsize=8, loc="upper left")
    for offset, raw_value, kept_value in zip(offsets, raw_rows, kept):
        axis.text(offset - 0.18, raw_value, f"{int(raw_value):,}", ha="center", va="bottom", fontsize=7.5)
        axis.text(offset + 0.18, kept_value, f"{int(kept_value):,}", ha="center", va="bottom", fontsize=7.5)

    # Panel D — the provenance a reviewer needs to re-download and re-check.
    axis = fig.add_subplot(grid[1, 1])
    axis.axis("off")
    lines = ["Source provenance consumed by this run", ""]
    for name in endpoints:
        summary = ice_endpoints[name]
        digest = str(summary.get("source_sha256", ""))[:16]
        lines.append(f"ICE {name.upper():<6} {Path(str(summary.get('source_file',''))).name}   sha256:{digest}…")
    if negatives.get("paper"):
        lines.append("")
        lines.append(f"STopTox negatives  {negatives.get('paper')}")
    if hppt.get("source_url"):
        lines.append(f"NICEATM HPPT       {hppt.get('source_url')}")
    lines.append("")
    lines.append("Label policy: experimental/reference evidence only;")
    lines.append("absence of a hazard statement is never a negative label.")
    axis.text(
        0.0,
        1.0,
        "\n".join(lines),
        va="top",
        ha="left",
        fontsize=8.5,
        family="monospace",
        linespacing=1.6,
    )
    axis.set_title("D. Provenance", fontsize=12, weight="bold", loc="left")

    fig.suptitle(
        "Stage 1 — data ingestion: what was downloaded and what survived source filtering",
        fontsize=15,
        weight="bold",
    )
    _save(fig, output_dir / "00_data_ingestion")


def plot_data_profile(endpoint: str, y: np.ndarray, stats: Mapping[str, Any], output_dir: Path) -> None:
    fig, axes = plt.subplots(1, 3, figsize=(14, 4.5))
    negative = int((y == 0).sum())
    positive = int((y == 1).sum())
    axes[0].bar(["Negative (0)", "Positive (1)"], [negative, positive], color=["#16A34A", "#DC2626"])
    axes[0].set_title("Class distribution")
    axes[0].set_ylabel("Unique molecules")
    for index, value in enumerate((negative, positive)):
        axes[0].text(index, value, str(value), ha="center", va="bottom", weight="bold")

    sources = stats.get("training_sources", {})
    source_names = list(sources) or ["none"]
    source_values = list(sources.values()) or [0]
    axes[1].bar(source_names, source_values, color=["#0F766E", "#2563EB", "#F59E0B"][: len(source_names)])
    axes[1].set_title("Retained evidence sources")
    axes[1].tick_params(axis="x", rotation=20)
    for index, value in enumerate(source_values):
        axes[1].text(index, value, str(value), ha="center", va="bottom", weight="bold")

    audit_names = ["Input", "Invalid structure", "Invalid label", "Conflicts", "Duplicates", "Retained"]
    audit_values = [
        int(stats.get("raw_rows_before_identity_audit", 0)),
        int(stats.get("invalid_structure_rows", 0)),
        int(stats.get("invalid_label_rows", 0)),
        int(stats.get("conflicting_identity_count", 0)),
        int(stats.get("duplicate_rows_beyond_first", 0)),
        int(stats.get("unique_exact_identities_retained", len(y))),
    ]
    axes[2].barh(audit_names, audit_values, color=["#64748B", "#DC2626", "#DC2626", "#EA580C", "#F59E0B", "#0F766E"])
    axes[2].invert_yaxis()
    axes[2].set_title("Identity and label audit")
    for index, value in enumerate(audit_values):
        axes[2].text(value, index, f" {value}", va="center", fontsize=9)

    fig.suptitle(f"{endpoint.upper()} — Stage 1: training-data profile", fontsize=15, weight="bold")
    fig.tight_layout()
    _save(fig, output_dir / "01_data_profile")


FUNNEL_LABELS = {
    "raw_rows_loaded": "1. Rows loaded from all sources",
    "valid_structure_and_label": "2. RDKit-parsable structure + binary label",
    "external_holdout_quarantined": "3. External holdout molecules removed",
    "best_evidence_tier_only": "4. Highest evidence tier per molecule",
    "same_tier_conflicts_removed": "5. Same-tier label conflicts removed",
    "deduplicated_to_identities": "6. Deduplicated to unique molecules",
    "class_balanced_training_set": "7. Class-balanced training set",
}


def plot_cleaning_funnel(endpoint: str, stats: Mapping[str, Any], output_dir: Path) -> None:
    """Show what data cleaning actually removed, stage by stage.

    Reviewers ask what the raw evidence looked like before curation and what
    survived it. A single before/after pair cannot answer that, so the left
    panel plots the surviving row count after every stage on a log axis —
    without it a 306-row class is invisible beside a 160,000-row one — and
    annotates how many rows each stage dropped.
    """
    funnel = list(stats.get("cleaning_funnel") or [])
    if not funnel:
        _status_figure(
            f"{endpoint.upper()} — data cleaning funnel",
            {"reason": "cleaning_funnel was not recorded for this run"},
            output_dir / "00_cleaning_funnel",
        )
        return

    fig, axes = plt.subplots(1, 4, figsize=(22, 5.6))

    labels = [FUNNEL_LABELS.get(item["stage"], item["stage"]) for item in funnel]
    values = [max(0, int(item["rows"])) for item in funnel]
    removed = [0] + [max(0, values[i - 1] - values[i]) for i in range(1, len(values))]
    positions = np.arange(len(values))
    shades = plt.cm.YlGnBu(np.linspace(0.35, 0.85, len(values)))

    # Rows remaining stays on a linear axis: the point of this panel is how
    # much of the pool the final stage removes, which a log axis would flatten.
    axes[0].barh(positions, values, color=shades)
    axes[0].set_yticks(positions)
    axes[0].set_yticklabels(labels, fontsize=8.5)
    axes[0].invert_yaxis()
    axes[0].set_xlabel("Rows remaining")
    axes[0].set_title("Data cleaning funnel", fontsize=12, weight="bold")
    start = values[0]
    for index, value in enumerate(values):
        axes[0].text(value, index, f" {value:,}", va="center", fontsize=8)
    axes[0].margins(x=0.18)
    axes[0].text(
        0.98,
        0.04,
        f"kept {values[-1]:,} of {start:,}  ({100.0 * values[-1] / max(1, start):.1f}%)",
        transform=axes[0].transAxes,
        ha="right",
        fontsize=9,
        style="italic",
    )

    # Removals need their own log axis, otherwise a 2-row conflict removal is
    # invisible beside a 157,000-row rebalance and the audit stages look
    # like they did nothing at all.
    # A log axis cannot draw zero, so a stage that removed nothing still needs
    # a stub. Colour it grey rather than red so "removed nothing" never reads
    # as a small removal.
    axes[1].barh(
        positions[1:],
        [max(value, 0.6) for value in removed[1:]],
        color=["#DC2626" if value else "#CBD5E1" for value in removed[1:]],
    )
    axes[1].set_yticks(positions[1:])
    axes[1].set_yticklabels([label.split(". ", 1)[-1] for label in labels[1:]], fontsize=8.5)
    axes[1].invert_yaxis()
    axes[1].set_xscale("log")
    axes[1].set_xlabel("Rows removed at this stage (log scale)")
    axes[1].set_title("What each stage removed", fontsize=12, weight="bold")
    for index, value in zip(positions[1:], removed[1:]):
        axes[1].text(max(value, 0.6), index, f" {value:,}", va="center", fontsize=8)
    axes[1].margins(x=0.3)

    before_pos = int(stats.get("eligible_positive_identities_before_cap", 0))
    before_neg = int(stats.get("eligible_negative_identities_before_cap", 0))
    after_pos = int(stats.get("retained_positive_identities", 0))
    after_neg = int(stats.get("retained_negative_identities", 0))
    width = 0.35
    axis = axes[2]
    axis.bar([0 - width / 2, 1 - width / 2], [before_pos, after_pos], width, label="Positive (1)", color="#DC2626")
    axis.bar([0 + width / 2, 1 + width / 2], [before_neg, after_neg], width, label="Negative (0)", color="#16A34A")
    axis.set_xticks([0, 1])
    axis.set_xticklabels(["Before balancing", "After balancing"])
    axis.set_yscale("log")
    axis.set_ylabel("Unique molecules (log scale)")
    axis.legend(fontsize=8)
    for x, value in zip(
        [0 - width / 2, 1 - width / 2, 0 + width / 2, 1 + width / 2],
        [before_pos, after_pos, before_neg, after_neg],
    ):
        if value > 0:
            axis.text(x, value, f"{value:,}", ha="center", va="bottom", fontsize=8, weight="bold")
    ratio_before = before_pos / before_neg if before_neg else 0
    ratio_after = after_pos / after_neg if after_neg else 0
    axis.set_title(
        f"Class balance before vs after\npositive:negative  {ratio_before:.0f}:1  →  {ratio_after:.0f}:1",
        fontsize=12,
        weight="bold",
    )
    axis.margins(y=0.25)

    inputs = {
        "base ICE": int(stats.get("base_input_rows", 0)),
        "curated experimental": int(stats.get("external_experimental_input_rows", 0)),
        "NICE reviewed": int(stats.get("nice_reviewed_input_rows", 0)),
        "PubChem weak": int(stats.get("pubchem_reviewed_input_rows", 0)),
    }
    retained = stats.get("training_sources", {}) or {}
    retained_by_label = {
        "base ICE": int(retained.get("base", 0)),
        "curated experimental": int(retained.get("external_experimental", 0)),
        "NICE reviewed": int(retained.get("nice_reviewed", 0)),
        "PubChem weak": int(retained.get("pubchem_reviewed", 0)),
    }
    names = list(inputs)
    offsets = np.arange(len(names))
    axes[3].bar(offsets - width / 2, [inputs[name] for name in names], width, label="Loaded", color="#94A3B8")
    axes[3].bar(offsets + width / 2, [retained_by_label[name] for name in names], width, label="Retained", color="#0F766E")
    axes[3].set_xticks(offsets)
    axes[3].set_xticklabels(names, rotation=18, fontsize=8.5)
    axes[3].set_yscale("symlog")
    axes[3].set_ylabel("Rows (symlog scale)")
    axes[3].set_title("Evidence source: loaded vs retained", fontsize=12, weight="bold")
    axes[3].legend(fontsize=8)

    fig.suptitle(
        f"{endpoint.upper()} — Stage 0: what data cleaning removed",
        fontsize=15,
        weight="bold",
    )
    fig.tight_layout()
    _save(fig, output_dir / "00_cleaning_funnel")


def plot_validation(
    endpoint: str,
    stage: str,
    metrics: Mapping[str, Any],
    payload: Mapping[str, Any] | None,
    output_dir: Path,
    file_stem: str,
) -> None:
    if metrics.get("status") not in (None, "complete") or not payload:
        _status_figure(f"{endpoint.upper()} — {stage}", metrics, output_dir / file_stem)
        return

    y_true = np.asarray(payload["y_true"], dtype=int)
    probability = np.asarray(payload["probabilities"], dtype=float)
    prediction = np.asarray(payload["predictions"], dtype=int)
    fig, axes = plt.subplots(1, 3, figsize=(14, 4.5))

    if len(np.unique(y_true)) > 1:
        fpr, tpr, _ = roc_curve(y_true, probability)
        axes[0].plot(fpr, tpr, color="#0F766E", lw=2.2, label=f"AUC = {metrics.get('auc')}")
        axes[0].plot([0, 1], [0, 1], "--", color="#94A3B8", lw=1)
        axes[0].legend(loc="lower right")
    axes[0].set(xlabel="False positive rate", ylabel="True positive rate", title="ROC curve", xlim=(0, 1), ylim=(0, 1))
    axes[0].grid(alpha=0.2)

    matrix = confusion_matrix(y_true, prediction, labels=[0, 1])
    image = axes[1].imshow(matrix, cmap="Blues")
    fig.colorbar(image, ax=axes[1], fraction=0.046, pad=0.04)
    for row in range(2):
        for column in range(2):
            axes[1].text(column, row, str(matrix[row, column]), ha="center", va="center", fontsize=14, weight="bold")
    axes[1].set_xticks([0, 1], ["Pred 0", "Pred 1"])
    axes[1].set_yticks([0, 1], ["True 0", "True 1"])
    axes[1].set_title("Confusion matrix")

    axes[2].hist(probability[y_true == 0], bins=12, alpha=0.65, color="#16A34A", label="Observed 0")
    axes[2].hist(probability[y_true == 1], bins=12, alpha=0.65, color="#DC2626", label="Observed 1")
    threshold_values = payload.get("threshold")
    if threshold_values is not None:
        threshold_array = np.asarray(threshold_values, dtype=float)
        axes[2].axvline(float(np.median(threshold_array)), color="#0F172A", linestyle="--", label="Median threshold")
    axes[2].set(xlabel="Predicted probability", ylabel="Samples", title="Probability separation", xlim=(0, 1))
    axes[2].legend(fontsize=8)

    metric_text = " · ".join(
        f"{METRIC_LABELS[key]}={metrics.get(key)}" for key in METRIC_KEYS if metrics.get(key) is not None
    )
    fig.suptitle(f"{endpoint.upper()} — {stage}\n{metric_text}", fontsize=13, weight="bold")
    fig.tight_layout()
    _save(fig, output_dir / file_stem)


def plot_model_comparison(endpoint: str, validations: Mapping[str, Mapping[str, Any]], output_dir: Path) -> None:
    usable = {
        name: metrics
        for name, metrics in validations.items()
        if metrics and metrics.get("status") in (None, "complete")
    }
    if not usable:
        _status_figure(f"{endpoint.upper()} — model comparison", {"reason": "No comparable metrics"}, output_dir / "06_model_comparison")
        return
    names = list(usable)
    x = np.arange(len(METRIC_KEYS), dtype=float)
    width = min(0.16, 0.8 / max(1, len(names)))
    fig, ax = plt.subplots(figsize=(13, 5.5))
    for index, name in enumerate(names):
        values = [float(usable[name].get(key, np.nan)) for key in METRIC_KEYS]
        offset = (index - (len(names) - 1) / 2) * width
        ax.bar(x + offset, values, width, label=name, color=COLORS.get(name))
    ax.axhline(0, color="#0F172A", lw=0.8)
    ax.set_xticks(x, [METRIC_LABELS[key] for key in METRIC_KEYS])
    ax.set_ylim(-0.15, 1.05)
    ax.set_ylabel("Metric value")
    ax.set_title(f"{endpoint.upper()} — Stage 6: Production vs Candidate validation")
    ax.grid(axis="y", alpha=0.2)
    ax.legend(ncol=min(5, len(names)), fontsize=8, loc="lower center", bbox_to_anchor=(0.5, -0.22))
    fig.tight_layout()
    _save(fig, output_dir / "06_model_comparison")


def plot_evidence_origin_performance(
    endpoint: str,
    origin_metrics: Mapping[str, Mapping[str, Any]],
    output_dir: Path,
) -> None:
    """Show when validation quality differs between evidence tiers."""
    if not origin_metrics:
        _status_figure(
            f"{endpoint.upper()} — evidence-tier validation",
            {"reason": "No evidence-origin metrics"},
            output_dir / "07_evidence_origin_validation",
        )
        return
    origins = list(origin_metrics)
    metric_names = ("accuracy", "sensitivity", "specificity")
    x = np.arange(len(origins), dtype=float)
    width = 0.23
    fig, ax = plt.subplots(figsize=(10, 5.2))
    colors = ("#0F766E", "#DC2626", "#2563EB")
    for index, (metric, color) in enumerate(zip(metric_names, colors)):
        values = [
            float(origin_metrics[origin][metric])
            if origin_metrics[origin].get(metric) is not None
            else np.nan
            for origin in origins
        ]
        ax.bar(
            x + (index - 1) * width,
            values,
            width,
            label=METRIC_LABELS.get(metric, metric.title()),
            color=color,
        )
    labels = [
        f"{origin}\nn={origin_metrics[origin].get('n', 0)} "
        f"(+{origin_metrics[origin].get('n_pos', 0)}/-{origin_metrics[origin].get('n_neg', 0)})"
        for origin in origins
    ]
    ax.set_xticks(x, labels)
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("OOF metric")
    ax.set_title(f"{endpoint.upper()} — Stage 7: OOF performance by evidence origin")
    ax.grid(axis="y", alpha=0.2)
    ax.legend()
    fig.tight_layout()
    _save(fig, output_dir / "07_evidence_origin_validation")


def plot_pipeline_summary(report: Mapping[str, Any], output_dir: Path) -> None:
    """One figure linking raw rows, the trained set, and the resulting scores.

    The per-stage figures each answer one question; a reviewer also needs the
    single view that connects them, so this puts the data journey and the
    validation outcome for all endpoints side by side.
    """
    endpoints_report: Mapping[str, Any] = report.get("endpoints", {}) or {}
    if not endpoints_report:
        _status_figure(
            "Pipeline summary",
            {"reason": "no endpoint results in this run"},
            output_dir / "08_pipeline_summary",
        )
        return

    endpoints = list(endpoints_report)
    offsets = np.arange(len(endpoints))
    fig, axes = plt.subplots(1, 3, figsize=(18, 5.4))

    raw_rows: list[float] = []
    trained_rows: list[float] = []
    for name in endpoints:
        stats = endpoints_report[name].get("dataset", {}) or {}
        funnel = {row["stage"]: row["rows"] for row in stats.get("cleaning_funnel", [])}
        raw_rows.append(float(funnel.get("raw_rows_loaded", 0)))
        trained_rows.append(float(funnel.get("class_balanced_training_set", stats.get("n", 0))))

    axes[0].bar(offsets - 0.18, raw_rows, 0.36, label="Rows loaded", color="#94A3B8")
    axes[0].bar(offsets + 0.18, trained_rows, 0.36, label="Rows trained on", color="#0F766E")
    axes[0].set_xticks(offsets)
    axes[0].set_xticklabels([name.upper() for name in endpoints])
    axes[0].set_yscale("symlog")
    axes[0].set_ylabel("Rows (symlog)")
    axes[0].set_title("Data journey", fontsize=12, weight="bold")
    axes[0].legend(fontsize=8)
    for offset, loaded, trained in zip(offsets, raw_rows, trained_rows):
        axes[0].text(offset - 0.18, loaded, f"{int(loaded):,}", ha="center", va="bottom", fontsize=7.5)
        axes[0].text(offset + 0.18, trained, f"{int(trained):,}", ha="center", va="bottom", fontsize=7.5)

    # Internal cross-validation is optimistic relative to structurally novel
    # molecules, so OOF and scaffold-grouped scores are always shown together.
    for index, (metric, title) in enumerate((("auc", "ROC-AUC"), ("mcc", "MCC")), start=1):
        oof = [endpoints_report[name].get("candidate_oof", {}).get(metric) for name in endpoints]
        scaffold = [
            endpoints_report[name].get("candidate_scaffold_grouped", {}).get(metric)
            for name in endpoints
        ]
        axes[index].bar(
            offsets - 0.18,
            [value if value is not None else 0 for value in oof],
            0.36,
            label="Random OOF CV",
            color="#0F766E",
        )
        axes[index].bar(
            offsets + 0.18,
            [value if value is not None else 0 for value in scaffold],
            0.36,
            label="Scaffold-grouped CV",
            color="#7C3AED",
        )
        axes[index].set_xticks(offsets)
        axes[index].set_xticklabels([name.upper() for name in endpoints])
        axes[index].set_ylim(0, 1.05)
        axes[index].set_title(f"Validation — {title}", fontsize=12, weight="bold")
        axes[index].legend(fontsize=8)
        axes[index].grid(axis="y", alpha=0.2)
        for offset, value in zip(offsets - 0.18, oof):
            if value is not None:
                axes[index].text(offset, value, f"{value:.3f}", ha="center", va="bottom", fontsize=7.5)
        for offset, value in zip(offsets + 0.18, scaffold):
            if value is not None:
                axes[index].text(offset, value, f"{value:.3f}", ha="center", va="bottom", fontsize=7.5)

    fig.suptitle(
        "Pipeline summary — raw evidence to validated candidate (in-silico screening, not clinical accuracy)",
        fontsize=15,
        weight="bold",
    )
    fig.tight_layout()
    _save(fig, output_dir / "08_pipeline_summary")


def write_training_report(report: Mapping[str, Any], output_dir: Path) -> None:
    lines = [
        "# RalphGuard Candidate-v2 Training Report",
        "",
        f"Generated: `{report.get('generated_at', '')}`",
        "",
        "## Algorithm",
        "",
        "1. Load endpoint-specific base data and only reviewed supplemental evidence.",
        "2. Parse structures with RDKit, canonicalize SMILES, and identify molecules by InChIKey.",
        "3. Reject invalid structures/labels; exclude same-tier conflicts and audit lower-tier contradictions.",
        "4. Keep one row per exact molecule using experimental/reviewed > PubChem evidence priority.",
        "5. Build endpoint-specific Morgan fingerprints, MACCS keys, and molecular descriptors.",
        "6. Fit a soft-voting ensemble: Random Forest, Extra Trees, Logistic Regression, and HistGradientBoosting.",
        "7. Select operating thresholds with Youden's J using training-fold predictions only.",
        "8. Evaluate with OOF, nested stratified CV, scaffold-grouped CV, and overlap-free external data where available.",
        "9. Save Candidate artifacts separately; promotion to Production is always a manual decision.",
        "",
        "## Runtime versions",
        "",
    ]
    for name, version in report.get("runtime_versions", {}).items():
        lines.append(f"- {name}: `{version}`")
    lines.extend(["", "## Endpoint results", ""])
    for endpoint, result in report.get("endpoints", {}).items():
        dataset = result.get("dataset", {})
        lines.extend([
            f"### {endpoint.upper()}",
            "",
            f"- Unique training molecules: **{dataset.get('n', 'n/a')}**",
            f"- Positive / Negative: **{dataset.get('positive', 'n/a')} / {dataset.get('negative', 'n/a')}**",
            f"- Feature mode: `{dataset.get('feature_mode', 'n/a')}`",
            f"- Evidence origins: `{dataset.get('training_sources', {})}`",
            f"- Eligible identities before deterministic compute cap: **{dataset.get('eligible_unique_identities_before_training_cap', dataset.get('n', 'n/a'))}**",
            "",
            "| Validation | Accuracy | Balanced accuracy | Sensitivity | Specificity | AUC | MCC | Status |",
            "|---|---:|---:|---:|---:|---:|---:|---|",
        ])
        validation_rows = [
            ("Candidate OOF", result.get("candidate_oof", {})),
            ("Nested CV", result.get("candidate_nested_stratified", {})),
            ("Scaffold CV", result.get("candidate_scaffold_grouped", {})),
            ("External", result.get("external", {}).get("metrics", result.get("external", {}))),
        ]
        for name, metrics in validation_rows:
            lines.append(
                f"| {name} | {metrics.get('accuracy', '—')} | {metrics.get('balanced_accuracy', '—')} | "
                f"{metrics.get('sensitivity', '—')} | {metrics.get('specificity', '—')} | "
                f"{metrics.get('auc', '—')} | {metrics.get('mcc', '—')} | {metrics.get('status', result.get('external', {}).get('status', 'complete'))} |"
            )
        lines.extend(["", f"Plots and sample-level prediction CSVs: `plots/{endpoint}/`", ""])
        origin_metrics = result.get("candidate_oof", {}).get("metrics_by_training_origin", {})
        if origin_metrics:
            lines.extend([
                "OOF metrics by evidence origin are recorded separately so a large weak-label tier cannot hide performance on experimental rows:",
                "",
                "```json",
                json.dumps(origin_metrics, ensure_ascii=False, indent=2),
                "```",
                "",
            ])
    lines.extend([
        "## Interpretation limits",
        "",
        "- Internal cross-validation is not independent external validation.",
        "- Scaffold CV measures structural-family transfer and is expected to be more conservative than random folds.",
        "- External metrics are reported only after exact train/external molecular overlap is confirmed as zero.",
        "- Candidate models are screening tools and must not be described as clinical or regulatory replacements.",
        "- A class below the recommended evidence target remains evidence-limited even when the hard trainability gate passes.",
    ])
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "TRAINING_REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
