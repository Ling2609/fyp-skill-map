"""
"Download plan (PDF)" in the AI Assistant (13 Oct 2026, mock-up v4_plan_pdf, her pick). The whole plan message as an
A4 page to print and tick off: a header (who it is for, the goal, the job, what they have and miss), the plan's own
sections, a "Done" box on every step, and a note that the AI wrote it. Black and white only: she prints in black
and white (no shading or coloured backgrounds).

The plan is the assistant's Markdown reply; markdown-it reads it (headings, paragraphs, lists, the plan table).
Links are printed as their address, since paper can't be clicked.
"""
from datetime import date
from io import BytesIO
from xml.sax.saxutils import escape  # nosec B406: escapes text written INTO the PDF; no XML is read or parsed

from markdown_it import MarkdownIt
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (Flowable, HRFlowable, KeepTogether, ListFlowable, ListItem, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

# 13 Oct (audit): say what the check does and doesn't cover, and that search links are searches
DISCLAIMER = ("Made by SkillMap's AI Assistant from your profile and the job's skills. Links to resources were checked "
              "to open on the date shown in SkillMap, not reviewed in full; Coursera and YouTube links are searches, "
              "so pick a result yourself. Check each resource before you rely on it.")
MD = MarkdownIt("commonmark").enable("table").enable("strikethrough")

_base = dict(fontName="Helvetica", textColor=colors.black, alignment=TA_LEFT)
S = {
    "meta": ParagraphStyle("meta", fontSize=8.5, leading=11, **_base),
    "title": ParagraphStyle("title", fontSize=17, leading=21, spaceBefore=4, spaceAfter=4,
                            **{**_base, "fontName": "Helvetica-Bold"}),
    "info": ParagraphStyle("info", fontSize=9.5, leading=13, spaceAfter=2, **_base),
    "h": ParagraphStyle("h", fontSize=11.5, leading=14, spaceBefore=10, spaceAfter=2,
                        **{**_base, "fontName": "Helvetica-Bold"}),
    "body": ParagraphStyle("body", fontSize=9.5, leading=13.5, spaceAfter=4, **_base),
    "cell": ParagraphStyle("cell", fontSize=9, leading=12, **_base),
    "head": ParagraphStyle("head", fontSize=9, leading=12, **{**_base, "fontName": "Helvetica-Bold"}),
    "note": ParagraphStyle("note", fontSize=8, leading=10.5, **_base),
}


class TickBox(Flowable):
    """An empty square to tick by hand."""
    def __init__(self, size=4 * mm):
        super().__init__()
        self.width = self.height = size

    def draw(self):
        self.canv.setLineWidth(0.8)
        self.canv.rect(0, 0, self.width, self.height)


def _inline(token) -> str:
    """markdown-it inline tokens -> ReportLab's small markup (bold, italic, code); links become 'text (address)'."""
    out, href = [], []
    for c in token.children or []:
        t = c.type
        if t == "text":
            out.append(escape(c.content))
        elif t == "code_inline":
            out.append(f'<font name="Courier">{escape(c.content)}</font>')
        elif t in ("softbreak", "hardbreak"):
            out.append(" " if t == "softbreak" else "<br/>")
        elif t == "strong_open":
            out.append("<b>")
        elif t == "strong_close":
            out.append("</b>")
        elif t == "em_open":
            out.append("<i>")
        elif t == "em_close":
            out.append("</i>")
        elif t == "link_open":
            href.append(c.attrs.get("href", ""))
        elif t == "link_close":
            url = href.pop() if href else ""
            if url:
                out.append(f" ({escape(url)})")
    return "".join(out)


def _table(rows: list[list[str]], width: float) -> Table:
    """The plan table with a 'Done' box at the end of every step; the widest column is 'What to do'."""
    head, body = rows[0], rows[1:]
    n = len(head)
    data = [[Paragraph(h, S["head"]) for h in head] + [Paragraph("Done", S["head"])]]
    data += [[Paragraph(c, S["cell"]) for c in (r + [""] * n)[:n]] + [TickBox()] for r in body]
    done_w = 13 * mm
    weights = [1.0] * n
    for i, h in enumerate(head):
        low = h.lower()
        weights[i] = 2.6 if "what" in low else 1.7 if "done when" in low else 0.9 if "time" in low else 1.1
    unit = (width - done_w) / sum(weights)
    t = Table(data, colWidths=[w * unit for w in weights] + [done_w], repeatRows=1)
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (-1, 1), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def plan_flowables(markdown: str, width: float, skip_title: bool = True) -> list:
    """The plan's Markdown as PDF blocks, in order."""
    tokens, out, i = MD.parse(markdown or ""), [], 0
    first_heading = True
    while i < len(tokens):
        t = tokens[i]
        if t.type == "heading_open":
            text = _inline(tokens[i + 1])
            if not (skip_title and first_heading and tokens[i + 1].content.lower().startswith("learning plan")):
                out += [Paragraph(text, S["h"]), HRFlowable(width="100%", thickness=0.6, color=colors.black,
                                                            spaceBefore=1, spaceAfter=4)]
            first_heading = False
            i += 3
        elif t.type in ("fence", "code_block"):          # a command block: monospace, wrapped like any text
            code = "<br/>".join(escape(line) for line in t.content.rstrip("\n").split("\n"))
            out.append(Paragraph(f'<font name="Courier">{code}</font>', S["body"]))
            i += 1
        elif t.type == "paragraph_open":
            out.append(Paragraph(_inline(tokens[i + 1]), S["body"]))
            i += 3
        elif t.type in ("bullet_list_open", "ordered_list_open"):
            depth, items, j = 0, [], i
            while j < len(tokens):
                tj = tokens[j]
                if tj.type in ("bullet_list_open", "ordered_list_open"):
                    depth += 1
                elif tj.type in ("bullet_list_close", "ordered_list_close"):
                    depth -= 1
                    if depth == 0:
                        break
                elif tj.type == "inline":
                    items.append(("    " * (depth - 1)) + _inline(tj))
                j += 1
            ordered = t.type == "ordered_list_open"
            out.append(ListFlowable([ListItem(Paragraph(x, S["body"]), leftIndent=12) for x in items],
                                    bulletType="1" if ordered else "bullet", start="1" if ordered else None,
                                    bulletFontSize=8 if not ordered else 9.5, leftIndent=12))
            i = j + 1
        elif t.type == "table_open":
            rows, row, j = [], None, i
            while tokens[j].type != "table_close":
                tj = tokens[j]
                if tj.type == "tr_open":
                    row = []
                elif tj.type == "tr_close":
                    rows.append(row)
                elif tj.type == "inline":
                    row.append(_inline(tj))
                j += 1
            if rows:
                out += [_table(rows, width), Spacer(1, 4)]
            i = j + 1
        else:
            i += 1
    return out


# 13 Oct (her first real PDF showed "data■heavy", "step■by■step"): the model writes non-breaking hyphens and thin
# spaces, which the PDF's built-in Helvetica can't draw. They are swapped for plain ones before printing.
_PLAIN = str.maketrans({"\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2212": "-", "\u00ad": "",
                        "\u00a0": " ", "\u2007": " ", "\u2009": " ", "\u200a": " ", "\u202f": " ",
                        "\u200b": "", "\u2060": "", "\ufeff": "", "\u2264": "<=", "\u2265": ">=",
                        "\u2192": "->", "\u2190": "<-", "\u2713": "v", "\u2714": "v"})


def plain_text(text: str) -> str:
    return (text or "").translate(_PLAIN)


def build_pdf(markdown: str, *, student: str, goal: str | None, job: str | None, have: list[str],
              missing: list[str], skill: str | None, today: date | None = None) -> bytes:
    today = today or date.today()
    markdown, student, skill = plain_text(markdown), plain_text(student), plain_text(skill) if skill else skill
    goal, job = plain_text(goal) if goal else goal, plain_text(job) if job else job
    have, missing = [plain_text(x) for x in have], [plain_text(x) for x in missing]
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                            bottomMargin=18 * mm, title=f"Learning plan: {skill or 'your skill'}", author="SkillMap")
    day = f"{today.day} {today.strftime('%b %Y')}"
    story = [Paragraph(f"SkillMap · Learning plan · {day}", S["meta"]),
             Paragraph(escape(f"Learning plan: {skill}" if skill else "Learning plan"), S["title"])]
    who = [f"For: {student}"] + ([f"Goal: {goal}"] if goal else []) + ([f"Job: {job}"] if job else [])
    story.append(Paragraph(escape(" · ".join(who)), S["info"]))
    if have or missing:
        parts = ([f"You already have: {', '.join(have)}."] if have else []) + \
                ([f"Missing for this job: {', '.join(missing)}."] if missing else [])
        story.append(Paragraph(escape(" ".join(parts)), S["info"]))
    story.append(Spacer(1, 4))
    story += plan_flowables(markdown, doc.width)
    story += [Spacer(1, 10), KeepTogether([HRFlowable(width="100%", thickness=0.4, color=colors.black, spaceAfter=4),
                                           Paragraph(escape(DISCLAIMER), S["note"])])]

    def footer(canvas, d):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {d.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
