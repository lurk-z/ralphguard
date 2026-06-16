"""
Applicability Domain (AD)
==========================
k-NN Tanimoto distance approach.

For a query molecule, check the average Tanimoto distance to its k nearest
neighbors in the training set. If too far away, flag as out-of-domain.

This is one of the OECD principles for QSAR validation (Principle 3:
"a defined domain of applicability").
"""
from typing import List, Tuple

import numpy as np

from fingerprints import tanimoto_similarity


def check_applicability_domain(
    query_fp: np.ndarray,
    training_fps: List[np.ndarray],
    k: int = 5,
    threshold: float = 0.30,
) -> Tuple[bool, float]:
    """
    Check whether query molecule is within the AD of a trained model.

    Parameters
    ----------
    query_fp : Morgan fingerprint of query molecule
    training_fps : list of fingerprints from training set
    k : number of nearest neighbors to average over
    threshold : minimum mean similarity required to be "in-domain"

    Returns
    -------
    (in_domain, mean_similarity) : tuple
        in_domain True if mean Tanimoto similarity to k-NN >= threshold
    """
    similarities = [tanimoto_similarity(query_fp, fp) for fp in training_fps]
    similarities.sort(reverse=True)
    top_k = similarities[:k]
    mean_sim = float(np.mean(top_k)) if top_k else 0.0
    return mean_sim >= threshold, mean_sim
