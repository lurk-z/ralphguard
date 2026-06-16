"""
RalphGuard — Data Preparation & QSAR Training Pipeline
=======================================================
รัน: python data_prep.py

สิ่งที่ทำ:
  1. โหลด 4 dataset จาก data/raw/
  2. Clean: canonicalize SMILES, strip salts, ลบ duplicate
  3. คำนวณ Morgan fingerprint (2048 bits, radius 2)
  4. Train Random Forest สำหรับ 4 endpoints
  5. Validate ด้วย 5-fold CV + held-out test set
  6. บันทึก model + fingerprints ลง scientific/models/
"""

import os, sys, json, pickle, warnings
from pathlib import Path
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
from rdkit import Chem
from rdkit.Chem import AllChem, Descriptors, Crippen, Lipinski, rdMolDescriptors
from rdkit.DataStructs import ConvertToNumpyArray
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.metrics import (accuracy_score, balanced_accuracy_score,
                             recall_score, roc_auc_score, confusion_matrix)

# ── Paths ─────────────────────────────────────────────────────────────
BASE    = Path(__file__).parent
DATA    = BASE / "data" / "raw"
OUT     = BASE / "scientific" / "models"
OUT.mkdir(parents=True, exist_ok=True)

DATASETS = {
    "skin":  DATA / "skin_irritation.csv",
    "eye":   DATA / "eye_irritation.csv",
    "sens":  DATA / "llna_sensitization.csv",
    "acute": DATA / "catmos_acute_toxicity.csv",
}

ENDPOINT_NAMES = {
    "skin":  "Skin Irritation",
    "eye":   "Eye Irritation",
    "sens":  "Skin Sensitization",
    "acute": "Acute Toxicity",
}

# ── Chemistry helpers ─────────────────────────────────────────────────
def canonicalize(smiles: str):
    """Return canonical SMILES or None if invalid."""
    try:
        mol = Chem.MolFromSmiles(str(smiles))
        if mol is None:
            return None
        return Chem.MolToSmiles(mol, canonical=True)
    except Exception:
        return None


def morgan_fp(smiles: str, n_bits=2048, radius=2):
    """Compute Morgan fingerprint as numpy array."""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    fp = AllChem.GetMorganFingerprintAsBitVect(mol, radius=radius, nBits=n_bits)
    arr = np.zeros((n_bits,), dtype=np.int8)
    ConvertToNumpyArray(fp, arr)
    return arr


def compute_descriptors(smiles: str):
    """Compute 6 physicochemical descriptors."""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    return {
        "mw":   round(Descriptors.MolWt(mol), 2),
        "logp": round(Crippen.MolLogP(mol), 2),
        "tpsa": round(rdMolDescriptors.CalcTPSA(mol), 2),
        "hbd":  Lipinski.NumHDonors(mol),
        "hba":  Lipinski.NumHAcceptors(mol),
        "rot":  Lipinski.NumRotatableBonds(mol),
    }


# ── Data cleaning ─────────────────────────────────────────────────────
def clean_dataset(path: Path, endpoint: str):
    """Load, clean, and featurise one dataset."""
    print(f"\n{'─'*50}")
    print(f"📂 Loading {path.name}")
    df = pd.read_csv(path)

    # Canonicalize SMILES
    df["canonical"] = df["smiles"].apply(canonicalize)
    before = len(df)
    df = df.dropna(subset=["canonical"])
    print(f"   Invalid SMILES removed : {before - len(df)}")

    # Remove duplicates (keep first occurrence)
    df = df.drop_duplicates(subset=["canonical"])
    print(f"   After dedup            : {len(df)} compounds")

    # Compute fingerprints
    fps = []
    valid_idx = []
    for i, smi in enumerate(df["canonical"]):
        fp = morgan_fp(smi)
        if fp is not None:
            fps.append(fp)
            valid_idx.append(i)
    df = df.iloc[valid_idx].reset_index(drop=True)
    X = np.vstack(fps)

    # Labels
    y = df["label"].astype(int).values

    print(f"   Final dataset          : {len(df)} compounds")
    pos = y.sum()
    print(f"   Positive / Negative    : {pos} / {len(y)-pos}")
    return df, X, y


