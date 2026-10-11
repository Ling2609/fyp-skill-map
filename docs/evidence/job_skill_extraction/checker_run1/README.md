# Checker, run 1 (11 Oct 2026, 22:36)

First full run of the skill checker (Cohere command-a-plus-05-2026) on the 30 development ads. Kept because the
second run (the files one folder up) gave different decisions with the same prompt and model: the checker's
answers change from run to run. Both runs fail the pre-registered gate (F1 up by at least 0.03 on these ads):

| Run | Precision | Recall | F1 change (95% CI, paired) |
|---|---|---|---|
| 1 (this folder) | 0.610 -> 0.651 | 0.807 -> 0.764 | +0.008 (-0.011 to +0.030) |
| 2 (one folder up) | 0.610 -> 0.666 | 0.807 -> 0.778 | +0.023 (+0.004 to +0.041) |

Decision: checker not adopted. Ad 1 (VMWare Admin) was checked once, by an earlier version of the prompt, and is
the same in both runs.
