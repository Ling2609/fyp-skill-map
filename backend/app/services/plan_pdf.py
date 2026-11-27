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
# Bandit B406: reviewed, escapes text written INTO the PDF; no XML is read or parsed
from xml.sax.saxutils import escape  # nosec B406

from markdown_it import MarkdownIt
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (Flowable, HRFlowable, KeepTogether, ListFlowable, ListItem, Paragraph, Preformatted,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

# 13 Oct (audit): say what the check does and doesn't cover, and that search links are searches
DISCLAIMER = ("Made by SkillMap's AI Assistant from your profile and the job's skills. Links to resources were checked "
              "to open on the date shown in SkillMap, not reviewed in full; Coursera and YouTube links are searches, "
              "so pick a result yourself. Check each resource before you rely on it.")
MD = MarkdownIt("commonmark").enable("table").enable("strikethrough")

INK = colors.HexColor("#16142b")
ACCENT = colors.HexColor("#2557c4")
ACCENT_STRONG = colors.HexColor("#1d469f")
ACCENT_SOFT = colors.HexColor("#e3ebfa")
HAVE_SOFT = colors.HexColor("#dcf2ef")
HAVE_STRONG = colors.HexColor("#0f7a70")
PARTIAL = colors.HexColor("#e0a21a")
LINE = colors.HexColor("#c9d5ee")

_base = dict(fontName="Helvetica", textColor=colors.black, alignment=TA_LEFT)
S = {
    "meta": ParagraphStyle("meta", fontSize=8.5, leading=11, **{**_base, "textColor": ACCENT}),
    "title": ParagraphStyle("title", fontSize=17, leading=21, spaceBefore=4, spaceAfter=4,
                            **{**_base, "fontName": "Helvetica-Bold", "textColor": ACCENT_STRONG}),
    "info": ParagraphStyle("info", fontSize=9.5, leading=13, spaceAfter=2, **{**_base, "textColor": INK}),
    # 27 Nov (her review: the sections sat too close on paper): 24pt above a section label, 8pt under it
    "h": ParagraphStyle("h", fontSize=11.5, leading=14, spaceBefore=24, spaceAfter=8,
                        **{**_base, "fontName": "Helvetica-Bold", "textColor": ACCENT_STRONG}),
    "body": ParagraphStyle("body", fontSize=9.5, leading=14.5, spaceAfter=9, **_base),
    "code": ParagraphStyle("code", fontName="Courier", fontSize=8.5, leading=12, spaceAfter=4),
    "cell": ParagraphStyle("cell", fontSize=9, leading=12, **_base),
    "head": ParagraphStyle("head", fontSize=9, leading=12, **{**_base, "fontName": "Helvetica-Bold", "textColor": ACCENT_STRONG}),
    "step": ParagraphStyle("step", fontSize=9.5, leading=12, **{**_base, "fontName": "Helvetica-Bold", "textColor": ACCENT}),
    "last": ParagraphStyle("last", fontSize=9, leading=12, **{**_base, "textColor": HAVE_STRONG, "fontName": "Helvetica-Bold"}),
    "note": ParagraphStyle("note", fontSize=8, leading=10.5, **_base),
}
S["prose"] = ParagraphStyle("prose", parent=S["body"], alignment=TA_JUSTIFY)


class Glyph(Flowable):
    """A small section mark drawn with canvas primitives: no icon font is bundled, so these are lines and arcs."""
    def __init__(self, kind, size=3.4 * mm):
        super().__init__()
        self.kind, self.width, self.height = kind, size, size

    def draw(self):
        c, u = self.canv, self.width / 16.0
        c.saveState()
        c.setStrokeColor(ACCENT)
        c.setLineWidth(1.3)
        c.setLineCap(1)
        c.setLineJoin(1)
        if self.kind == "play":
            p = c.beginPath(); p.moveTo(4 * u, 2 * u); p.lineTo(4 * u, 14 * u); p.lineTo(13 * u, 8 * u); p.close()
            c.setFillColor(ACCENT); c.drawPath(p, stroke=0, fill=1)
        elif self.kind == "book":
            c.rect(3 * u, 2.5 * u, 10 * u, 11 * u, stroke=1, fill=0)
            c.line(6.4 * u, 2.5 * u, 6.4 * u, 13.5 * u)
        elif self.kind == "route":
            c.circle(4.5 * u, 12 * u, 1.6 * u, stroke=1, fill=0)
            c.circle(11.5 * u, 4 * u, 1.6 * u, stroke=1, fill=0)
            c.line(6.1 * u, 12 * u, 9 * u, 12 * u); c.line(9 * u, 12 * u, 9 * u, 4 * u); c.line(9 * u, 4 * u, 9.9 * u, 4 * u)
        elif self.kind == "code":
            c.line(6 * u, 5 * u, 3 * u, 8 * u); c.line(3 * u, 8 * u, 6 * u, 11 * u)
            c.line(10 * u, 5 * u, 13 * u, 8 * u); c.line(13 * u, 8 * u, 10 * u, 11 * u)
        elif self.kind == "alert":
            p = c.beginPath(); p.moveTo(8 * u, 13.5 * u); p.lineTo(14 * u, 3 * u); p.lineTo(2 * u, 3 * u); p.close()
            c.drawPath(p, stroke=1, fill=0); c.line(8 * u, 6 * u, 8 * u, 9 * u)
        elif self.kind == "case":
            c.rect(2 * u, 3 * u, 12 * u, 9 * u, stroke=1, fill=0)
            c.line(6 * u, 12 * u, 6 * u, 13.5 * u); c.line(6 * u, 13.5 * u, 10 * u, 13.5 * u); c.line(10 * u, 13.5 * u, 10 * u, 12 * u)
        elif self.kind == "check":
            c.circle(8 * u, 8 * u, 6 * u, stroke=1, fill=0)
            c.line(5 * u, 8 * u, 7.3 * u, 10.3 * u); c.line(7.3 * u, 10.3 * u, 11 * u, 6 * u)
        c.restoreState()


SECTION_MARKS = [
    ("quick start", "play"), ("resource", "book"), ("your plan", "route"), ("worked example", "code"),
    ("common mistake", "alert"), ("show it", "case"), ("portfolio", "case"), ("check your progress", "check"),
]


def mark_for(text: str) -> str | None:
    low = (text or "").lower()
    for needle, kind in SECTION_MARKS:
        if needle in low:
            return kind
    return None


class Trail(Flowable):
    """The gap as a trail: a filled dot per skill the student has, a pale one per skill still missing, a flag at the
    end. It is the same idea as the dots on Job Detail, drawn small so it costs one line."""
    def __init__(self, have: int, missing: int, size=3.0 * mm, gap=1.2 * mm, cap=14):
        super().__init__()
        self.have, self.missing = have, missing
        self.size, self.gap, self.cap = size, gap, cap
        total = min(have + missing, cap)
        self.total = total
        self.width, self.height = total * (size + gap) + 4 * mm, size

    def draw(self):
        c, size, step = self.canv, self.size, self.size + self.gap
        y = self.size / 2
        for i in range(self.total):
            x = i * step + size / 2
            if i < self.have:
                c.setFillColor(colors.HexColor("#0f9d8f")); c.circle(x, y, size / 2 - 0.4, stroke=0, fill=1)
            else:
                c.setFillColor(colors.HexColor("#f6ded6")); c.circle(x, y, size / 2 - 0.4, stroke=0, fill=1)
        fx = self.total * step + 1.5 * mm
        c.setStrokeColor(ACCENT); c.setLineWidth(1.3); c.line(fx, 0.4 * mm, fx, size - 0.2 * mm)
        p = c.beginPath(); p.moveTo(fx, size - 0.4 * mm); p.lineTo(fx + 2.6 * mm, size - 1.3 * mm)
        p.lineTo(fx, size - 2.3 * mm); p.close(); c.setFillColor(ACCENT); c.drawPath(p, stroke=0, fill=1)


class TickBox(Flowable):
    """A fillable PDF checkbox that also prints as an empty square."""
    def __init__(self, label, size=4 * mm):
        super().__init__()
        self.label = label
        self.width = self.height = size

    def draw(self):
        self.canv.acroForm.checkboxRelative(
            tooltip=self.label, x=0, y=0, size=self.width,
            checked=False, buttonStyle="check", borderWidth=0.8,
            borderColor=ACCENT, fillColor=colors.white, textColor=ACCENT,
            annotationFlags="print", fieldFlags="",
        )


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
    for index, row in enumerate(body, start=1):
        last_row = index == len(body)          # "Add it to SkillMap": the finish
        style = S["last"] if last_row else S["cell"]
        cells = [Paragraph(c, S["step"] if (i == 0 and not last_row) else style)
                 for i, c in enumerate((row + [""] * n)[:n])]
        step = cells[0].getPlainText() or str(index)
        data.append(cells + [TickBox(f"Mark step {step} as done")])
    done_w = 13 * mm
    weights = [1.0] * n
    for i, h in enumerate(head):
        low = h.lower()
        weights[i] = 2.6 if "what" in low else 1.7 if "done when" in low else 0.9 if "time" in low else 1.1
    unit = (width - done_w) / sum(weights)
    t = Table(data, colWidths=[w * unit for w in weights] + [done_w], repeatRows=1)
    style_rows = [
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE),
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, LINE),
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT_SOFT),
        ("BACKGROUND", (0, len(body)), (-1, len(body)), HAVE_SOFT),   # the finish row
        ("LINEBEFORE", (0, 0), (0, -2), 2.5, ACCENT),                # the step numbers read as a rail
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (-1, 1), (-1, -1), "CENTER"), ("ALIGN", (2, 1), (2, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]
    t.setStyle(TableStyle(style_rows))
    t.spaceBefore = 6
    t.spaceAfter = 8
    return t


def plan_flowables(markdown: str, width: float, skip_title: bool = True) -> list:
    """The plan's Markdown as PDF blocks, in order."""
    return _blocks(MD.parse(markdown or ""), width, skip_title)


def _blocks(tokens, width, skip_title=False, *, in_list=False):
    out, i = [], 0
    next_number = 1
    first_heading = True
    while i < len(tokens):
        t = tokens[i]
        if t.type not in ("fence", "code_block", "ordered_list_open"):
            next_number = 1
        if t.type == "heading_open":
            text = _inline(tokens[i + 1])
            if not (skip_title and first_heading and tokens[i + 1].content.lower().startswith("learning plan")):
                kind = mark_for(tokens[i + 1].content)
                head = Table([[Glyph(kind) if kind else "", Paragraph(text, S["h"])]],
                             colWidths=[5.5 * mm, width - 5.5 * mm] if kind else [0, width])
                head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                          ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                          ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                                          ("BOTTOMPADDING", (0, 0), (-1, 0), 0)]))
                # 27 Nov: the heading is a one-row table, so the Paragraph's own spaceBefore is ignored — the gap has to
                # be set on the table itself, or sections run into each other exactly as she saw.
                head.spaceBefore = 0 if first_heading else 26
                head.spaceAfter = 2
                out += [head, HRFlowable(width="100%", thickness=0.8, color=LINE, spaceBefore=0, spaceAfter=6)]
            first_heading = False
            i += 3
        elif t.type in ("fence", "code_block"):          # a command block: monospace, wrapped like any text
            out.append(Preformatted(t.content.rstrip("\n"), S["code"], maxLineLength=88))
            i += 1
        elif t.type == "paragraph_open":
            out.append(Paragraph(_inline(tokens[i + 1]), S["body" if in_list else "prose"]))
            i += 3
        elif t.type in ("bullet_list_open", "ordered_list_open"):
            items, j = [], i + 1
            while tokens[j].type == "list_item_open":
                item_end, depth = j + 1, 1
                while depth:
                    kind = tokens[item_end].type
                    depth += (kind == "list_item_open") - (kind == "list_item_close")
                    item_end += 1
                blocks = _blocks(tokens[j + 1:item_end - 1], max(1, width - 12), in_list=True)
                items.append(ListItem(blocks or [Paragraph("", S["body"])], leftIndent=12))
                j = item_end
            ordered = t.type == "ordered_list_open"
            start = int(t.attrGet("start") or next_number) if ordered else None
            if ordered:
                next_number = start + len(items)
            out.append(ListFlowable(items, bulletType="1" if ordered else "bullet", start=start,
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
    # 27 Nov (her review: "You already have: ... Missing for this job: ... You already have 2 of 3 of this ad's
    # skills" said it three times): the trail shows how far along she is, one line says what is left.
    if have or missing:
        total = len(have) + len(missing)
        line = f"{len(have)} of {total} of this ad's skills are already yours"
        if missing:
            line += f" · still to learn: {', '.join(missing[:4])}"
        story += [Spacer(1, 4), Trail(len(have), len(missing)), Spacer(1, 2),
                  Paragraph(escape(line + "."), S["meta"])]
    story.append(Spacer(1, 4))
    story += plan_flowables(markdown, doc.width)
    story += [Spacer(1, 10), KeepTogether([HRFlowable(width="100%", thickness=0.5, color=LINE, spaceAfter=4),
                                           Paragraph(escape(DISCLAIMER), S["note"])])]

    def footer(canvas, d):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(ACCENT)
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {d.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
