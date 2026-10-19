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

Where the pills appear (author's rule, 19 Oct: every job shown to students must be measured or stated):
- live jobs: read by the rules measured here;
- SkillMap employer posts: NOT read by the rules (they could not be measured: no real employer posts exist). The
  employer chooses minimum qualification (Malaysian Qualifications Framework names, or "Other" in their own words),
  field of study and languages (a list, or "Other") in
  Post a Job (option F; references.md "Employer posts"), and the pills show exactly that; a test checks save + display;
- 2024 JobStreet past postings: none (market data, not jobs to apply to).
On a phone the pill's ad quote (a hover tooltip) is not shown, on purpose, to keep the header uncluttered; the full
text is in the description.
