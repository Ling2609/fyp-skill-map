"""A workshop proposal (routers/workshop.py) as an A4 PDF, in the same type and margins as the learning plan PDF."""
from io import BytesIO
from xml.sax.saxutils import escape  # nosec B406

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.services.plan_pdf import S, plain_text

SECTIONS = [("background", "1. Background"), ("objectives", "2. Objectives"), ("outcomes", "3. Learning outcomes"),
            ("participants", "4. Participants"), ("agenda", "5. Agenda"), ("partners", "6. Speakers and industry partners"),
            ("resources", "7. Resources and budget"), ("evaluation", "8. Evaluation")]


TO_FILL = escape("[to fill in]")


def _p(text: str, style: str = "body") -> Paragraph:
    # 20 Nov (her review): the parts left to fill in stand out on paper too
    html = escape(plain_text(text or "")).replace(TO_FILL, f'<font backColor="#fff1c2">{TO_FILL}</font>')
    return Paragraph(html, S[style])


def build_workshop_pdf(p: dict) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                            bottomMargin=18 * mm, title=plain_text(p["title"]), author="SkillMap career office")
    story = [_p("SkillMap · Activity proposal · Career office", "meta"), _p(p["title"], "title"),
             _p(" · ".join(p.get("facts") or []), "info"), Spacer(1, 4)]
    for key, heading in SECTIONS:
        story.append(_p(heading, "h"))
        value = p.get(key)
        if key == "objectives":
            story += [_p(f"• {o}") for o in value or []]
        elif key == "agenda":
            rows = [[_p("Time", "head"), _p("Session", "head")]] + [[_p(t, "cell"), _p(s, "cell")] for t, s in value or []]
            t = Table(rows, colWidths=[32 * mm, doc.width - 32 * mm])
            t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#d6dce5")),
                                   ("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
            story.append(t)
        else:
            story.append(_p(value))

    def footer(canvas, d):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.drawString(18 * mm, 10 * mm, "Figures from SkillMap's job matching; text drafted with AI and checked by the career office.")
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {d.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
