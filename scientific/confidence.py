"""
3-Layer Confidence System
==========================
Combines three signals into a single user-facing confidence level:

  Layer 1: Applicability Domain (in / out)
  Layer 2: Prediction probability (extreme vs borderline)
  Layer 3: Rule-based agreement (does a known toxic alert match the model?)

Output: "High" / "Medium" / "Low" + human-readable reason in Thai.

This addresses Reviewer Comment #1 from the proposal round.
"""
from dataclasses import dataclass
from typing import Literal

ConfidenceLevel = Literal["High", "Medium", "Low"]


@dataclass
class ConfidenceResult:
    level: ConfidenceLevel
    reason_th: str
    score: float  # 0-1 internal


def calculate_confidence(
    in_domain: bool,
    domain_similarity: float,
    prediction_prob: float,
    rule_agrees: bool = True,
) -> ConfidenceResult:
    """
    Aggregate three signals into a confidence level.

    Parameters
    ----------
    in_domain         : output of AD check
    domain_similarity : mean Tanimoto similarity to nearest neighbors
    prediction_prob   : model output probability (0-1)
    rule_agrees       : whether rule-based flag agrees with QSAR
    """
    # Out of domain → always Low
    if not in_domain:
        return ConfidenceResult(
            level="Low",
            reason_th=(
                "สารอยู่นอกขอบเขตของแบบจำลอง (out-of-domain) — "
                f"ค่าความคล้าย Tanimoto = {domain_similarity:.2f} "
                "ผลทำนายไม่น่าเชื่อถือสำหรับสารชนิดนี้"
            ),
            score=0.2,
        )

    # In domain, high probability extremity, rules agree → High
    extremity = abs(prediction_prob - 0.5) * 2  # 0..1
    if extremity > 0.6 and rule_agrees:
        return ConfidenceResult(
            level="High",
            reason_th=(
                "สารอยู่ในขอบเขตโมเดล ค่าทำนายชัดเจน "
                f"(p={prediction_prob:.2f}) และสอดคล้องกับกฎเชิงโครงสร้าง"
            ),
            score=0.9,
        )

    # Borderline probability or rule conflict → Medium
    return ConfidenceResult(
        level="Medium",
        reason_th=(
            "สารอยู่ในขอบเขตโมเดล แต่ค่าทำนายอยู่ในช่วงกลาง "
            f"(p={prediction_prob:.2f}) "
            f"{'หรือมีความขัดแย้งกับกฎเชิงโครงสร้าง' if not rule_agrees else ''} "
            "แนะนำให้ทดสอบเพิ่ม"
        ),
        score=0.55,
    )
