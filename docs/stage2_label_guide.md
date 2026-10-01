# Stage 2 label guide: how a student skill relates to a job skill

One guide for everyone who labels a pair: the LLM labelling prompt, the three judges of the reference set, and the
author's spot-check. Labels only mean the same thing across labellers if they follow the same written rules.

## The question

Every pair has a direction: **A = the student's skill → B = the job's skill.**

> If a candidate genuinely has **A**, would a recruiter accept that they have **B**?

Ask it both ways (A → B and B → A), then pick the label:

| A → B accepted? | B → A accepted? | Label | Counts for the job? (training class) |
|---|---|---|---|
| yes | yes | **SAME** | yes (SATISFIES) |
| yes | no | **NARROWER** | yes (SATISFIES) |
| no | yes | **BROADER** | no (NOT) |
| no | no, but close | **RELATED** | no, shown as related (RELATED) |
| no | no | **DIFFERENT** | no (NOT) |

"Close" for RELATED means: the same area, easy to transfer, alternatives for the same job (AWS / Azure), or
usually used together (Python / Selenium).

The names NARROWER / BROADER follow the skill hierarchies in ESCO and SKOS ("broader" / "narrower" concept). The
test, though, is whether having one shows the other, not where they sit in a taxonomy. So a framework counts as
narrower than the language it is written in (Flutter → Dart): you can't do Flutter without Dart.

## Rules for hard cases

1. **When unsure, pick the more cautious label.** SAME vs NARROWER → NARROWER; NARROWER vs RELATED → RELATED;
   RELATED vs DIFFERENT → RELATED. A wrong "has the skill" hides a real gap. That is the costly error, the same
   precision-first rule as A8.
2. **Spelling, abbreviation, filler words and versions are SAME:** "JS" / "JavaScript", "Python programming" /
   "Python", "HTML5" / "HTML". The exception: when the job skill names a specific version as the point
   ("Angular 17 migration"), the generic skill is BROADER.
3. **A tool and its general area:** the tool is NARROWER than the area (Docker → Containerisation, PostgreSQL →
   Relational databases). The area is BROADER than the tool (Databases → PostgreSQL).
4. **Part of a broad field:** a substantial part counts as NARROWER (Unit testing → Software testing,
   Machine learning → Artificial intelligence). A small or side part is RELATED (Excel → Data analysis).
5. **A language and a product that uses it:** MySQL → SQL is NARROWER (using MySQL means writing SQL). SQL →
   MySQL is RELATED, because knowing SQL doesn't show you can run MySQL.
6. **Methods and their family:** Scrum → Agile is NARROWER; Agile → Scrum is BROADER.
7. **Look-alike names are DIFFERENT unless the skills really are close:** Java / JavaScript = DIFFERENT.
   React / React Native = RELATED.
8. **Soft skills follow the same rules:** Teamwork / Team collaboration = SAME; Communication → Presentation
   skills = BROADER.
9. **Never use the job title or the ad's context.** Judge only the two skill names, so a label means the same
   thing in every job.

## Worked examples (A = student → B = job)

| A (student) | B (job) | Label | Why |
|---|---|---|---|
| MS SQL Server | SQL Server | SAME | same product |
| Teamwork | Team collaboration | SAME | same ability, different words |
| Flutter | Dart | NARROWER | Flutter apps are written in Dart |
| Dart | Flutter | BROADER | knowing Dart doesn't show Flutter |
| PostgreSQL | Relational databases | NARROWER | a kind of relational database |
| Programming | Python | BROADER | the general area doesn't show Python |
| Docker | Kubernetes | RELATED | used together; neither shows the other |
| AWS | Azure | RELATED | alternatives for the same job |
| Python | Selenium | RELATED | Selenium is often used from Python, but Python doesn't show Selenium |
| Unit testing | Software testing | NARROWER | a substantial part of testing |
| Network security | Cybersecurity | NARROWER | a substantial part of the field |
| Excel | Data analysis | RELATED | a tool for it, but not proof of it |
| Java | JavaScript | DIFFERENT | look-alike names only |
| Routing | Accounting | DIFFERENT | unrelated |

## How the guide is used

- **LLM labels:** the prompt includes this guide; every pair is asked in both orders. Answers that don't mirror
  (SAME ↔ SAME, NARROWER ↔ BROADER, RELATED ↔ RELATED, DIFFERENT ↔ DIFFERENT) are counted as the flip rate, a
  measure of how reliable the labels are, and the pair is left out of training.
- **High-confidence reference set:** about 400 pairs judged by three judges (Claude, gpt-oss-120b, Gemini) with
  this guide. Where all three agree, the label is high-confidence, not "gold". Agreement is reported as Fleiss' κ.
- **Author spot-check:** about 50 random pairs from the reference set, marked agree / disagree against these
  rules. This checks the set; it doesn't relabel it.
- **Training:** 5 labels are collapsed into 3 classes: SATISFIES (SAME + NARROWER), RELATED, NOT (BROADER + DIFFERENT).
