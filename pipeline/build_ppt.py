#!/usr/bin/env python3
"""
Deterministic 9-slide 16:9 presentation builder for Chungnam Univ. Team B
(2026 DSC Shared University AI Project Challenge - Task 4).

Outputs:
  - presentation/충남대B팀_과제4_HWP_AI_행정자동화_발표자료.pptx
  - docs/충남대B팀_과제4_HWP_AI_행정자동화_발표자료.pptx
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Optional, Sequence, Tuple

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml import parse_xml
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

ROOT_DIR = Path(__file__).resolve().parent.parent
OUT_FILENAME = "충남대B팀_과제4_HWP_AI_행정자동화_발표자료.pptx"
PRES_PATH = ROOT_DIR / "presentation" / OUT_FILENAME
DOCS_PPT_PATH = ROOT_DIR / "docs" / OUT_FILENAME

QR_IMAGE_PATH = ROOT_DIR / "docs" / "qr.png"
DEMO_PREVIEW_PATH = ROOT_DIR / "presentation" / "demo_preview.png"

# Team metadata (single source of truth for cover, closing, and footers)
TEAM_LABEL = "충남대학교 B팀 (신수하 · 김우형)"
TOTAL_SLIDES = 9

# Color tokens matching the editorial monochrome web demo
WHITE = RGBColor(255, 255, 255)
INK = RGBColor(17, 24, 39)          # #111827
BODY = RGBColor(31, 41, 55)         # #1F2937
MUTED = RGBColor(75, 85, 99)        # #4B5563
SUBTLE = RGBColor(107, 114, 128)    # #6B7280
SLATE = RGBColor(100, 116, 139)     # #64748B
NAVY = RGBColor(30, 58, 138)        # #1E3A8A
NAVY_TINT = RGBColor(239, 246, 255)
CRIMSON = RGBColor(153, 27, 27)     # #991B1B
CRIMSON_TINT = RGBColor(254, 242, 242)
CRIMSON_BORDER = RGBColor(252, 165, 165)
EMERALD = RGBColor(6, 95, 70)       # #065F46
EMERALD_TINT = RGBColor(236, 253, 245)
SURFACE_SUB = RGBColor(249, 250, 251)
HEADER_BG = RGBColor(243, 244, 246)
BORDER_GRAY = RGBColor(209, 213, 219)
BORDER_DARK = RGBColor(55, 65, 81)

FONT_MAIN = "Apple SD Gothic Neo"


def set_cell_border(cell, border_hex: str = "D1D5DB", width_pt: float = 0.75) -> None:
    tcPr = cell._tc.get_or_add_tcPr()
    w_emu = str(int(width_pt * 12700))
    for side in ("lnL", "lnR", "lnT", "lnB"):
        for existing in tcPr.findall(qn(f"a:{side}")):
            tcPr.remove(existing)
        ln = parse_xml(
            f'<a:{side} xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
            f'w="{w_emu}" cap="flat" cmpd="sng" algn="ctr">'
            f'<a:solidFill><a:srgbClr val="{border_hex}"/></a:solidFill>'
            f'</a:{side}>'
        )
        tcPr.append(ln)


def style_run(run, size_pt: float, bold: bool, color: RGBColor, font_name: str = FONT_MAIN) -> None:
    run.font.name = font_name
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.color.rgb = color
    rPr = run._r.get_or_add_rPr()
    for tag in ("latin", "ea", "cs"):
        for existing in rPr.findall(qn(f"a:{tag}")):
            rPr.remove(existing)
        rPr.append(
            parse_xml(
                f'<a:{tag} xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" typeface="{font_name}"/>'
            )
        )


def add_rect(
    slide,
    x: float,
    y: float,
    w: float,
    h: float,
    fill: Optional[RGBColor] = WHITE,
    line_color: Optional[RGBColor] = BORDER_GRAY,
    line_pt: float = 0.75,
):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h)
    )
    shape.shadow.inherit = False
    spPr = shape._element.spPr
    for eff in spPr.findall(qn("a:effectLst")):
        spPr.remove(eff)
    spPr.append(parse_xml('<a:effectLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>'))
    spStyle = shape._element.find(qn("p:style"))
    if spStyle is not None:
        effRef = spStyle.find(qn("a:effectRef"))
        if effRef is not None:
            effRef.set("idx", "0")

    if fill is None:
        shape.fill.background()
    else:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill

    if line_color is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = line_color
        shape.line.width = Pt(line_pt)
    return shape


def add_textbox(
    slide,
    x: float,
    y: float,
    w: float,
    h: float,
    paragraphs: Sequence[Tuple[str, float, bool, RGBColor, PP_ALIGN]],
    margin_lr: float = 0.04,
    margin_tb: float = 0.02,
    valign: MSO_ANCHOR = MSO_ANCHOR.TOP,
    space_after_pt: float = 3.0,
):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = valign
    tf.margin_left = Inches(margin_lr)
    tf.margin_right = Inches(margin_lr)
    tf.margin_top = Inches(margin_tb)
    tf.margin_bottom = Inches(margin_tb)

    for idx, (text, size_pt, bold, color, align) in enumerate(paragraphs):
        p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(space_after_pt if idx < len(paragraphs) - 1 else 0)
        run = p.add_run()
        run.text = text
        style_run(run, size_pt, bold, color)
    return tb


def add_rich_runs_textbox(
    slide,
    x: float,
    y: float,
    w: float,
    h: float,
    lines: Sequence[Sequence[Tuple[str, float, bool, RGBColor]]],
    margin_lr: float = 0.06,
    margin_tb: float = 0.04,
    valign: MSO_ANCHOR = MSO_ANCHOR.TOP,
    space_after_pt: float = 4.0,
):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = valign
    tf.margin_left = Inches(margin_lr)
    tf.margin_right = Inches(margin_lr)
    tf.margin_top = Inches(margin_tb)
    tf.margin_bottom = Inches(margin_tb)

    for idx, runs in enumerate(lines):
        p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
        p.space_after = Pt(space_after_pt if idx < len(lines) - 1 else 0)
        for text, size_pt, bold, color in runs:
            run = p.add_run()
            run.text = text
            style_run(run, size_pt, bold, color)
    return tb


def add_card_with_bar(
    slide,
    x: float,
    y: float,
    w: float,
    h: float,
    fill: RGBColor = SURFACE_SUB,
    border_color: RGBColor = BORDER_GRAY,
    accent_color: Optional[RGBColor] = INK,
    accent_side: str = "left",
    accent_thick: float = 0.055,
):
    add_rect(slide, x, y, w, h, fill=fill, line_color=border_color, line_pt=0.75)
    if accent_color is not None:
        if accent_side == "left":
            add_rect(slide, x, y, accent_thick, h, fill=accent_color, line_color=None)
        elif accent_side == "top":
            add_rect(slide, x, y, w, accent_thick, fill=accent_color, line_color=None)


def add_kpi_card(
    slide,
    x: float,
    y: float,
    w: float,
    h: float,
    big_num: str,
    label: str,
    sub_note: str,
    accent: RGBColor = NAVY,
    fill: RGBColor = SURFACE_SUB,
) -> None:
    add_card_with_bar(slide, x, y, w, h, fill=fill, border_color=BORDER_GRAY, accent_color=accent, accent_side="top", accent_thick=0.055)
    add_textbox(
        slide,
        x + 0.14,
        y + 0.10,
        w - 0.28,
        h - 0.16,
        [
            (big_num, 22.0, True, accent, PP_ALIGN.LEFT),
            (label, 10.0, True, INK, PP_ALIGN.LEFT),
            (sub_note, 8.5, False, MUTED, PP_ALIGN.LEFT),
        ],
        margin_lr=0.0,
        margin_tb=0.0,
        space_after_pt=2.0,
    )


def add_section_label(slide, x: float, y: float, w: float, text: str, bg: RGBColor = INK) -> None:
    add_rect(slide, x, y, w, 0.29, fill=bg, line_color=None)
    add_textbox(
        slide,
        x + 0.09,
        y,
        w - 0.18,
        0.29,
        [(text, 10.0, True, WHITE, PP_ALIGN.LEFT)],
        margin_lr=0.02,
        margin_tb=0.0,
        valign=MSO_ANCHOR.MIDDLE,
    )


def add_picture_fit(slide, img_path: Path, x: float, y: float, max_w: float, max_h: float) -> None:
    with Image.open(img_path) as img:
        px_w, px_h = img.size
    ratio = px_w / px_h
    box_ratio = max_w / max_h
    if ratio >= box_ratio:
        draw_w = max_w
        draw_h = max_w / ratio
    else:
        draw_h = max_h
        draw_w = max_h * ratio
    draw_x = x + (max_w - draw_w) / 2.0
    draw_y = y + (max_h - draw_h) / 2.0
    slide.shapes.add_picture(
        str(img_path), Inches(draw_x), Inches(draw_y), width=Inches(draw_w), height=Inches(draw_h)
    )


def add_monochrome_table(
    slide,
    x: float,
    y: float,
    w: float,
    h: float,
    col_widths: Sequence[float],
    headers: Optional[Sequence[str]],
    rows: Sequence[Sequence[Tuple[str, bool, RGBColor, PP_ALIGN]]],
    font_pt: float = 9.5,
    header_fill: RGBColor = HEADER_BG,
    row_fills: Optional[Sequence[RGBColor]] = None,
    highlight_rows: Optional[Sequence[int]] = None,
    highlight_fill: RGBColor = NAVY_TINT,
    border_hex: str = "D1D5DB",
    pad_lr: float = 0.07,
    pad_tb: float = 0.04,
):
    n_rows = len(rows) + (1 if headers else 0)
    n_cols = len(col_widths)
    tbl_shape = slide.shapes.add_table(n_rows, n_cols, Inches(x), Inches(y), Inches(w), Inches(h))
    tbl = tbl_shape.table
    tbl.first_row = False
    tbl.horz_banding = False

    tblPr = tbl._tbl.tblPr
    for child in list(tblPr):
        if child.tag.endswith("tableStyleId"):
            tblPr.remove(child)

    for c_idx, cw in enumerate(col_widths):
        tbl.columns[c_idx].width = Inches(cw)

    def write_cell_lines(cell, text_val: str, bold_val: bool, color_val: RGBColor, align_val: PP_ALIGN) -> None:
        tf = cell.text_frame
        tf.word_wrap = True
        lines = text_val.split("\n")
        for line_idx, line_str in enumerate(lines):
            p = tf.paragraphs[0] if line_idx == 0 else tf.add_paragraph()
            p.alignment = align_val
            p.space_after = Pt(1.8 if line_idx < len(lines) - 1 else 0)
            run = p.add_run()
            run.text = line_str
            style_run(run, font_pt, bold_val, color_val)

    start_r = 0
    if headers:
        for c_idx, h_text in enumerate(headers):
            cell = tbl.cell(0, c_idx)
            cell.fill.solid()
            cell.fill.fore_color.rgb = header_fill
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            cell.margin_left = Inches(pad_lr)
            cell.margin_right = Inches(pad_lr)
            cell.margin_top = Inches(pad_tb)
            cell.margin_bottom = Inches(pad_tb)
            set_cell_border(cell, border_hex=border_hex, width_pt=0.75)
            write_cell_lines(cell, h_text, True, INK, PP_ALIGN.CENTER)
        start_r = 1

    hl_set = set(highlight_rows or [])
    for r_offset, row_data in enumerate(rows):
        r_idx = start_r + r_offset
        if r_offset in hl_set:
            bg = highlight_fill
        elif row_fills and r_offset < len(row_fills):
            bg = row_fills[r_offset]
        else:
            bg = WHITE if r_offset % 2 == 0 else SURFACE_SUB

        for c_idx, (text, bold, color, align) in enumerate(row_data):
            cell = tbl.cell(r_idx, c_idx)
            cell.fill.solid()
            cell.fill.fore_color.rgb = bg
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            cell.margin_left = Inches(pad_lr)
            cell.margin_right = Inches(pad_lr)
            cell.margin_top = Inches(pad_tb)
            cell.margin_bottom = Inches(pad_tb)
            set_cell_border(cell, border_hex=border_hex, width_pt=0.75)
            write_cell_lines(cell, text, bold, color, align)
    return tbl


def set_speaker_notes(slide, notes_text: str) -> None:
    notes_slide = slide.notes_slide
    notes_slide.notes_text_frame.text = notes_text.strip()


def add_slide_chrome(
    slide,
    slide_no: int,
    kicker: str,
    title: str,
    subtitle: str,
) -> None:
    bg = slide.background
    bg.fill.solid()
    bg.fill.fore_color.rgb = WHITE

    add_rect(slide, 0.0, 0.0, 13.333, 0.08, fill=INK, line_color=None)

    add_textbox(
        slide,
        0.55,
        0.19,
        12.23,
        0.24,
        [(f"SLIDE {slide_no:02d}  |  {kicker}", 9.5, True, MUTED, PP_ALIGN.LEFT)],
        margin_lr=0.0,
        margin_tb=0.0,
    )
    add_textbox(
        slide,
        0.55,
        0.43,
        12.23,
        0.40,
        [(title, 19.5, True, INK, PP_ALIGN.LEFT)],
        margin_lr=0.0,
        margin_tb=0.0,
    )
    add_textbox(
        slide,
        0.55,
        0.85,
        12.23,
        0.28,
        [(subtitle, 11.0, True, NAVY, PP_ALIGN.LEFT)],
        margin_lr=0.0,
        margin_tb=0.0,
    )
    add_rect(slide, 0.55, 1.19, 12.23, 0.018, fill=BORDER_GRAY, line_color=None)

    add_rect(slide, 0.55, 7.04, 12.23, 0.012, fill=BORDER_GRAY, line_color=None)
    add_textbox(
        slide,
        0.55,
        7.08,
        8.20,
        0.26,
        [(f"{TEAM_LABEL}  ·  2026 DSC 공유대학 AI 실전 프로젝트 챌린지 과제 4", 8.5, False, SUBTLE, PP_ALIGN.LEFT)],
        margin_lr=0.0,
        margin_tb=0.0,
    )
    add_textbox(
        slide,
        8.80,
        7.08,
        3.98,
        0.26,
        [(f"woody-korean.github.io/dsc-hwp-ai-pipeline   |   {slide_no} / {TOTAL_SLIDES}", 8.5, True, SUBTLE, PP_ALIGN.RIGHT)],
        margin_lr=0.0,
        margin_tb=0.0,
    )


def build_slide_1(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    bg = slide.background
    bg.fill.solid()
    bg.fill.fore_color.rgb = WHITE
    add_rect(slide, 0.0, 0.0, 13.333, 0.10, fill=INK, line_color=None)

    add_rect(slide, 0.55, 0.50, 8.45, 0.36, fill=SURFACE_SUB, line_color=BORDER_GRAY, line_pt=0.75)
    add_textbox(
        slide,
        0.67,
        0.50,
        8.20,
        0.36,
        [("2026 DSC 공유대학(대전형) AI 실전 프로젝트 챌린지  |  과제 4 : 중소기업 반복 행정업무 개선", 10.5, True, NAVY, PP_ALIGN.LEFT)],
        margin_lr=0.0,
        margin_tb=0.0,
        valign=MSO_ANCHOR.MIDDLE,
    )

    add_textbox(
        slide,
        0.55,
        1.04,
        8.45,
        1.42,
        [
            ("국방·공공 HWP/HWPX 파싱 × AI 기반", 25.5, True, INK, PP_ALIGN.LEFT),
            ("대전 B2B 중소기업 4종 행정서식 자동화", 25.5, True, INK, PP_ALIGN.LEFT),
        ],
        margin_lr=0.0,
        margin_tb=0.0,
        space_after_pt=6.0,
    )
    add_textbox(
        slide,
        0.55,
        2.44,
        8.45,
        0.64,
        [
            (
                "(주)대덕정밀기계 시나리오로 실증한 단일 원천(Single Source of Truth) 파이프라인 및 정보유출 0% 폐쇄망 보안 설계",
                12.5,
                True,
                NAVY,
                PP_ALIGN.LEFT,
            )
        ],
        margin_lr=0.0,
        margin_tb=0.0,
    )
    add_rect(slide, 0.55, 3.16, 8.45, 0.025, fill=INK, line_color=None)

    add_monochrome_table(
        slide,
        0.55,
        3.38,
        8.45,
        3.28,
        col_widths=[1.85, 6.60],
        headers=None,
        rows=[
            [
                ("타깃 기업", True, INK, PP_ALIGN.LEFT),
                ("대전 대덕산단·대전산단·대덕특구 배후 B2B 정밀제조·방산·연구기자재 납품 중소기업 (5~30인 규모)", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("해결하는\n현장 병목", True, INK, PP_ALIGN.LEFT),
                ("비정형 공고(.hwp/.hwpx) 1건마다 견적서 → 발주·작업지시서 → 납품검수조서 → 지출결의서를 4번 수기 재입력", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("구현 결과물", True, INK, PP_ALIGN.LEFT),
                ("무라이선스 HWP/HWPX 파서 + 임의 기관양식(기계연 확인서 등) 자동 기입 + 선별 개정 · 최종 점검 콘솔", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("발표 팀 / 구성", True, INK, PP_ALIGN.LEFT),
                (f"{TEAM_LABEL}  |  2026년 11월 27일 (발표 7분 + 질의응답 3분 · 총 {TOTAL_SLIDES}슬라이드)", True, NAVY, PP_ALIGN.LEFT),
            ],
        ],
        font_pt=10.2,
        row_fills=[SURFACE_SUB, WHITE, SURFACE_SUB, WHITE],
        pad_lr=0.10,
        pad_tb=0.08,
    )

    # Right QR Card
    add_card_with_bar(slide, 9.25, 0.50, 3.53, 6.16, fill=SURFACE_SUB, border_color=INK, accent_color=INK, accent_side="top", accent_thick=0.06)
    add_textbox(
        slide,
        9.40,
        0.72,
        3.23,
        0.48,
        [
            ("LIVE DEMO · 현장 QR 체험", 12.0, True, INK, PP_ALIGN.CENTER),
            ("발표 중 스마트폰으로 즉시 테스트 가능", 9.5, False, MUTED, PP_ALIGN.CENTER),
        ],
        margin_lr=0.0,
        margin_tb=0.0,
        space_after_pt=2.0,
    )
    add_rect(slide, 9.95, 1.34, 2.13, 2.13, fill=WHITE, line_color=BORDER_GRAY, line_pt=0.75)
    add_picture_fit(slide, QR_IMAGE_PATH, 10.03, 1.42, 1.97, 1.97)
    add_rect(slide, 9.45, 3.62, 3.13, 0.42, fill=WHITE, line_color=BORDER_GRAY, line_pt=0.75)
    add_textbox(
        slide,
        9.50,
        3.62,
        3.03,
        0.42,
        [("https://woody-korean.github.io/dsc-hwp-ai-pipeline/", 8.5, True, NAVY, PP_ALIGN.CENTER)],
        margin_lr=0.0,
        margin_tb=0.0,
        valign=MSO_ANCHOR.MIDDLE,
    )
    add_rich_runs_textbox(
        slide,
        9.42,
        4.20,
        3.19,
        2.25,
        [
            [("실시간 시연 탑재 기능", 10.0, True, INK)],
            [("1. ", 9.2, True, NAVY), ("방위사업청·KRISS 실물 .hwp/.hwpx 5종 즉시 파싱", 9.2, False, BODY)],
            [("2. ", 9.2, True, NAVY), ("기계연(KIMM) 수의계약 확인서 등 임의 .hwpx 9/9 자동 기입", 9.2, False, BODY)],
            [("3. ", 9.2, True, NAVY), ("사후 변경요청 6종 영향 판별(Rev.2 선별 개정) · 회신 생성", 9.2, False, BODY)],
            [("4. ", 9.2, True, NAVY), ("실무자용 간편 콘솔(/easy.html) · 최종 점검표 · 표준 프롬프트", 9.2, False, BODY)],
        ],
        space_after_pt=5.0,
    )

    add_rect(slide, 0.55, 7.04, 12.23, 0.012, fill=BORDER_GRAY, line_color=None)
    add_textbox(
        slide,
        0.55,
        7.08,
        12.23,
        0.26,
        [(f"{TEAM_LABEL}  |  GitHub: woody-korean/dsc-hwp-ai-pipeline   |   1 / {TOTAL_SLIDES}", 8.5, False, SUBTLE, PP_ALIGN.RIGHT)],
        margin_lr=0.0,
        margin_tb=0.0,
    )

    set_speaker_notes(
        slide,
        "[0:00 - 0:30] 표지\n"
        "안녕하십니까, 과제 4 '중소기업 반복 행정업무 개선'을 발표할 충남대학교 B팀입니다.\n"
        "저희는 대전 대덕특구와 산업단지 주변의 정밀제조·방산·연구기자재 납품 중소기업이 매 입찰과 납품마다 겪는 "
        "'한글(.hwp/.hwpx) 문서 4중 수기 재입력' 문제를 해결하고, 정보유출 걱정 없이 사내 PC에서도 구동 가능한 "
        "실전 웹·파이프라인을 직접 구현했습니다. 우측 QR을 찍으시면 심사 중에도 휴대폰으로 바로 써보실 수 있습니다.",
    )


def build_slide_2(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_slide_chrome(
        slide,
        2,
        "문제 정의  |  배점: 문제 이해도 20점",
        "왜 대전의 'B2B 정밀제조 · 방산 · 연구기자재 중소기업'인가?",
        "과제 1~3(소상공인·B2C)과 차별화된 대전 특화 기술 공급망의 '94.7% AI 공백'과 문서 4중 입력 병목 해결",
    )

    # Top 3 Hero KPI Stat Cards (2-second visual scan)
    add_kpi_card(
        slide,
        0.55,
        1.32,
        3.92,
        1.12,
        "94.7%",
        "국내 중소기업 AI 미적용 비율",
        "중기중앙회(2024.11, n=300) · 맞춤형 서비스 부족 64.0%",
        accent=CRIMSON,
        fill=CRIMSON_TINT,
    )
    add_kpi_card(
        slide,
        4.70,
        1.32,
        3.92,
        1.12,
        "5.7%",
        "사내 맞춤형 AI 도구 보유 중소기업",
        "대한상의(2026.06) · 대기업(11.4%) 대비 절반 수준",
        accent=NAVY,
        fill=NAVY_TINT,
    )
    add_kpi_card(
        slide,
        8.86,
        1.32,
        3.92,
        1.12,
        "90~120분",
        "공고 1건당 4종 서식 수기 재입력 소요",
        "5~30인 기술기업 엔지니어가 행정 전담 없이 직접 처리",
        accent=INK,
        fill=SURFACE_SUB,
    )

    # Left: Condensed 4-row Verified Regional Stats Table
    add_section_label(slide, 0.55, 2.58, 6.18, "1. 대전 지역 산업 구조 및 현장 행정 병목 (검증 통계)")
    add_monochrome_table(
        slide,
        0.55,
        2.93,
        6.18,
        3.92,
        col_widths=[1.48, 3.15, 1.55],
        headers=["구분", "확인된 핵심 수치", "출처 및 기준"],
        rows=[
            [
                ("대전 중소기업\n거시 규모", True, INK, PP_ALIGN.LEFT),
                ("211,134개사 (종사자 48.1만 명 · 매출 70.1조 원; 소상공인 약 95%)", False, BODY, PP_ALIGN.LEFT),
                ("중기부 기본통계\n(2023)", False, MUTED, PP_ALIGN.LEFT),
            ],
            [
                ("대전 2대 산단 &\n대덕특구 집적", True, INK, PP_ALIGN.LEFT),
                ("대전산단 1,083개사 · 대덕산단 365개사\n전문·과학·기술업 3,452개사 · 코스닥 64개사", False, BODY, PP_ALIGN.LEFT),
                ("대덕구청 (2025)\nDISTEP · 전자신문", False, MUTED, PP_ALIGN.LEFT),
            ],
            [
                ("중소 제조업\nAI 활용 격차", True, CRIMSON, PP_ALIGN.LEFT),
                ("100인 미만 AI 활용 6.2% · 제조업 5.7% · 대전 9.0%\n(300인 이상 기업 18.0% 대비 현저한 격차)", True, BODY, PP_ALIGN.LEFT),
                ("직능연 (2026.05)\n대한상의 (2026.06)", False, MUTED, PP_ALIGN.LEFT),
            ],
            [
                ("반복 행정\n시간 소모", True, INK, PP_ALIGN.LEFT),
                ("한국 직장인 반복·행정 연 251억 시간('거의 절반')\n68% 주 최대 10h 소모 · 55% 주 4h 절감 시 도입", False, BODY, PP_ALIGN.LEFT),
                ("Dropbox×YouGov\n(2025.07, n≈600)", False, MUTED, PP_ALIGN.LEFT),
            ],
        ],
        font_pt=9.0,
        highlight_rows=[2],
        highlight_fill=CRIMSON_TINT,
        pad_lr=0.07,
        pad_tb=0.05,
    )

    # Right: 4-Stage As-Is Re-entry Bottleneck + Clean Insight Box
    add_section_label(slide, 6.95, 2.58, 5.83, "2. 현장 페인포인트(As-Is): 동일 데이터를 4번 수기 재입력")
    steps = [
        ("① 견적서 (Quotation)", "출연연·방산청 .hwp/.hwpx 공고·품목표를 열어 수량·규격·단가를 엑셀에 수기 계산"),
        ("② 발주서 · 작업지시서 (PO / Work Order)", "수주 확정 시 견적 내역을 작업지시서·외주 발주서에 재입력 (사양 변경 누락 빈발)"),
        ("③ 거래명세서 · 납품검수조서 (Delivery)", "납품 시 명세서·검수조서를 출력해 발주·합격 수량과 납기 조건을 육안으로 대조"),
        ("④ 지출결의서 · 내부 품의서 (Approval)", "공급가액·부가세(10%)·필수 첨부서류를 품의서에 다시 기입해 대표이사 결재 요청"),
    ]
    curr_y = 2.94
    for title_txt, desc_txt in steps:
        add_card_with_bar(slide, 6.95, curr_y, 5.83, 0.72, fill=SURFACE_SUB, border_color=BORDER_GRAY, accent_color=NAVY, accent_side="left", accent_thick=0.055)
        add_rich_runs_textbox(
            slide,
            7.09,
            curr_y + 0.04,
            5.62,
            0.64,
            [
                [(title_txt, 10.0, True, INK)],
                [(desc_txt, 9.0, False, BODY)],
            ],
            margin_lr=0.02,
            margin_tb=0.01,
            space_after_pt=2.0,
        )
        curr_y += 0.78

    add_card_with_bar(slide, 6.95, 6.08, 5.83, 0.77, fill=NAVY_TINT, border_color=NAVY, accent_color=NAVY, accent_side="left", accent_thick=0.06)
    add_rich_runs_textbox(
        slide,
        7.10,
        6.12,
        5.58,
        0.69,
        [
            [("왜 '대전 B2B 기술·제조 중소기업'이 과제 4에서 가장 높은 변별력을 갖는가?", 9.8, True, NAVY)],
            [("과제 1~3(소상공인 접점)과 달리, 5~30인 정밀제조·납품 기업은 ", 9.0, False, BODY), ("오류 1건이 납품 보류·대금 지연으로 직결", 9.0, True, INK), ("되어 AI 자동화 체감 효과가 가장 큽니다.", 9.0, False, BODY)],
        ],
        margin_lr=0.02,
        margin_tb=0.01,
        space_after_pt=2.5,
    )

    set_speaker_notes(
        slide,
        "[0:30 - 1:15] 문제 정의\n"
        "대전 전체 중소기업 중 숫자상 소상공인이 많지만 과제 1~3이 이미 소상공인 접점을 다룹니다. 반면 대전을 대표하는 핵심 산업은 "
        "대전·대덕산단과 대덕특구에 밀집한 3,452개 전문·과학·기술 기업입니다.\n"
        "국내 중소기업의 94.7%가 AI를 도입하지 못했고 사내 맞춤형 도구는 5.7%에 불과합니다. 전담 행정직이 없는 5~30인 기술 기업에서는 "
        "엔지니어가 공고 1건마다 견적·발주·검수·품의 4종 문서를 90~120분씩 수기 재입력하고 있으며, 오류 1건이 납품 보류로 직결됩니다.",
    )


def build_slide_3(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_slide_chrome(
        slide,
        3,
        "해외 레퍼런스 및 한국 고유의 공백  |  배점: 문제 이해도 20점 · 창의성 20점",
        "미국 · 일본 B2B 선진 사례는 증명되었으나, 한국에는 'HWP · 보안' 장벽 존재",
        "해외 성공 방정식('기존 ERP 교체 없이 비정형 문서 추출·대조만 AI화')을 한국 조달·출연연 환경에 맞게 재설계",
    )

    add_section_label(slide, 0.55, 1.36, 12.23, "1. 미국 · 일본 중소 제조 · B2B 납품기업 행정 자동화 핵심 레퍼런스 (Vendor-Reported 기준)")
    add_monochrome_table(
        slide,
        0.55,
        1.72,
        12.23,
        2.58,
        col_widths=[1.95, 2.35, 2.75, 5.18],
        headers=["국가 · 솔루션", "적용 기업", "AI 자동화 적용 범위", "확인된 정량 개선 효과 (출처 명시)"],
        rows=[
            [
                ("미국\nPaperless Parts", True, NAVY, PP_ALIGN.LEFT),
                ("Focused on Machining\n(미국 9인 CNC 가공업체)", False, BODY, PP_ALIGN.LEFT),
                ("2D PDF 도면·RFQ 자동 추출 →\n견적 세팅 AI 보조", False, BODY, PP_ALIGN.LEFT),
                ("견적 리드타임 5~10영업일 → 1~3영업일 단축\n매출·처리량 15~20% 성장 / 30~40건 세팅 수시간 → 30분", True, INK, PP_ALIGN.LEFT),
            ],
            [
                ("일본\nLayerX (バクラク)", True, NAVY, PP_ALIGN.LEFT),
                ("CADDi (제조 조달) ·\n산쿄폴리에틸렌", False, BODY, PP_ALIGN.LEFT),
                ("월 수백 매 종이·PDF 협력사\n청구서 AI 판독·대조·발송", False, BODY, PP_ALIGN.LEFT),
                ("CADDi: 월 400매 청구서 30~40시간 → 3~4시간 (1/10 단축)\n산쿄: 4~5명 반나절 → 1명 1~2시간, 우편비 월 9만→2만 엔", True, INK, PP_ALIGN.LEFT),
            ],
            [
                ("일본\nCybozu (kintone) ·\nAI inside", True, NAVY, PP_ALIGN.LEFT),
                ("미타리카공업 (~30인) ·\nKTK (제조 납품)", False, BODY, PP_ALIGN.LEFT),
                ("견적·발주·점검 단일 DB +\n발주·납품서 AI-OCR 자동화", False, BODY, PP_ALIGN.LEFT),
                ("미타리카: 상담준비 1.5시간 → 5분, 예방점검 28%→50%+\nKTK: 거래처 납품서 입력 월 90시간 절감 (일본 수주 88.1% 자동화 희망)", False, BODY, PP_ALIGN.LEFT),
            ],
        ],
        font_pt=9.4,
        highlight_rows=[0, 1],
        highlight_fill=SURFACE_SUB,
        pad_lr=0.08,
        pad_tb=0.06,
    )

    add_section_label(slide, 0.55, 4.48, 12.23, "2. 외산 SaaS를 그대로 쓸 수 없는 대한민국 대전 현장의 2가지 결정적 공백 (Gap)", bg=CRIMSON)

    add_card_with_bar(slide, 0.55, 4.84, 6.00, 1.98, fill=CRIMSON_TINT, border_color=CRIMSON_BORDER, accent_color=CRIMSON, accent_side="left", accent_thick=0.065)
    add_rich_runs_textbox(
        slide,
        0.74,
        4.94,
        5.68,
        1.80,
        [
            [("한계 1  |  한국 고유 공공·국방 문서 포맷 (.hwp / .hwpx) 미지원", 11.2, True, CRIMSON)],
            [("• 외산 SaaS(Paperless Parts 등)는 영문 PDF·FAX 전표에 최적화되어 있어, 대한민국 방위사업청·조달청·출연연 표준인 ", 9.8, False, BODY), (".hwp(OLE2 바이너리)", 9.8, True, INK), (" 및 ", 9.8, False, BODY), (".hwpx(KS X 6101 XML)", 9.8, True, INK), (" 파싱이 아예 불가능합니다.", 9.8, False, BODY)],
            [("• 기존 한컴 SDK는 유료 라이선스 및 Windows 서버 종속으로 5~30인 중소기업 도입에 큰 장벽이 됩니다.", 9.5, False, MUTED)],
        ],
        space_after_pt=6.0,
    )

    add_card_with_bar(slide, 6.78, 4.84, 6.00, 1.98, fill=CRIMSON_TINT, border_color=CRIMSON_BORDER, accent_color=CRIMSON, accent_side="left", accent_thick=0.065)
    add_rich_runs_textbox(
        slide,
        6.97,
        4.94,
        5.68,
        1.80,
        [
            [("한계 2  |  방산·출연연 보안서약 문건의 외부 클라우드 유출 금지", 11.2, True, CRIMSON)],
            [("• 대덕특구 연구소기업과 방산 협력사는 국방규격서·보안서약 RFP·사내 원가표를 다루므로 ", 9.8, False, BODY), ("외부 퍼블릭 SaaS 서버로 원문을 전송하는 방식 자체가 도입 불가", 9.8, True, INK), ("합니다.", 9.8, False, BODY)],
            [("• 따라서 ", 9.8, False, BODY), ("로컬 무라이선스 HWP 파서 + 사내 Local sLLM 전환 구조", 9.8, True, NAVY), ("가 한국 현장의 필수 요건입니다.", 9.8, False, BODY)],
        ],
        space_after_pt=6.0,
    )

    set_speaker_notes(
        slide,
        "[1:15 - 1:55] 미국·일본 레퍼런스 & 한국의 빈틈\n"
        "미국과 일본은 이미 제조·연구장비 중소기업에서 해법을 증명했습니다. 미국 9인 CNC 기업 Focused on Machining은 견적 리드타임을 "
        "최대 10일에서 1~3일로 줄여 매출이 15~20% 성장했고, 일본 CADDi는 월 400매 청구서 처리를 40시간에서 4시간으로 1/10로 줄였습니다.\n"
        "하지만 외산 SaaS는 한국에서 두 가지 벽에 막힙니다. 첫째, 방위사업청·조달청·출연연 표준인 .hwp/.hwpx를 파싱하지 못합니다. "
        "둘째, 방산·연구소 기밀 원가 문서를 외부 퍼블릭 클라우드에 올릴 수 없습니다. 그래서 저희가 직접 한국형 파이프라인을 설계했습니다.",
    )


def build_slide_4(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_slide_chrome(
        slide,
        4,
        "핵심 솔루션 아키텍처  |  배점: AI 활용도 30점",
        "결정론적 코드와 LLM의 엄격한 4단계 역할 분리 (Decoupled Hybrid Pipeline)",
        "소형 AI에게 바이너리 해독과 부가세 곱셈을 시키지 않고, 파싱·산술·3-Way 대조는 코드가 전담해 환각을 구조적으로 봉쇄",
    )

    add_card_with_bar(slide, 0.55, 1.34, 12.23, 0.52, fill=NAVY_TINT, border_color=NAVY, accent_color=NAVY, accent_side="left", accent_thick=0.06)
    add_textbox(
        slide,
        0.72,
        1.35,
        11.95,
        0.50,
        [
            (
                "핵심 원칙:  ① HWP/HWPX 파싱(코드 · 0토큰)  →  ② 의미·리스크 JSON 추출(BAZE ↔ Local sLLM)  →  ③ 단가·VAT·3-Way 검증(코드 · 산술오류 0%)  →  ④ 단일 원천 4종 서식",
                10.3,
                True,
                INK,
                PP_ALIGN.LEFT,
            )
        ],
        margin_lr=0.0,
        margin_tb=0.0,
        valign=MSO_ANCHOR.MIDDLE,
    )

    cols = [
        (
            "STEP 01",
            "HWP/HWPX 네이티브 파서",
            "코드 · LLM 0 토큰",
            [
                (".hwp 5.0: ", "OLE2 FAT/MiniFAT + zlib 복호화 + HWPTAG 67 직접 해독"),
                (".hwpx: ", "KS X 6101 OWPML ZIP/XML 파싱 및 병합 표 Markdown 복원"),
                ("핵심 이점: ", "유료 한컴 SDK·Windows 없이 서버·브라우저 100% 무손실 추출"),
            ],
            INK,
        ),
        (
            "STEP 02",
            "LLM 의미 추출 · 리스크 진단",
            "BAZE ↔ Local sLLM",
            [
                ("유연한 엔진: ", "BAZE gpt-6.1-terra (폐쇄망 시 --base-url로 Ollama/vLLM 즉시 전환)"),
                ("구조화 안정성: ", "정제 원문 ~3,000토큰 → 고정 JSON ~800토큰 (실패 시 최대 3회 재시도)"),
                ("리스크 진단: ", "입찰자격·납기·보안서약·필수첨부 누락 경고(HITL) 자동 추출"),
            ],
            NAVY,
        ),
        (
            "STEP 03",
            "결정론적 산술 · 3-Way 검증",
            "코드 · 산술오류 0%",
            [
                ("강제 산식: ", "공급가액 = 수량 × 단가, VAT 10%, 총액을 코드로 재계산 덮어쓰기"),
                ("3-Way 대조: ", "① 품목 수량(견적↔발주↔검수) ② 총액 일치 ③ 납기일 ④ 필수첨부"),
                ("환각 봉쇄: ", "소형 sLLM의 20~30% 산술 환각 위험을 원천 0%로 제거"),
            ],
            INK,
        ),
        (
            "STEP 04",
            "범용 양식 · 선별 변경관리",
            "Universal + Impact",
            [
                ("임의 .hwpx 분석: ", "일반현황·인력표·계획서 등 빈칸 양식 구조 스캔·자동 작성"),
                ("영향 판별(Diff): ", "6종 중 변경 영향 서류만 자동 체크해 Rev.2 선별 개정"),
                ("ERP · 회신 초안: ", "ERP CSV 내보내기 + 개정·유지 서류 구분 회신 메일 생성"),
            ],
            NAVY,
        ),
    ]

    w_col = 2.86
    gap = 0.263
    for idx, (step_no, step_title, tag_txt, bullets, bar_col) in enumerate(cols):
        cx = 0.55 + idx * (w_col + gap)
        add_card_with_bar(slide, cx, 2.02, w_col, 3.62, fill=SURFACE_SUB, border_color=BORDER_GRAY, accent_color=bar_col, accent_side="top", accent_thick=0.055)
        add_rect(slide, cx + 0.12, 2.16, 0.84, 0.25, fill=bar_col, line_color=None)
        add_textbox(
            slide,
            cx + 0.12,
            2.16,
            0.84,
            0.25,
            [(step_no, 9.0, True, WHITE, PP_ALIGN.CENTER)],
            margin_lr=0.0,
            margin_tb=0.0,
            valign=MSO_ANCHOR.MIDDLE,
        )
        add_textbox(
            slide,
            cx + 1.00,
            2.16,
            w_col - 1.12,
            0.25,
            [(tag_txt, 8.5, True, bar_col, PP_ALIGN.RIGHT)],
            margin_lr=0.0,
            margin_tb=0.0,
            valign=MSO_ANCHOR.MIDDLE,
        )
        add_textbox(
            slide,
            cx + 0.12,
            2.48,
            w_col - 0.24,
            0.40,
            [(step_title, 11.2, True, INK, PP_ALIGN.LEFT)],
            margin_lr=0.0,
            margin_tb=0.0,
        )
        add_rect(slide, cx + 0.12, 2.90, w_col - 0.24, 0.012, fill=BORDER_GRAY, line_color=None)

        rich_lines = [[(f"• {k}", 9.4, True, INK), (v, 9.4, False, BODY)] for k, v in bullets]
        add_rich_runs_textbox(
            slide,
            cx + 0.10,
            2.98,
            w_col - 0.20,
            2.58,
            rich_lines,
            margin_lr=0.02,
            margin_tb=0.02,
            space_after_pt=8.0,
        )
        # Visual flow arrow between step cards
        if idx < 3:
            add_textbox(
                slide,
                cx + w_col + 0.01,
                3.55,
                gap - 0.02,
                0.42,
                [("→", 17.0, True, NAVY, PP_ALIGN.CENTER)],
                margin_lr=0.0,
                margin_tb=0.0,
                valign=MSO_ANCHOR.MIDDLE,
            )

    add_monochrome_table(
        slide,
        0.55,
        5.78,
        12.23,
        1.08,
        col_widths=[1.45, 3.10, 3.58, 4.10],
        headers=["비교 기준", "기존 사내 DB · ERP (저장)", "일반 사내 RAG LLM (검색 챗봇)", "본 하이브리드 파이프라인 (실행 엔진)"],
        rows=[
            [
                ("역할 및\n핵심 차이", True, INK, PP_ALIGN.LEFT),
                ("정형 데이터 저장소(System of Record)\n외부 .hwp 해독 불가 → 사람이 4번 수기 입력", False, MUTED, PP_ALIGN.LEFT),
                ("과거 문서 Top-K Q&A(System of Knowledge)\n.hwp 표 붕괴 · 산술 환각 · 4종 서식 생성 불가", False, CRIMSON, PP_ALIGN.LEFT),
                ("외부 .hwp 무손실 파싱 + 사내 DB·RAG 단가 연동\n3-Way 산술검증(오류 0%) + 4종 서식·DB 적재", True, NAVY, PP_ALIGN.LEFT),
            ]
        ],
        font_pt=8.8,
        pad_lr=0.07,
        pad_tb=0.04,
    )

    set_speaker_notes(
        slide,
        "[1:55 - 2:50] 해결 아키텍처\n"
        "저희 아키텍처의 핵심은 결정론적 코드와 생성형 AI의 엄격한 역할 분리입니다.\n"
        "사내 DB는 입력 후 저장만 하고, 일반 RAG 챗봇은 과거 문서를 검색해 답할 뿐 방금 받은 .hwp 표를 무손실로 읽고 부가세 10%와 지정 양식을 맞춰주지 못합니다.\n"
        "저희는 1단계 순수 코드 파서가 .hwp/.hwpx 표를 토큰 0으로 해독하고, 2단계 LLM이 JSON과 리스크 경고를 추출하며, "
        "3단계 코드가 산술과 3-Way 일치를 100% 검증합니다. 4단계에서는 기본 4종 외에 업체 일반현황·인력현황표·사업수행계획서 같은 임의 .hwpx 빈칸 양식까지 구조 스캔해 자동 작성하고, 사후 변경요청 시에도 영향 서류만 판별해 선별 개정과 회신 초안까지 처리합니다.",
    )


def build_slide_5(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_slide_chrome(
        slide,
        5,
        "실물 검증 결과  |  배점: 결과물 완성도 및 활용성 30점",
        "방위사업청 · 대전 출연연(KRISS) 실물 .hwp / .hwpx 5종 교차 검증",
        "실제 국방 입찰공고(HWPX)와 방산혁신기업 · 한국표준과학연구원 구매규격서(HWP 5.0)를 BAZE 파이프라인으로 실증",
    )

    add_section_label(slide, 0.55, 1.36, 12.23, "1. 방위사업청 4종 + 대전 정부출연연구원(KRISS) 1종 파싱 규모 및 4종 서식 시나리오 결과")
    add_monochrome_table(
        slide,
        0.55,
        1.70,
        12.23,
        3.26,
        col_widths=[2.95, 2.00, 2.30, 4.98],
        headers=["수집 실물 파일명 · 공고명", "문서 포맷 엔진", "무손실 파싱 규모", "검증 목적 및 4종 서식 시나리오 결과"],
        rows=[
            [
                ("dapa_uav_bid.hwpx\n(해안정찰용무인항공기 입찰)", True, INK, PP_ALIGN.LEFT),
                ("HWPX (OWPML XML)", False, BODY, PP_ALIGN.CENTER),
                ("105,207B · 303문단·8표\n16,348자", False, BODY, PP_ALIGN.CENTER),
                ("[입찰→견적 실증] 장문 입찰공고·복합표 추출 → 3개 품목 자동 생성 · 총 36,300,000원 (PASS)", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("dapa_tactical_relay_bid.hwpx\n(전술이동중계기 입찰 재공고)", True, INK, PP_ALIGN.LEFT),
                ("HWPX (OWPML XML)", False, BODY, PP_ALIGN.CENTER),
                ("99,065B · 166문단·8표\n15,496자", False, BODY, PP_ALIGN.CENTER),
                ("[입찰→견적 실증] 재공고 일정·필수첨부·품목 추출 → 3개 품목 자동 생성 · 총 20,900,000원 (PASS)", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("dapa_sme_priority_items.hwpx\n(중소기업 우선선정 품목지정)", True, INK, PP_ALIGN.LEFT),
                ("HWPX (OWPML XML)", False, BODY, PP_ALIGN.CENTER),
                ("55,732B · 10문단·1표\n509자", False, BODY, PP_ALIGN.CENTER),
                ("[공고 해독 + 시나리오 연동] 지정 품목 추출 후 (주)대덕정밀기계 4종 매핑 · 27,500,000원 (PASS)", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("dapa_defense_innov_sme.hwp\n(제5기 방산혁신기업 선정)", True, NAVY, PP_ALIGN.LEFT),
                ("HWP 5.0 Binary (OLE2)", True, NAVY, PP_ALIGN.CENTER),
                ("70,144B · 54문단·1표\n1,155자", True, NAVY, PP_ALIGN.CENTER),
                ("[HWP 5.0 실증] OLE2 0xd0cf11e0 무라이선스 해독 + 협력 제안 시나리오 4종 · 16,500,000원 (PASS)", True, INK, PP_ALIGN.LEFT),
            ],
            [
                ("kriss_gpu_workstation_spec.hwp\n(KRISS GPU 워크스테이션 규격서)", True, EMERALD, PP_ALIGN.LEFT),
                ("HWP 5.0 Binary (OLE2)", True, EMERALD, PP_ALIGN.CENTER),
                ("63,488B · 39문단·1표\n940자", True, EMERALD, PP_ALIGN.CENTER),
                ("[대전 출연연 실증] 원문 DDR5/PC4 표기혼재 · 기한경과 AI 포착 + 4개 품목 · 40,700,000원 (PASS)", True, INK, PP_ALIGN.LEFT),
            ],
        ],
        font_pt=8.3,
        highlight_rows=[4],
        highlight_fill=EMERALD_TINT,
        pad_lr=0.07,
        pad_tb=0.03,
    )

    # Bottom 3 Verification Metric Cards
    add_kpi_card(
        slide,
        0.55,
        5.12,
        3.92,
        1.70,
        "100% 무손실",
        "최대 303문단 · 8표 복합 문서 해독",
        "Python 서버(hwp_parser.py)와 브라우저 JS 엔진 교차 검증 완료\n(*스캔 이미지 PDF/HWP는 OCR 전처리 파이프라인 연계 가능)",
        accent=NAVY,
        fill=NAVY_TINT,
    )
    add_kpi_card(
        slide,
        4.70,
        5.12,
        3.92,
        1.70,
        "KIMM 9 / 9",
        "한국기계연구원 실물 확인서 자동 기입",
        "파란 안내문구('~ 기재') 포함 9/9칸 검정 글씨 자동 기입 및\n이해충돌 [ ] 체크란 13건 · 서명란 Human-in-the-Loop 보호",
        accent=INK,
        fill=SURFACE_SUB,
    )
    add_kpi_card(
        slide,
        8.86,
        5.12,
        3.92,
        1.70,
        "5 / 5 PASS",
        "출연연 오기(DDR5≠PC4) 포착 + 3-Way",
        "BAZE gpt-6.1-terra가 KRISS 규격서 오기까지 선제 경고하고\n결정론적 코드가 부가세 10%·총액·수량 100% 검증",
        accent=EMERALD,
        fill=EMERALD_TINT,
    )

    set_speaker_notes(
        slide,
        "[2:50 - 3:25] 실물 검증 결과\n"
        "가짜 테스트 파일이 아니라 실제 방위사업청 4종과 대전 유성구 한국표준과학연구원(KRISS)의 실제 GPU 워크스테이션 구매규격서(.hwp)까지 총 5종을 수집·검증했습니다.\n"
        "특히 새로 추가한 5번 KRISS .hwp 규격서에서는 실제 공고문에 'DDR5-5600 MHz (= PC4-44800)'처럼 DDR5와 PC4가 잘못 병기된 표기 오류와 납품기한 경과 위험까지 "
        "BAZE AI가 자동으로 잡아내어 실무 경고로 띄워주며 4개 품목 4,070만 원 견적·발주·검수·품의서를 생성해 전 건 5/5 PASS를 확인했습니다.\n"
        "또한 대전 한국기계연구원(KIMM)이 실제 사용하는 '수의계약 체결 제한 여부 확인서(.hwpx)' 양식을 사전 코딩 없이 투입해 9개 기입 항목을 100% 자동 작성하고, "
        "법적 서약 체크란 13건과 서명란은 담당자가 직접 확인하도록 보호하는 Human-in-the-Loop 동작까지 교차 실증했습니다.",
    )


def build_slide_6(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_slide_chrome(
        slide,
        6,
        "현장 라이브 시연  |  배점: 결과물 완성도 및 활용성 30점",
        "GitHub Pages 실시간 시연: 기계연 실물 양식 작성 → PM 교체 선별 개정",
        "비전공 실무자용 간편 콘솔(/easy.html)과 전문가 기술·보안 검증 화면을 양방향 연동해 현장 즉시 활용",
    )

    # Left: 3-Step Live Demo Script (clean & spacious)
    add_section_label(slide, 0.55, 1.36, 4.55, "1. 현장 라이브 시연 3단계 (실무 콘솔 기준)")
    demo_steps = [
        (
            "1단계  |  KRISS 공고 확인 & KIMM 확인서 9/9 기입",
            "KRISS .hwp 요건·유의사항 확인 후 [수의계약 확인서(기계연)] 탭에서 9/9칸 자동 기입(.hwpx) + 법적 체크란 13건 보호",
            NAVY,
        ),
        (
            "2단계  |  PM 교체 6종 영향 판별 & 선별 Rev.2 개정",
            "3단계에서 [PM 이준호→박서연 교체] 분석 시 인력표·계획서 2종만 개정(핵심 4종 Rev.1 유지) + 비교표·회신 문안 생성",
            EMERALD,
        ),
        (
            "3단계  |  제출 전 5대 점검표 & 기술·보안 화면 전환",
            "4단계 최종 점검표·사내 AI용 표준 프롬프트 복사 확인 후 [기술·보안 상세 화면]에서 3-Way 불일치·ROI 시뮬레이터 확인",
            CRIMSON,
        ),
    ]
    cy = 1.74
    for dt, dd, col in demo_steps:
        add_card_with_bar(slide, 0.55, cy, 4.55, 1.28, fill=SURFACE_SUB, border_color=BORDER_GRAY, accent_color=col, accent_side="left", accent_thick=0.06)
        add_rich_runs_textbox(
            slide,
            0.72,
            cy + 0.10,
            4.28,
            1.10,
            [[(dt, 10.3, True, col)], [(dd, 9.3, False, BODY)]],
            margin_lr=0.02,
            margin_tb=0.01,
            space_after_pt=5.0,
        )
        cy += 1.40

    add_card_with_bar(slide, 0.55, 5.96, 4.55, 0.88, fill=NAVY_TINT, border_color=NAVY, accent_color=NAVY, accent_side="left", accent_thick=0.06)
    add_rich_runs_textbox(
        slide,
        0.72,
        6.02,
        4.28,
        0.76,
        [
            [("실무 콘솔 & 기술 검증 화면 (GitHub Pages 상시 배포)", 9.5, True, NAVY)],
            [("실무 콘솔: .../dsc-hwp-ai-pipeline/easy.html\n기술 검증: .../dsc-hwp-ai-pipeline/ (로컬 JS 파싱)", 8.5, False, BODY)],
        ],
        margin_lr=0.02,
        margin_tb=0.01,
        space_after_pt=3.0,
    )

    # Right: Large, High-Contrast Cropped Demo UI Preview
    add_section_label(slide, 5.30, 1.36, 7.48, "2. 실제 배포된 실무 콘솔 화면 (easy.html — PM 교체 선별 개정 · 회신 문안)")
    add_rect(slide, 5.30, 1.70, 7.48, 5.14, fill=WHITE, line_color=BORDER_DARK, line_pt=1.0)
    if DEMO_PREVIEW_PATH.exists():
        add_picture_fit(slide, DEMO_PREVIEW_PATH, 5.38, 1.76, 7.32, 4.72)
    add_textbox(
        slide,
        5.38,
        6.52,
        7.32,
        0.28,
        [("실제 배포 캡처: ① 6종 중 2종(인력표·계획서)만 수정 대상 판별  ② 항목별 변경 전·후 비교표  ③ 거래처 공식 회신 문안", 8.8, True, MUTED, PP_ALIGN.CENTER)],
        margin_lr=0.0,
        margin_tb=0.0,
        valign=MSO_ANCHOR.MIDDLE,
    )

    set_speaker_notes(
        slide,
        "[3:25 - 4:50] 라이브 시연 (화면 전환 1분 20초)\n"
        "지금부터 비전공 실무자도 바로 쓸 수 있게 설계한 실무 콘솔(easy.html)로 3단계 시연을 보여드리겠습니다.\n"
        "(브라우저 전환) 1단계, 한국표준과학연구원(KRISS) 실물 .hwp 규격서를 선택하면 원문 제원과 DDR5/PC4 오기 유의사항이 표로 정리됩니다. "
        "2단계에서 한국기계연구원(KIMM) 실제 수의계약 확인서(.hwpx)를 열면 파란 안내문구까지 인식해 9개 항목을 자동 기입하고, 이해충돌 체크란 13건과 서명란은 법적 안전을 위해 수동 확인으로 보호합니다.\n"
        "3단계에서 '총괄책임자(PM) 이준호→박서연 교체' 시나리오를 분석하면 6종 중 인력표·계획서 2종만 수정 대상으로 판별해 Rev.2로 선별 개정하고, 견적·발주·검수·품의 4종은 Rev.1을 유지한 채 회신 문안까지 생성합니다.\n"
        "마지막으로 4단계 제출 전 5대 점검표와 사내 AI용 표준 프롬프트를 확인하고, 우측 상단 버튼으로 기술·보안 검증 화면(3-Way 불일치 탐지·ROI 시뮬레이터)까지 전환할 수 있습니다.",
    )


def build_slide_7(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_slide_chrome(
        slide,
        7,
        "보안 아키텍처 및 폐쇄망 타당성  |  배점: AI 활용도 30점 · 활용성 30점",
        "기밀 유출 0% 폐쇄망 이원화 라우팅 및 국내·해외 오픈소스 Local sLLM",
        "보안서약 방산·출연연 문건은 코드 수정 없이 --base-url 옵션만으로 사내 폐쇄망 Ollama · vLLM 로컬 추론 전환",
    )

    add_section_label(slide, 0.55, 1.36, 12.23, "1. 보안 등급별 하이브리드 라우팅 (Hybrid Security Routing) — 외부 유출 차단 설계")

    add_card_with_bar(slide, 0.55, 1.74, 2.85, 1.72, fill=SURFACE_SUB, border_color=INK, accent_color=INK, accent_side="left", accent_thick=0.06)
    add_rich_runs_textbox(
        slide,
        0.70,
        1.82,
        2.60,
        1.56,
        [
            [("사내 PC · 브라우저 파싱", 10.5, True, INK)],
            [("• hwp_parser.py (로컬 실행)", 9.2, False, BODY)],
            [("• HWP/HWPX 해독 시 외부 통신 0 Byte", 9.2, True, NAVY)],
            [("• 3-Way 산술 검증도 100% 로컬 처리", 9.2, False, BODY)],
        ],
        space_after_pt=4.5,
    )
    add_textbox(slide, 3.42, 2.38, 0.34, 0.40, [("→", 18.0, True, INK, PP_ALIGN.CENTER)], margin_lr=0.0, margin_tb=0.0)

    add_card_with_bar(slide, 3.78, 1.74, 2.35, 1.72, fill=WHITE, border_color=NAVY, accent_color=NAVY, accent_side="top", accent_thick=0.055)
    add_rich_runs_textbox(
        slide,
        3.88,
        1.86,
        2.15,
        1.50,
        [
            [("문서 보안 등급 판별", 10.5, True, NAVY)],
            [("공개 공고 vs 대외비·원가서 자동/수동 분기", 9.2, False, BODY)],
            [("표준 OpenAI 호환 API로 엔드포인트만 교체", 9.2, True, INK)],
        ],
        space_after_pt=5.5,
    )
    add_textbox(slide, 6.15, 1.98, 0.36, 0.36, [("→", 16.0, True, MUTED, PP_ALIGN.CENTER)], margin_lr=0.0, margin_tb=0.0)
    add_textbox(slide, 6.15, 2.88, 0.36, 0.36, [("→", 16.0, True, NAVY, PP_ALIGN.CENTER)], margin_lr=0.0, margin_tb=0.0)

    add_card_with_bar(slide, 6.53, 1.74, 6.25, 0.78, fill=SURFACE_SUB, border_color=BORDER_GRAY, accent_color=MUTED, accent_side="left", accent_thick=0.055)
    add_rich_runs_textbox(
        slide,
        6.68,
        1.78,
        5.98,
        0.70,
        [
            [("트랙 A (공개 입찰공고 · 나라장터 / DAPA 공개문 — 실증 완료)", 9.8, True, INK)],
            [("Enterprise API Gateway (BAZE Zero-Retention · gpt-6.1-terra) → 클라우드 고속 대량 처리", 9.0, False, BODY)],
        ],
        space_after_pt=2.5,
    )

    add_card_with_bar(slide, 6.53, 2.64, 6.25, 0.82, fill=NAVY_TINT, border_color=NAVY, accent_color=NAVY, accent_side="left", accent_thick=0.06)
    add_rich_runs_textbox(
        slide,
        6.68,
        2.68,
        5.98,
        0.74,
        [
            [("트랙 B (대외비 · 사내 원가표 · 보안서약 RFP — 폐쇄망 호환 설계)", 9.8, True, NAVY)],
            [("사내 폐쇄망 Local sLLM (--base-url http://localhost:11434/v1) → 외부 기밀 유출 0%", 9.2, True, INK)],
        ],
        space_after_pt=2.5,
    )

    add_section_label(slide, 0.55, 3.64, 12.23, "2. 국내 · 해외 오픈웨이트 Local sLLM 사내 배치 호환성 (OpenAI API / Ollama · vLLM 기준)")
    add_monochrome_table(
        slide,
        0.55,
        3.98,
        12.23,
        2.86,
        col_widths=[1.25, 3.05, 1.85, 3.70, 2.38],
        headers=["구분", "로컬 오픈웨이트 모델", "권장 VRAM (Q4)", "한국어 공문 · JSON 추출 특성", "적합한 사내 배치 환경"],
        rows=[
            [
                ("국내\n오픈웨이트", True, NAVY, PP_ALIGN.CENTER),
                ("LG AI Research\nEXAONE 3.5 (7.8B / 32B)", True, INK, PP_ALIGN.LEFT),
                ("7.8B: ~6GB\n32B: ~20GB", False, BODY, PP_ALIGN.CENTER),
                ("한국어 공문서·법령·지시이행 및 JSON 구조화 성능 동급 최상위권", False, BODY, PP_ALIGN.LEFT),
                ("7.8B: 단일 16GB GPU PC\n32B: 24~48GB 워크스테이션", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("국내\n오픈웨이트", True, NAVY, PP_ALIGN.CENTER),
                ("Upstage SOLAR-10.7B /\n야놀자 EEVE-Korean-10.8B", True, INK, PP_ALIGN.LEFT),
                ("Q4_K_M:\n~7~8GB", False, BODY, PP_ALIGN.CENTER),
                ("한국어 어휘·문맥 이해도가 높고 12~16GB VRAM에서 빠른 추론 가능", False, BODY, PP_ALIGN.LEFT),
                ("사내 공용 업무용\n단일 GPU PC 1대", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("해외\n오픈소스", True, INK, PP_ALIGN.CENTER),
                ("Alibaba Qwen 2.5\n(7B / 14B / 32B · Apache 2.0)", True, INK, PP_ALIGN.LEFT),
                ("14B: ~10GB\n32B: ~20GB", False, BODY, PP_ALIGN.CENTER),
                ("구조화 JSON 출력 안정성 및 한국어 포함 긴 문맥 추출 성능 우수", False, BODY, PP_ALIGN.LEFT),
                ("14B: RTX 4070 Ti~4090\n32B: 전용 2×GPU 서버", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("해외\n오픈소스", True, INK, PP_ALIGN.CENTER),
                ("Meta Llama 3.1/3.3 (8B) /\nGoogle Gemma 2/3 (9B~27B)", True, INK, PP_ALIGN.LEFT),
                ("8B~12B:\n~6~9GB", False, BODY, PP_ALIGN.CENTER),
                ("범용 JSON 추출 및 온프레미스 Ollama/vLLM JSON 모드(GBNF) 호환", False, BODY, PP_ALIGN.LEFT),
                ("일반 사내 PC ·\n워크스테이션", False, BODY, PP_ALIGN.LEFT),
            ],
        ],
        font_pt=9.0,
        highlight_rows=[0, 2],
        highlight_fill=SURFACE_SUB,
        pad_lr=0.07,
        pad_tb=0.05,
    )

    set_speaker_notes(
        slide,
        "[4:50 - 5:40] 보안 아키텍처 & Local sLLM 타당성\n"
        "방산·출연연 협력사의 최대 우려는 기밀 유출입니다. 저희는 1단계 파싱과 3단계 검증을 100% 로컬 코드로 처리하고, "
        "공개 공고는 BAZE Gateway로 고속 실증했으며, 대외비 원가 문서는 코드 수정 없이 --base-url 옵션 하나만으로 사내 Ollama·vLLM 로컬 모델로 "
        "즉시 전환되도록 설계했습니다. 소형 모델에게 바이너리 해독이나 부가세 계산을 시키지 않기 때문에 16GB 단일 GPU PC의 EXAONE 3.5나 Qwen 2.5로도 충분합니다.",
    )


def build_slide_8(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_slide_chrome(
        slide,
        8,
        "인프라 비용 · 실패/재시도 기회비용 및 ROI  |  배점: 활용성 30점",
        "사내 GPU 컴퓨팅 비용과 실패·재시도 기회비용 계산 (설계 시나리오 추정)",
        "월 40건 · 시급 35,000원 기준, 기존 수작업(월 245만 원) 대비 하이브리드 파이프라인(월 ~20만 원)은 91.8% 비용 절감 · 약 1.6개월 회수",
    )

    # Left Col: Hardware CapEx/OpEx + Retry Opportunity Cost (corrected exponent wording!)
    add_section_label(slide, 0.55, 1.36, 5.75, "1. 사내 하드웨어(CapEx) · 전력(OpEx) 및 재시도 기회비용 산출")

    add_monochrome_table(
        slide,
        0.55,
        1.70,
        5.75,
        1.78,
        col_widths=[1.85, 1.10, 1.25, 1.55],
        headers=["사내 GPU 구성", "초기 구축비", "36개월 감가+전력", "권장 로컬 모델"],
        rows=[
            [
                ("옵션 A: 단일 GPU PC\n(RTX 4070 Ti~4090)", True, NAVY, PP_ALIGN.LEFT),
                ("350만 원\n(250~420만)", True, INK, PP_ALIGN.CENTER),
                ("월 ~10.5만 원\n(감가 9.7만+전기 7.5천)", True, INK, PP_ALIGN.CENTER),
                ("EXAONE 3.5 7.8B\nQwen 2.5 14B", False, BODY, PP_ALIGN.CENTER),
            ],
            [
                ("옵션 B: 2×GPU 서버\n(48GB VRAM)", True, INK, PP_ALIGN.LEFT),
                ("950만 원\n(800~1,100만)", False, BODY, PP_ALIGN.CENTER),
                ("월 ~28.4만 원\n(감가 26.4만+전기 2.0만)", False, BODY, PP_ALIGN.CENTER),
                ("EXAONE 3.5 32B\nQwen 2.5 32B", False, BODY, PP_ALIGN.CENTER),
            ],
        ],
        font_pt=8.5,
        highlight_rows=[0],
        highlight_fill=NAVY_TINT,
        pad_lr=0.05,
        pad_tb=0.04,
    )

    add_card_with_bar(slide, 0.55, 3.60, 5.75, 3.24, fill=SURFACE_SUB, border_color=BORDER_GRAY, accent_color=INK, accent_side="left", accent_thick=0.055)
    add_rich_runs_textbox(
        slide,
        0.72,
        3.68,
        5.48,
        3.08,
        [
            [("Local sLLM 실패·재시도 3대 유형 및 기회비용 분석 (월 40건 가정)", 10.0, True, INK)],
            [("① JSON 문법·키 누락 실패 (1차 실패율 p=15% 가정):", 9.3, True, NAVY)],
            [("   • 최대 3회 시도(--max-retries 3) 시 기대 호출 ", 8.9, False, BODY), ("1.18회/건", 8.9, True, INK), (", 3회 후 잔여 실패율 ", 8.9, False, BODY), ("0.15³ = 0.34%", 8.9, True, INK), (" (추가 GPU 시간 건당 3~5초, 전력비 무시 가능).", 8.9, False, BODY)],
            [("② 단가·부가세·합계 산술 환각 (소형 모델 단독 시 ~20~30%):", 9.3, True, NAVY)],
            [("   • normalize_and_crosscheck()가 100% 코드 재계산 → ", 8.9, False, BODY), ("산술 재시도 기회비용 0원", 8.9, True, INK), (".", 8.9, False, BODY)],
            [("③ 문맥 보정 인적 검수 (Human-in-the-Loop):", 9.3, True, NAVY)],
            [("   • 단일 원천 수정(1회 수정 → 4종 동기화) 기준 건당 ", 8.9, False, BODY), ("평균 4분", 8.9, True, INK), (" → 월 ~2.7시간 = 인건비 ", 8.9, False, BODY), ("~9.5만 원/월", 8.9, True, INK), (" (시급 35,000원 기준).", 8.9, False, BODY)],
        ],
        space_after_pt=4.5,
    )

    # Right Col Top: Crisp Vector Horizontal Bar Chart (Monthly TCO Comparison)
    add_section_label(slide, 6.48, 1.36, 6.30, "2. 운영 대안별 월 총소유비용(TCO) 비교 — 월 40건 · 웹 탭 3 시뮬레이터 연동")
    add_rect(slide, 6.48, 1.70, 6.30, 3.38, fill=WHITE, line_color=BORDER_GRAY, line_pt=0.75)

    add_textbox(
        slide,
        6.66,
        1.80,
        5.94,
        0.26,
        [("월 총비용 비교 (인건비 기회비용 + GPU 감가·전력, 단위: 만 원/월)", 9.2, True, MUTED, PP_ALIGN.LEFT)],
        margin_lr=0.0,
        margin_tb=0.0,
    )

    # Vector horizontal bars (max value 245 -> max width 4.00 in)
    bar_specs = [
        ("1. 기존 수작업 (As-Is)", "70.0h · 인건비 245.0만", 245.0, "245.0만 원", CRIMSON, CRIMSON_TINT),
        ("2. 무검증 자작 LLM", "24.5h+ · 인건비 85.8만 + GPU 10.5만", 96.2, "~96.2만 원+", SLATE, SURFACE_SUB),
        ("3. 본 하이브리드 (옵션 A)", "~2.7h · 인건비 9.5만 + GPU 10.5만", 20.0, "~20.0만 원  (-91.8%)", NAVY, NAVY_TINT),
    ]
    by = 2.16
    max_bar_w = 3.95
    for label_t, detail_t, val, val_str, bar_col, bg_tint in bar_specs:
        # Row label + sub-detail
        add_rich_runs_textbox(
            slide,
            6.66,
            by,
            5.94,
            0.30,
            [[(label_t, 9.8, True, bar_col if bar_col != SLATE else INK), (f"   ({detail_t})", 8.5, False, MUTED)]],
            margin_lr=0.0,
            margin_tb=0.0,
        )
        # Track background
        add_rect(slide, 6.66, by + 0.30, max_bar_w, 0.36, fill=bg_tint, line_color=BORDER_GRAY, line_pt=0.5)
        # Filled bar
        fill_w = max(0.32, max_bar_w * (val / 245.0))
        add_rect(slide, 6.66, by + 0.30, fill_w, 0.36, fill=bar_col, line_color=None)
        # Value callout right next to bar or right-aligned
        if val >= 200:
            add_textbox(
                slide,
                6.74,
                by + 0.30,
                fill_w - 0.14,
                0.36,
                [(val_str, 10.0, True, WHITE, PP_ALIGN.RIGHT)],
                margin_lr=0.0,
                margin_tb=0.0,
                valign=MSO_ANCHOR.MIDDLE,
            )
            add_textbox(
                slide,
                10.70,
                by + 0.30,
                1.92,
                0.36,
                [("본업 이탈 · 오기입", 8.5, True, CRIMSON, PP_ALIGN.LEFT)],
                margin_lr=0.0,
                margin_tb=0.0,
                valign=MSO_ANCHOR.MIDDLE,
            )
        else:
            add_textbox(
                slide,
                6.66 + fill_w + 0.12,
                by + 0.30,
                5.94 - fill_w - 0.12,
                0.36,
                [(val_str, 10.0, True, bar_col if bar_col != SLATE else INK, PP_ALIGN.LEFT)],
                margin_lr=0.0,
                margin_tb=0.0,
                valign=MSO_ANCHOR.MIDDLE,
            )
        by += 0.94

    # Right Col Bottom: 3-KPI ROI Highlight Strip
    add_kpi_card(
        slide,
        6.48,
        5.24,
        2.02,
        1.60,
        "~225만 원",
        "월 순절감액",
        "건당 90~120분 시\n186~263만 원 절감",
        accent=NAVY,
        fill=NAVY_TINT,
    )
    add_kpi_card(
        slide,
        8.62,
        5.24,
        2.02,
        1.60,
        "96.1% ↓",
        "행정 시간 단축",
        "월 70.0h → 2.7h\n엔지니어 본업 복귀",
        accent=EMERALD,
        fill=EMERALD_TINT,
    )
    add_kpi_card(
        slide,
        10.76,
        5.24,
        2.02,
        1.60,
        "1.6개월",
        "GPU 투자 회수",
        "초기 350만 원 ÷\n월 225만 원 순절감",
        accent=CRIMSON,
        fill=CRIMSON_TINT,
    )

    set_speaker_notes(
        slide,
        "[5:40 - 6:25] 사내 GPU 비용 · 재시도 기회비용 & ROI\n"
        "로컬 GPU를 직접 사면 손해가 아닐까? 실패·재시도 기회비용까지 계산했습니다.\n"
        "월 40건 기준 기존 수작업은 70시간, 월 245만 원이 들지만, 350만 원대 단일 RTX PC는 36개월 감가와 전기료를 합쳐 월 10.5만 원입니다. "
        "1차 JSON 실패율을 15%로 보수적으로 잡아도 최대 3회 자동 재시도 시 잔여 실패율은 0.34%에 불과하고, 산술 검증은 코드가 0원으로 막아주며, "
        "사람은 건당 4분만 검수합니다. 우측 그래프처럼 월 총비용이 245만 원에서 20만 원으로 91.8% 줄어 매달 225만 원 순절감, 약 1.6개월 만에 투자비를 회수합니다.",
    )


def build_slide_9(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_slide_chrome(
        slide,
        9,
        "기대 효과 및 결론  |  배점: 창의성 및 발표 20점",
        "대전 기술 중소기업의 '문서 장벽 · 보안 불안 · 행정 소모' 3중 해소",
        "한글(.hwp/.hwpx) 0원 해체부터 폐쇄망 sLLM 완결, 월 60~80시간 행정 시간의 본업 환원까지 현장 즉시 적용 가능",
    )

    impacts = [
        (
            "01  한국형 공공·방산 조달 장벽(HWP/HWPX) 0원 해체",
            "외산 SaaS가 못 풀고 유료 한컴 SDK는 부담스러운 .hwp(OLE2) · .hwpx(OWPML) 문서를 순수 Python 및 브라우저 JS로 직접 파싱해 중소기업 진입장벽을 제거했습니다.",
            INK,
        ),
        (
            "02  정보유출 0% 폐쇄망 완결성 & 실패 기회비용 구조적 봉쇄",
            "공개 문서는 BAZE Gateway로, 대외비·원가 문서는 사내 EXAONE 3.5 · Qwen 2.5로 라우팅하고, 산식·3-Way 검증을 코드에 위임해 보안과 정확성을 동시 확보했습니다.",
            NAVY,
        ),
        (
            "03  고급 R&D·제조 인력의 본업 환원 (월 70시간 → 2.7시간)",
            "전담 행정 인력이 없는 5~30인 대전 대덕특구·산단 기업에서 매달 수십 시간씩 빼앗기던 4중 문서 이기 작업을 압축해 빠른 견적 회신과 핵심 연구개발 몰입을 지원합니다.",
            INK,
        ),
    ]
    iy = 1.38
    for title_t, body_t, col in impacts:
        add_card_with_bar(slide, 0.55, iy, 8.35, 1.05, fill=SURFACE_SUB, border_color=BORDER_GRAY, accent_color=col, accent_side="left", accent_thick=0.06)
        add_rich_runs_textbox(
            slide,
            0.72,
            iy + 0.08,
            8.08,
            0.90,
            [[(title_t, 11.2, True, col)], [(body_t, 9.6, False, BODY)]],
            margin_lr=0.02,
            margin_tb=0.02,
            space_after_pt=4.0,
        )
        iy += 1.14

    add_section_label(slide, 0.55, 4.86, 8.35, "핵심 검증 요약 및 현장 도입 확장 로드맵")
    add_monochrome_table(
        slide,
        0.55,
        5.20,
        8.35,
        1.64,
        col_widths=[2.45, 5.90],
        headers=None,
        rows=[
            [
                ("무라이선스 · 5종 + KIMM 실증", True, INK, PP_ALIGN.LEFT),
                ("방위사업청 4종 + 대전 KRISS .hwp 5.0 + 한국기계연구원(KIMM) 수의계약 확인서(.hwpx) 9/9 자동 기입 완료", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("사내 DB · RAG와의\n차별성 및 시너지", True, INK, PP_ALIGN.LEFT),
                ("사내 DB(저장)·RAG(검색 Q&A)가 못 하는 '외부 HWP 파싱 → 3-Way 산술검증 → 사후 변경 Diff·회신' 전담 (SME 맞춤형 도구 5.7%)", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("지역 현장 확산 전략", True, NAVY, PP_ALIGN.LEFT),
                ("오픈소스 무료 배포 + 실무자용 간편 콘솔(/easy.html) · 5대 최종 점검표 · 사내 보안 AI 표준 프롬프트 키트 통합 제공", False, BODY, PP_ALIGN.LEFT),
            ],
        ],
        font_pt=8.5,
        row_fills=[WHITE, SURFACE_SUB, WHITE],
        pad_lr=0.08,
        pad_tb=0.04,
    )

    add_card_with_bar(slide, 9.12, 1.38, 3.66, 5.46, fill=SURFACE_SUB, border_color=INK, accent_color=INK, accent_side="top", accent_thick=0.06)
    add_textbox(
        slide,
        9.25,
        1.56,
        3.40,
        0.54,
        [
            ("경청해 주셔서 감사합니다", 14.0, True, INK, PP_ALIGN.CENTER),
            ("지금 QR로 직접 실행해 보실 수 있습니다", 9.5, False, MUTED, PP_ALIGN.CENTER),
        ],
        margin_lr=0.0,
        margin_tb=0.0,
        space_after_pt=2.0,
    )
    add_rect(slide, 9.75, 2.24, 2.40, 2.40, fill=WHITE, line_color=BORDER_GRAY, line_pt=0.75)
    add_picture_fit(slide, QR_IMAGE_PATH, 9.83, 2.32, 2.24, 2.24)
    add_rich_runs_textbox(
        slide,
        9.26,
        4.78,
        3.38,
        1.92,
        [
            [("실시간 시연 웹 (GitHub Pages)", 9.0, True, INK)],
            [("https://woody-korean.github.io/dsc-hwp-ai-pipeline/", 8.5, True, NAVY)],
            [("전체 소스코드 · 파서 (GitHub)", 9.0, True, INK)],
            [("https://github.com/woody-korean/dsc-hwp-ai-pipeline", 8.5, False, BODY)],
            [(TEAM_LABEL, 9.5, True, INK)],
        ],
        space_after_pt=4.5,
    )

    set_speaker_notes(
        slide,
        "[6:25 - 7:00] 결론 및 기대 효과\n"
        "정리하겠습니다. 저희 충남대 B팀의 솔루션은 첫째, .hwp·.hwpx를 라이선스 0원으로 완벽히 해독하고, "
        "둘째, 폐쇄망 Local sLLM과 코드 기반 3-Way 검증으로 보안과 정확성을 동시 확보했으며, "
        "셋째, 대전 기술 중소기업의 고급 인력이 본업인 R&D와 수주에 집중하도록 월 70시간의 반복 행정을 2.7시간으로 압축합니다.\n"
        "화면의 QR과 GitHub에서 방위사업청 실물 테스트와 전체 코드를 바로 확인하실 수 있습니다. 감사합니다.",
    )


def main() -> None:
    os.makedirs(PRES_PATH.parent, exist_ok=True)
    os.makedirs(DOCS_PPT_PATH.parent, exist_ok=True)

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    build_slide_1(prs)
    build_slide_2(prs)
    build_slide_3(prs)
    build_slide_4(prs)
    build_slide_5(prs)
    build_slide_6(prs)
    build_slide_7(prs)
    build_slide_8(prs)
    build_slide_9(prs)

    prs.save(str(PRES_PATH))
    shutil.copy2(PRES_PATH, DOCS_PPT_PATH)
    print(f"GENERATED_PPTX: {PRES_PATH} (slides={len(prs.slides)})")
    print(f"COPIED_DOCS_PPTX: {DOCS_PPT_PATH}")


if __name__ == "__main__":
    main()
