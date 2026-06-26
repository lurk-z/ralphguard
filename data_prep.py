"""
RalphGuard — Data Preparation & QSAR Training (Ensemble v2)
===========================================================
รัน: python data_prep.py   (แนะนำรันใน Docker worker เพื่อให้เวอร์ชัน lib ตรงกับ runtime)

วิธีการ (ดู docs/MODEL_IMPROVEMENT.md):
  1. โหลด 4 dataset, canonicalize SMILES ด้วย RDKit, ลบ duplicate
  2. Featurize แบบเลือกต่อ endpoint (featurizer.py):
        skin/eye -> MACCS + descriptors | sens -> Morgan | acute -> Morgan+MACCS+descriptors
  3. โมเดล = Soft-Voting Ensemble (RandomForest + ExtraTrees + LogReg + HistGB, ทุกตัว balanced)
  4. เลือก operating threshold ต่อ endpoint ด้วย Youden's J จาก 5-fold out-of-fold
  5. รายงาน metric out-of-fold: accuracy, balanced acc, sensitivity, specificity, ROC-AUC, MCC
  6. เก็บ bundle: ensemble members + feature_mode + threshold + Morgan train_fps (สำหรับ AD)

หมายเหตุความซื่อสัตย์: ค่าใน validation_report เป็น out-of-fold (5-fold). ตัวเลข nested-CV
ที่เข้มกว่า (เลือก threshold โดยไม่ leak) อยู่ใน docs/MODEL_IMPROVEMENT.md
"""
import os, sys, json, pickle, warnings
from pathlib import Path
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
from rdkit import Chem, RDLogger
RDLogger.DisableLog("rdApp.*")
from sklearn.ensemble import (RandomForestClassifier, ExtraTreesClassifier,
                              HistGradientBoostingClassifier)
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.utils.class_weight import compute_sample_weight
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import (accuracy_score, balanced_accuracy_score, recall_score,
                             roc_auc_score, confusion_matrix, matthews_corrcoef)

BASE = Path(__file__).parent
DATA = BASE / "data" / "raw"
OUT = BASE / "scientific" / "models"
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(BASE / "scientific"))
from featurizer import featurize_mol, morgan_bits  # noqa: E402

DATASETS = {
    "skin":  DATA / "skin_irritation.csv",
    "eye":   DATA / "eye_irritation.csv",
    "sens":  DATA / "llna_sensitization.csv",
    "acute": DATA / "catmos_acute_toxicity.csv",
}
ENDPOINT_NAMES = {"skin": "Skin Irritation", "eye": "Eye Irritation",
                  "sens": "Skin Sensitization", "acute": "Acute Toxicity"}
# feature mode per endpoint (from nested-CV study)
FEATURE_MODE = {"skin": "maccs_descr", "eye": "maccs_descr",
                "sens": "morgan", "acute": "morgan_maccs_descr"}
MEMBER_NAMES = ["RandomForest", "ExtraTrees", "LogReg", "HistGB"]


def build_members():
    return [
        RandomForestClassifier(250, random_state=42, n_jobs=-1, class_weight="balanced"),
        ExtraTreesClassifier(300, random_state=42, n_jobs=-1, class_weight="balanced"),
        make_pipeline(StandardScaler(with_mean=True),
                      LogisticRegression(max_iter=2000, class_weight="balanced")),
        HistGradientBoostingClassifier(random_state=42),
    ]


def fit_members(X, y):
    members = build_members()
    for name, m in zip(MEMBER_NAMES, members):
        if name == "HistGB":
            m.fit(X, y, sample_weight=compute_sample_weight("balanced", y))
        else:
            m.fit(X, y)
    return members


def ensemble_proba(members, X):
    """mean positive-class probability + std (member disagreement = uncertainty)."""
    P = np.column_stack([m.predict_proba(X)[:, 1] for m in members])
    return P.mean(axis=1), P.std(axis=1)


def youden_threshold(y, p):
    best_t, best_j = 0.5, -1.0
    for t in np.linspace(0.05, 0.95, 19):
        pred = (p >= t).astype(int)
        tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
        sens = tp / (tp + fn) if tp + fn else 0
        spec = tn / (tn + fp) if tn + fp else 0
        j = sens + spec - 1
        if j > best_j:
            best_j, best_t = j, t
    return float(best_t)