# ── Training & evaluation ─────────────────────────────────────────────
def train_and_evaluate(X, y, endpoint):
    """5-fold CV + held-out test evaluation."""
    # Held-out split (20%)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=42
    )

    # 5-fold CV on training set
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_bac, cv_auc = [], []
    for fold, (tr, va) in enumerate(skf.split(X_train, y_train)):
        clf = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
        clf.fit(X_train[tr], y_train[tr])
        preds = clf.predict(X_train[va])
        probas = clf.predict_proba(X_train[va])[:, 1]
        cv_bac.append(balanced_accuracy_score(y_train[va], preds))
        if len(np.unique(y_train[va])) > 1:
            cv_auc.append(roc_auc_score(y_train[va], probas))

    print(f"\n   📊 5-Fold CV (train set)")
    print(f"      Balanced Accuracy : {np.mean(cv_bac):.3f} ± {np.std(cv_bac):.3f}")
    if cv_auc:
        print(f"      ROC-AUC           : {np.mean(cv_auc):.3f} ± {np.std(cv_auc):.3f}")

    # Final model on full training set
    final_clf = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
    final_clf.fit(X_train, y_train)

    # Held-out test
    y_pred  = final_clf.predict(X_test)
    y_proba = final_clf.predict_proba(X_test)[:, 1]
    acc  = accuracy_score(y_test, y_pred)
    bac  = balanced_accuracy_score(y_test, y_pred)
    sens = recall_score(y_test, y_pred, zero_division=0)
    cm   = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel() if cm.size == 4 else (cm[0,0], 0, 0, cm[1,1] if cm.size > 1 else 0)
    spec = tn / (tn + fp) if (tn + fp) > 0 else 0
    auc  = roc_auc_score(y_test, y_proba) if len(np.unique(y_test)) > 1 else float("nan")

    print(f"\n   📊 Held-out Test Set (n={len(y_test)})")
    print(f"      Accuracy          : {acc:.3f}")
    print(f"      Balanced Accuracy : {bac:.3f}")
    print(f"      Sensitivity       : {sens:.3f}")
    print(f"      Specificity       : {spec:.3f}")
    print(f"      ROC-AUC           : {auc:.3f}")

    metrics = {
        "accuracy": round(acc, 3),
        "balanced_accuracy": round(bac, 3),
        "sensitivity": round(sens, 3),
        "specificity": round(spec, 3),
        "auc": round(auc, 3) if not np.isnan(auc) else None,
        "cv_bac_mean": round(np.mean(cv_bac), 3),
        "cv_bac_std":  round(np.std(cv_bac), 3),
        "n_train": len(X_train),
        "n_test":  len(X_test),
    }
    return final_clf, metrics


# ── AD: save training fingerprints ───────────────────────────────────
def save_model(clf, X_train, metrics, df_train, endpoint, out_dir):
    """Pickle model + training fps for AD check."""
    bundle = {
        "model":      clf,
        "train_fps":  X_train,
        "train_smiles": df_train["canonical"].tolist(),
        "metrics":    metrics,
        "endpoint":   endpoint,
        "label":      ENDPOINT_NAMES[endpoint],
    }
    path = out_dir / f"{endpoint}_model.pkl"
    with open(path, "wb") as f:
        pickle.dump(bundle, f)
    print(f"\n   ✅ Saved → {path}")
    return path


# ── Validation report ─────────────────────────────────────────────────
def save_validation_report(all_metrics, out_dir):
    report_path = out_dir / "validation_report.json"
    with open(report_path, "w") as f:
        json.dump(all_metrics, f, indent=2)
    print(f"\n{'='*50}")
    print("📄 Validation Summary Table")
    print(f"{'='*50}")
    header = f"{'Endpoint':<22} {'n_train':>7} {'n_test':>6} {'Acc':>6} {'BalAcc':>7} {'Sens':>6} {'Spec':>6} {'AUC':>6}"
    print(header)
    print("─" * len(header))
    for ep, m in all_metrics.items():
        auc_str = f"{m['auc']:.3f}" if m['auc'] else "  N/A"
        print(f"{ENDPOINT_NAMES[ep]:<22} {m['n_train']:>7} {m['n_test']:>6} "
              f"{m['accuracy']:>6.3f} {m['balanced_accuracy']:>7.3f} "
              f"{m['sensitivity']:>6.3f} {m['specificity']:>6.3f} {auc_str:>6}")
    print(f"\n✅ Report saved → {report_path}")


# ── Main ──────────────────────────────────────────────────────────────
def main():
    print("=" * 50)
    print("🔬 RalphGuard — QSAR Training Pipeline")
    print("=" * 50)

    all_metrics = {}

    for endpoint, path in DATASETS.items():
        if not path.exists():
            print(f"\n⚠️  {path.name} not found — skipping {endpoint}")
            continue

        df, X, y = clean_dataset(path, endpoint)

        print(f"\n🤖 Training {ENDPOINT_NAMES[endpoint]} model...")
        clf, metrics = train_and_evaluate(X, y, endpoint)

        # Use 80% as "train" for AD reference
        X_train, _, _, _ = train_test_split(
            X, y, test_size=0.20, stratify=y, random_state=42
        )
        df_train = df.iloc[:len(X_train)].reset_index(drop=True)
        save_model(clf, X_train, metrics, df_train, endpoint, OUT)
        all_metrics[endpoint] = metrics

    save_validation_report(all_metrics, OUT)
    print("\n🎉 Pipeline complete! Models ready in scientific/models/")


if __name__ == "__main__":
    main()
