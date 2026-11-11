# Evidence-Gated Continual Learning

RalphGuard does not train on its own predictions or on user submissions. An unseen molecule is predicted normally with applicability-domain and uncertainty information, then stored only as an observation with `training_eligible=false`.

It enters a continual candidate queue only when independent evidence supplies a verified endpoint label, molecular identity matches, no same-tier conflict exists, and the identity is not reserved for an external/final holdout.

The MVP treats RDKit features as a frozen representation and uses an experimental incremental logistic head. Every update combines verified new evidence with a scaffold- and class-aware replay buffer, creates a new candidate version, and reports before/after performance on the new stream and untouched final holdout. Production artifacts are unchanged until manual promotion.

