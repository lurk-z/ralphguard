# OCR concentration estimation in RalphGuard

## Why this exists

Consumer cosmetic labels usually expose an ingredient list, not the manufacturer's complete quantitative formulation. RalphGuard therefore must not convert ingredient order directly into an asserted exact percentage.

The OCR flow now separates three kinds of information:

1. **Label-declared percentage** — if OCR sees an ingredient with an adjacent explicit percentage such as `Niacinamide 5%`, that value is retained as direct label evidence.
2. **Estimated concentration range** — if no percentage is printed, RalphGuard creates a broad plausible range using label order plus an optional catalog/example concentration anchor.
3. **Simulation midpoint** — the midpoint is a provisional value used by the current formula-risk screening pipeline. It is not presented as the manufacturer's real concentration and remains editable before import.

## Regulatory / labeling basis

### ASEAN context

The ASEAN Cosmetic Labeling Requirements require a full ingredient listing on cosmetic packaging. The ASEAN Cosmetic Directive also requires the responsible company to keep qualitative and quantitative composition information available to the regulatory authority as part of product information.

Sources:

- ASEAN Cosmetic Labeling Requirements / technical document: https://www.aseancosmetics.org/docdocs/technical.htm
- ASEAN Cosmetic Directive, Article 8 Product Information: https://www.aseancosmetics.org/docdocs/scheduleB.htm

These sources support the distinction between **consumer ingredient listing** and the **quantitative formulation information maintained by the responsible company/regulator**. RalphGuard does not assume the public label contains the full quantitative formula.

### The 1% ordering convention

US FDA cosmetic-label guidance explicitly states that ingredients are generally declared in descending order of predominance, while ingredients present at 1% or less may be listed in any order after ingredients above 1%. FDA also notes in its labeling example that the concentrations themselves do not need to be declared.

Source:

- FDA Cosmetics Labeling Guide: https://www.fda.gov/cosmetics/cosmetics-labeling-regulations/cosmetics-labeling-guide

RalphGuard uses this as a **conservative labeling heuristic**, not as proof that every scanned product in every jurisdiction follows the identical rule. The UI therefore says "ช่วงปลาย ≤1% โดยประมาณ" and shows uncertainty.

## Estimation rules

Implementation: `frontend/src/lib/ocr-concentration-estimation.ts`

### 1. Explicit percentage wins

If OCR text contains an ingredient name immediately adjacent to a percentage:

```text
Niacinamide 5%
Panthenol 0.5%
```

RalphGuard records:

```text
basis = label-declared
min = midpoint = max = printed percentage
confidence = High
```

A percentage elsewhere on the package is not attached to an ingredient automatically.

### 2. Catalog values are soft anchors

A concentration stored in RalphGuard's catalog is treated as an example/reference concentration, not the hidden concentration of the scanned product.

For a reference value `r`, the initial range is deliberately broader than the reference:

```text
min ~= 0.5 r
midpoint = r
max ~= max(2 r, r + 0.5)
```

The range is clipped to physically meaningful bounds. The UI labels this basis as `ฐานข้อมูล + ลำดับฉลาก` with Medium confidence.

### 3. Order-only fallback is low confidence

When there is no explicit percentage and no catalog anchor, RalphGuard produces a broad declining simulation prior from list position. This is only a numerical starting point for screening and is marked Low confidence.

The system does **not** claim that list position mathematically determines concentration.

### 4. Ordering is enforced only before a plausible <=1% tail

RalphGuard infers a possible 1% breakpoint only when an available concentration anchor at or below 1% is not contradicted by a later known anchor above 1%.

Before that breakpoint:

```text
midpoint[i] <= midpoint[i-1]
upper_bound[i] <= upper_bound[i-1]
```

Inside the inferred tail:

```text
0 < estimated concentration <= 1%
```

but RalphGuard deliberately stops forcing descending order between those tail ingredients.

This avoids the incorrect assumption that ingredient #9 must always have a larger concentration than ingredient #10.

### 5. Formula total is not forced to 100% by inventing hidden ingredients

Estimated QSAR-eligible ingredients are capped at a provisional total of 99% to leave rounding/headroom for Water/Base, known non-QSAR ingredients, or unresolved components. The old arbitrary 35% non-water cap has been removed.

The remaining amount shown in the OCR UI is therefore described as:

> remaining for Water/Base or ingredients not entering QSAR

not as a reconstructed water percentage.

## UI interpretation

Each OCR ingredient displays:

```text
Ingredient name
simulation midpoint %
estimated range min–max %
confidence: High / Medium / Low
basis: label / catalog+order / order only / <=1% tail
```

If the user edits the percentage, the row changes to `ผู้ใช้กำหนด` and no longer presents the system estimate as the active value.

The import button explicitly states that estimated rows use their midpoint for provisional screening.

## Current limitation

The current production assessment API still consumes a single concentration per formula ingredient. Therefore RalphGuard currently imports the **midpoint** after user review.

A future extension can propagate the OCR min/max ranges through repeated formula simulations and report a risk interval such as:

```text
Skin risk: 11–29
central screening estimate: 18
```

That future interval would represent uncertainty from unknown formulation concentration; it should not be described as a clinical confidence interval.
