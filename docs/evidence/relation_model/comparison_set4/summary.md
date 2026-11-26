# Relationship models on blind set v4

Test pairs: `data/skill_relations/reference_pairs_v4.csv`. Main result: majority labels (2 of 3 judges agree); unanimous as a check.
"Has it" = class SATISFIES, except the final model, judged at the app's cut-off p >= 0.6.
Weighted = population-weighted over the cosine bands >= 0.55 (the bands were sampled at different rates).

## Majority labels (n = 132)

| Model | Macro-F1 | Accuracy | Has-it precision | Has-it recall | False has-it | Weighted has-it F1 |
|---|---|---|---|---|---|---|
| SBERT cosine >= 0.7 (before the model) | 0.516 | 0.515 | 0.375 | 0.600 | 30 | 0.190 |
| Untuned nli-deberta-v3-base (zero-shot) | 0.568 | 0.629 | 0.500 | 0.267 | 8 | 0.253 |
| Run 1 - ESCO/O*NET only (BERT) | 0.391 | 0.348 | 0.262 | 0.900 | 76 | 0.328 |
| Run 2 - SkillMap pairs only (BERT) | 0.504 | 0.614 | 0.417 | 0.167 | 7 | 0.238 |
| Run 3 - ESCO/O*NET + SkillMap (BERT) | 0.624 | 0.629 | 0.421 | 0.800 | 33 | 0.518 |
| Run 3b - + reweighting (BERT) | 0.570 | 0.614 | 0.450 | 0.600 | 22 | 0.427 |
| Run 4 - NLI start (RoBERTa) | 0.620 | 0.667 | 0.469 | 0.500 | 17 | 0.430 |
| Run 5 - + SkillMap v3 (RoBERTa) | 0.593 | 0.652 | 0.462 | 0.400 | 14 | 0.340 |
| Run 6a - soft labels, 3 seeds (RoBERTa) | 0.567 | 0.636 | 0.464 | 0.433 | 15 | 0.291 |
| **Run 6 - soft labels, 3 seeds (DeBERTa-v3) = FINAL** | 0.667 | 0.689 | 0.500 | 0.633 | 19 | 0.476 |

## Unanimous labels (n = 91)

| Model | Macro-F1 | Accuracy | Has-it precision | Has-it recall | False has-it | Weighted has-it F1 |
|---|---|---|---|---|---|---|
| SBERT cosine >= 0.7 (before the model) | 0.593 | 0.582 | 0.353 | 0.667 | 22 | 0.209 |
| Untuned nli-deberta-v3-base (zero-shot) | 0.612 | 0.659 | 0.500 | 0.389 | 7 | 0.477 |
| Run 1 - ESCO/O*NET only (BERT) | 0.412 | 0.352 | 0.246 | 0.944 | 52 | 0.233 |
| Run 2 - SkillMap pairs only (BERT) | 0.584 | 0.703 | 0.333 | 0.167 | 6 | 0.102 |
| Run 3 - ESCO/O*NET + SkillMap (BERT) | 0.709 | 0.703 | 0.424 | 0.778 | 19 | 0.423 |
| Run 3b - + reweighting (BERT) | 0.669 | 0.703 | 0.458 | 0.611 | 13 | 0.386 |
| Run 4 - NLI start (RoBERTa) | 0.688 | 0.725 | 0.450 | 0.500 | 11 | 0.242 |
| Run 5 - + SkillMap v3 (RoBERTa) | 0.710 | 0.758 | 0.533 | 0.444 | 7 | 0.277 |
| Run 6a - soft labels, 3 seeds (RoBERTa) | 0.656 | 0.714 | 0.529 | 0.500 | 8 | 0.252 |
| **Run 6 - soft labels, 3 seeds (DeBERTa-v3) = FINAL** | 0.815 | 0.824 | 0.609 | 0.778 | 9 | 0.787 |

## Accuracy per cosine band (majority labels)

| Model | 0.85+ | 0.75-0.85 | 0.65-0.75 | 0.55-0.65 | <0.55 |
|---|---|---|---|---|---|
| SBERT cosine >= 0.7 (before the model) | - | 0.46 | 0.58 | 0.33 | 0.93 |
| Untuned nli-deberta-v3-base (zero-shot) | - | 0.54 | 0.65 | 0.56 | 0.93 |
| Run 1 - ESCO/O*NET only (BERT) | - | 0.46 | 0.16 | 0.26 | 0.87 |
| Run 2 - SkillMap pairs only (BERT) | - | 0.43 | 0.74 | 0.56 | 0.80 |
| Run 3 - ESCO/O*NET + SkillMap (BERT) | - | 0.63 | 0.63 | 0.54 | 0.87 |
| Run 3b - + reweighting (BERT) | - | 0.63 | 0.65 | 0.54 | 0.67 |
| Run 4 - NLI start (RoBERTa) | - | 0.57 | 0.70 | 0.67 | 0.80 |
| Run 5 - + SkillMap v3 (RoBERTa) | - | 0.60 | 0.70 | 0.59 | 0.80 |
| Run 6a - soft labels, 3 seeds (RoBERTa) | - | 0.57 | 0.74 | 0.56 | 0.67 |
| Run 6 - soft labels, 3 seeds (DeBERTa-v3) = FINAL | - | 0.66 | 0.79 | 0.51 | 0.93 |

## Final model's false "has it" (p >= 0.6, majority label not SATISFIES): 13 pairs

See `false_has_final.csv` (pair, cosine band, probability, each judge's label).
