"""
"Download plan (PDF)" in the AI Assistant (13 Oct 2026, mock-up v4_plan_pdf, her pick). The whole plan message as an
A4 page to print and tick off: a header (who it is for, the goal, the job, what they have and miss), the plan's own
sections, a "Done" box on every step, and a note that the AI wrote it. Black and white only: she prints in black
and white (no shading or coloured backgrounds).

The plan is the assistant's Markdown reply; markdown-it reads it (headings, paragraphs, lists, the plan table).
Links are printed as their address, since paper can't be clicked.
"""
import re
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
    "url": ParagraphStyle("url", **{**_base, "fontName": "Courier", "fontSize": 7.2, "leading": 9, "textColor": ACCENT}),
    "res": ParagraphStyle("res", fontSize=9, leading=12, **{**_base, "fontName": "Helvetica-Bold", "textColor": INK}),
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


class GapBar(Flowable):
    """How much of the ad's skill list the student already has, as one slim bar: teal for what they have, a pale track
    for the rest, and a small coral tick where this plan's skill sits. Clean on paper and readable in greyscale."""
    def __init__(self, have: int, missing: int, bar_w: float, height=3.2 * mm):
        super().__init__()
        self.have, self.missing = have, missing
        self.width, self.height = bar_w, height

    def draw(self):
        c, w, h = self.canv, self.width, self.height
        total = max(self.have + self.missing, 1)
        r = h / 2
        # the track
        c.setFillColor(colors.HexColor("#e8eef9"))
        c.roundRect(0, 0, w, h, r, stroke=0, fill=1)
        # what they have
        if self.have:
            c.setFillColor(colors.HexColor("#13998c"))
            c.roundRect(0, 0, max(w * self.have / total, h), h, r, stroke=0, fill=1)
        # where this plan's skill sits: the first skill still missing
        if self.have < total:
            x = w * self.have / total
            c.setFillColor(colors.HexColor("#e9795a"))
            c.setStrokeColor(colors.HexColor("#e9795a"))
            c.setLineWidth(1.4)
            c.line(x, -1.1 * mm, x, h + 1.1 * mm)


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


def _is_heading(flow) -> bool:
    """A section heading is a one-row table (mark + text); everything else is body."""
    return isinstance(flow, Table) and len(getattr(flow, "_cellvalues", [])) == 1


def _generic_table(rows: list[list[str]], width: float) -> list:
    """Any other table the assistant writes: plain rows, wrapping cells, one width per column."""
    n = max(len(r) for r in rows)
    data = [[Paragraph(cell or "", S["cell"]) for cell in (r + [""] * (n - len(r)))] for r in rows]
    table = Table(data, colWidths=[width / n] * n, repeatRows=1)
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT_SOFT),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    table.spaceBefore = 4
    table.spaceAfter = 6
    return [table]


def _steps(rows: list[list[str]], width: float) -> list:
    """The plan's steps as blocks instead of a five-column grid: number on the left, the action beside it, the tick box
    at the right edge, and one quiet line under it for the time and what "done" looks like. Blocks cannot fall out of
    line the way narrow table columns do, and they read in one pass on paper."""
    head, body = rows[0], rows[1:]
    out = []
    tick_w = 9 * mm
    num_w = 8 * mm
    for index, row in enumerate(body, start=1):
        cells = (row + [""] * len(head))[:len(head)]
        label = (cells[0] or str(index)).strip()
        what = (cells[1] if len(cells) > 1 else "").strip()
        time = (cells[2] if len(cells) > 2 else "").strip()
        when = (cells[3] if len(cells) > 3 else "").strip()
        last = index == len(body) and "skillmap" in label.lower()
        row_style = S["last"] if last else S["cell"]
        block = Table([[Paragraph(escape("✓" if last else label), S["step"] if not last else S["last"]),
                        Paragraph(what, row_style),
                        TickBox(f"Mark step {label} as done")]],
                      colWidths=[num_w, width - num_w - tick_w, tick_w])
        block.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (2, 0), (2, 0), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        meta = " · ".join(x for x in (time, f"Done when: {when}" if when else "") if x)
        out.append(KeepTogether([Spacer(1, 5), block,
                                 Paragraph(meta, S["meta"] if not last else S["last"])]))
    return out


def _inline_md(text: str) -> str:
    """Plain text with **bold** and `code` turned into the PDF's own markup, for a step's action.
    Done by hand rather than with a regex: the replacement strings must not be read as back references."""
    text = escape(text)
    while "`" in text:
        head, _, rest = text.partition("`")
        code, sep, tail = rest.partition("`")
        if not sep:
            break
        text = head + '<font face="Courier">' + code + "</font>" + tail
    while "**" in text:
        head, _, rest = text.partition("**")
        bold, sep, tail = rest.partition("**")
        if not sep:
            break
        text = head + "<b>" + bold + "</b>" + tail
    return text