def load_endpoint(path, mode):
    df = pd.read_csv(path)
    df["canonical"] = df["smiles"].apply(
        lambda s: (Chem.MolToSmiles(Chem.MolFromSmiles(str(s)))
                   if Chem.MolFromSmiles(str(s)) else None))
    before = len(df)
    df = df.dropna(subset=["canonical"]).drop_duplicates("canonical").reset_index(drop=True)
    feats, morgans, y = [], [], []
    for _, r in df.iterrows():
        mol = Chem.MolFromSmiles(r["canonical"])
        if mol is None:
            continue
        feats.append(featurize_mol(mol, mode))
        morgans.append(morgan_bits(mol))
        y.append(int(r["label"]))
    return (np.vstack(feats).astype(float), np.vstack(morgans),
            np.array(y), df["canonical"].tolist(), before - len(df))


def evaluate_oof(X, y):
    skf = StratifiedKFold(5, shuffle=True, random_state=42)
    oof = np.zeros(len(y))
    for tr, te in skf.split(X, y):
        members = fit_members(X[tr], y[tr])
        oof[te], _ = ensemble_proba(members, X[te])
    thr = youden_threshold(y, oof)
    pred = (oof >= thr).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    metrics = dict(
        accuracy=round(accuracy_score(y, pred), 3),
        balanced_accuracy=round(balanced_accuracy_score(y, pred), 3),
        sensitivity=round(tp / (tp + fn) if tp + fn else 0, 3),
        specificity=round(tn / (tn + fp) if tn + fp else 0, 3),
        auc=round(roc_auc_score(y, oof), 3) if len(np.unique(y)) > 1 else None,
        mcc=round(matthews_corrcoef(y, pred), 3),
        threshold=round(thr, 3),
        n_pos=int(y.sum()), n_neg=int((y == 0).sum()),
    )
    return metrics, thr


def main():
    print("=" * 60)
    print("🔬 RalphGuard — QSAR Training (Ensemble v2)")
    print("=" * 60)
    all_metrics = {}
    for ep, path in DATASETS.items():
        if not path.exists():
            print(f"⚠️  {path.name} not found — skip {ep}"); continue
        mode = FEATURE_MODE[ep]
        print(f"\n── {ENDPOINT_NAMES[ep]} ({ep}) | features={mode} ──")
        X, Xmorgan, y, smiles, dropped = load_endpoint(path, mode)
        print(f"   compounds={len(y)} (dropped {dropped}) | "
              f"pos/neg={int(y.sum())}/{int((y==0).sum())} | dim={X.shape[1]}")

        metrics, thr = evaluate_oof(X, y)
        print(f"   OOF: Acc={metrics['accuracy']} BalAcc={metrics['balanced_accuracy']} "
              f"Sens={metrics['sensitivity']} Spec={metrics['specificity']} "
              f"AUC={metrics['auc']} MCC={metrics['mcc']} | thr={metrics['threshold']}")

        members = fit_members(X, y)  # final fit on all data
        bundle = {
            "format": "ensemble_v2",
            "members": members,
            "member_names": MEMBER_NAMES,
            "feature_mode": mode,
            "threshold": thr,
            "train_fps": [m for m in Xmorgan],   # Morgan fps for AD
            "train_smiles": smiles,
            "metrics": metrics,
            "endpoint": ep,
            "label": ENDPOINT_NAMES[ep],
        }
        with open(OUT / f"{ep}_model.pkl", "wb") as f:
            pickle.dump(bundle, f)
        print(f"   ✅ saved {ep}_model.pkl")
        all_metrics[ep] = metrics

    json.dump(all_metrics, open(OUT / "validation_report.json", "w"), indent=2)
    print("\n" + "=" * 60)
    print(f"{'Endpoint':<20}{'Acc':>6}{'BalAcc':>8}{'Sens':>6}{'Spec':>6}{'AUC':>7}{'MCC':>7}{'thr':>6}")
    print("-" * 60)
    for ep, m in all_metrics.items():
        print(f"{ENDPOINT_NAMES[ep]:<20}{m['accuracy']:>6}{m['balanced_accuracy']:>8}"
              f"{m['sensitivity']:>6}{m['specificity']:>6}{str(m['auc']):>7}{m['mcc']:>7}{m['threshold']:>6}")
    print("\n🎉 Done. Models ready in scientific/models/ (format=ensemble_v2)")


if __name__ == "__main__":
    main()
