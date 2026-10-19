# E6: what is shown to students (19 Oct)

scores.txt is the script's own output for run f6d0dec0 and is kept unchanged. Its last line lists every part that
passed the accuracy bar. The decision taken after reading per_ad.csv:

| Part | Rules right (30 ads) | Ads that have it, found | Shown on Job Detail |
|---|---|---|---|
| qualification | 28/30 | 14/16 | yes |
| field | 29/30 | 14/15 | yes |
| languages | 29/30 | 9/10 complete | yes |
| salary (text) | 30/30 | 2/2 | yes |
| citizenship | 28/30 | **0/2** | **no** |

Citizenship passed on accuracy only because 28 of the 30 ads have no such line; the rules missed both real cases
("permanent residency", "Malaysian candidates only"). A missing line could make an international student think a
job is open to them, so it is not shown (author's decision, option A). Not re-tested: 30 new ads would again hold
very few real cases.

Fixed after E6, not re-measured (the numbers above are for the frozen rules at e8aa4ca):
"B.S" and "University / University of Applied Sciences" as bachelor level, "<language> capability" as a language
line, salary per year or per month. Tests: backend/tests/test_ad_requirements.py (test_fixes_after_e6).