def _plain(tokens) -> str:
    """One list item's text with its links kept as [title](url), so the resources table can split them."""
    for token in tokens:
        if token.type != "inline":
            continue
        out, in_link, href = "", False, ""
        for child in token.children or []:
            if child.type == "link_open":
                out += "["
                in_link = True
                href = child.attrGet("href") or ""      # the address sits on link_open, not on link_close
            elif child.type == "link_close":
                out += "](" + href + ")"
                in_link = False
            elif child.type == "code_inline":
                out += "`" + child.content + "`"
            elif child.type in ("text", "html_inline") and not (in_link and child.type == "html_inline"):
                out += child.content
        return out.strip()
    return ""


def _resources_table(items: list[str] | list[list[str]], width: float) -> Table:
    """The Resources section as a table (her review: a title with its long address in the same cell ran off the line):
    the name, what it covers, and the address in its own narrow column, which wraps instead of overflowing."""
    rows = [[Paragraph("Resource", S["head"]), Paragraph("What it covers", S["head"]), Paragraph("Address", S["head"])]]
    for item in items:
        if isinstance(item, list):          # a markdown table row: | Resource | What it covers |
            name, url, note = _split_resource(item[0] if item else "")
            given = (item[1] if len(item) > 1 else "").strip()
            note = " ".join(x for x in (note, given) if x).strip() or note
        else:
            name, url, note = _split_resource(item)
        rows.append([Paragraph(escape(name), S["res"]),
                     Paragraph(escape(note), S["cell"]),
                     Paragraph(escape(url), S["url"])])
    table = Table(rows, colWidths=[width * 0.34, width * 0.38, width * 0.28], repeatRows=1)
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT_SOFT),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    table.spaceBefore = 4
    table.spaceAfter = 6
    return table


def _split_resource(item: str) -> tuple[str, str, str]:
    """'**FastAPI Tutorial** – https://… | Parts 1-3 …' -> (name, url, note). Understands bold names, [name](url)
    links, and a bare address in the text, so every shape the assistant writes lands in the right column."""
    text = (item or "").strip()
    name, url, note = text, "", ""
    if text.startswith("[") and "](" in text:
        name, rest = text[1:].split("](", 1)
        url, _, note = rest.partition(")")
    else:
        found = re.search(r"https?://[^\s)|]+", text)
        if found:
            url = found.group(0).rstrip(".,;)")
            name = (text[:found.start()] + text[found.end():]).strip()
    for dash in ("—", "–", " - "):
        if dash in name:
            head, _, tail = name.partition(dash)
            name, note = head, (tail + (" " + note if note else ""))
            break
    name = re.sub(r"<[^>]+>", "", name)                 # markup from the table path
    name = re.sub(r"\*\*", "", name)                    # bold markers from the list path
    return name.strip(" .;*"), url.strip(), note.strip(" .;*")


def plan_flowables(markdown: str, width: float, skip_title: bool = True) -> list:
    """The plan's Markdown as PDF blocks, in order."""
    return _blocks(MD.parse(markdown or ""), width, skip_title)


def _blocks(tokens, width, skip_title=False, *, in_list=False):
    out, i = [], 0
    section = ""          # the heading the following blocks belong to (27 Nov: "Resources" gets a table)
    next_number = 1
    first_heading = True
    while i < len(tokens):
        t = tokens[i]
        if t.type not in ("fence", "code_block", "ordered_list_open"):
            next_number = 1
        if t.type == "heading_open":
            text = _inline(tokens[i + 1])
            section = (tokens[i + 1].content or "").strip() if not skip_title or not first_heading else section
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
        elif t.type in ("bullet_list_open", "ordered_list_open") and "resource" in section.lower():
            # 27 Nov (her review): the resources read as a list of title + long address in one cell; as a table they line
            # up, and the address has a column of its own that wraps.
            raw, j = [], i + 1
            while tokens[j].type == "list_item_open":
                item_end, depth = j + 1, 1
                while depth:
                    kind = tokens[item_end].type
                    depth += (kind == "list_item_open") - (kind == "list_item_close")
                    item_end += 1
                raw.append(_plain(tokens[j + 1:item_end - 1]))
                j = item_end
            out.append(_resources_table(raw, width))
            i = j + 1
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
                first = " ".join(rows[0]).lower() if rows[0] else ""
                if "resource" in first:
                    out.append(_resources_table(rows[1:], width))
                elif "step" in first:
                    out += _steps(rows, width)
                else:
                    out.extend(_generic_table(rows, width))
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
        story += [Spacer(1, 5), GapBar(len(have), len(missing), doc.width), Spacer(1, 3),
                  Paragraph(escape(line + "."), S["meta"])]
    story.append(Spacer(1, 4))
    # 27 Nov: a whole section kept together pushed short plans onto a second page with a nearly empty first one, so
    # only each step block is kept together (see _steps); sections flow and fill the page.
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
