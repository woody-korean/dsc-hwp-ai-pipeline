#!/usr/bin/env python3
"""
Deterministic 8-slide 16:9 presentation builder for Chungnam Univ. Team B
(2026 DSC Shared University AI Project Challenge - Task 4).

Outputs:
  - presentation/충남대B팀_과제4_HWP_AI_행정자동화_발표자료.pptx
  - docs/충남대B팀_과제4_HWP_AI_행정자동화_발표자료.pptx
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple

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
LIVE_SCREENSHOT_PATH = Path(
    "/Users/woody/.gemini/antigravity/brain/c99beeed-0f89-44df-9c87-989baeb3c8d1/"
    "browser_evidence/3603e1c8-8627-4a5f-88ed-4cc543707704/final_step_29.png"
)

# Color tokens matching the editorial monochrome web demo
WHITE = RGBColor(255, 255, 255)
INK = RGBColor(17, 24, 39)        # #111827
BODY = RGBColor(31, 41, 55)       # #1F2937
MUTED = RGBColor(75, 85, 99)      # #4B5563
SUBTLE = RGBColor(107, 114, 128)  # #6B7280
NAVY = RGBColor(30, 58, 138)      # #1E3A8A
NAVY_TINT = RGBColor(239, 246, 255)
CRIMSON = RGBColor(153, 27, 27)   # #991B1B
CRIMSON_TINT = RGBColor(254, 242, 242)
CRIMSON_BORDER = RGBColor(252, 165, 165)
SURFACE_SUB = RGBColor(249, 250, 251)  # #F9FAFB
HEADER_BG = RGBColor(243, 244, 246)    # #F3F4F6
BORDER_GRAY = RGBColor(209, 213, 219)  # #D1D5DB
BORDER_DARK = RGBColor(55, 65, 81)     # #374151

FONT_MAIN = "Apple SD Gothic Neo"
TOTAL_SLIDES = 8


def rgb_hex(color: RGBColor) -> str:
    return f"{color[0]:02X}{color[1]:02X}{color[2]:02X}"


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
    # Also remove default style effectRef shadow in spStyle if present
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
    accent_thick: float = 0.05,
):
    add_rect(slide, x, y, w, h, fill=fill, line_color=border_color, line_pt=0.75)
    if accent_color is not None:
        if accent_side == "left":
            add_rect(slide, x, y, accent_thick, h, fill=accent_color, line_color=None)
        elif accent_side == "top":
            add_rect(slide, x, y, w, accent_thick, fill=accent_color, line_color=None)


def add_section_label(slide, x: float, y: float, w: float, text: str, bg: RGBColor = INK) -> None:
    add_rect(slide, x, y, w, 0.28, fill=bg, line_color=None)
    add_textbox(
        slide,
        x + 0.08,
        y,
        w - 0.16,
        0.28,
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

    # Clear built-in PowerPoint table style so custom borders/fills render cleanly
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
            p.space_after = Pt(1.5 if line_idx < len(lines) - 1 else 0)
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
    # White slide canvas
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = WHITE

    # Top dark editorial bar
    add_rect(slide, 0.0, 0.0, 13.333, 0.08, fill=INK, line_color=None)

    # Kicker + Title + Subtitle
    add_textbox(
        slide,
        0.55,
        0.20,
        12.23,
        0.24,
        [(f"SLIDE {slide_no:02d}  |  {kicker}", 9.5, True, MUTED, PP_ALIGN.LEFT)],
        margin_lr=0.0,
        margin_tb=0.0,
    )
    add_textbox(
        slide,
        0.55,
        0.44,
        12.23,
        0.40,
        [(title, 19.5, True, INK, PP_ALIGN.LEFT)],
        margin_lr=0.0,
        margin_tb=0.0,
    )
    add_textbox(
        slide,
        0.55,
        0.86,
        12.23,
        0.28,
        [(subtitle, 11.0, True, NAVY, PP_ALIGN.LEFT)],
        margin_lr=0.0,
        margin_tb=0.0,
    )
    add_rect(slide, 0.55, 1.20, 12.23, 0.018, fill=BORDER_GRAY, line_color=None)

    # Footer
    add_rect(slide, 0.55, 7.04, 12.23, 0.012, fill=BORDER_GRAY, line_color=None)
    add_textbox(
        slide,
        0.55,
        7.08,
        8.20,
        0.26,
        [("충남대학교 B팀 (신수하 외 1인)  ·  2026 DSC 공유대학 AI 실전 프로젝트 챌린지 과제 4", 8.5, False, SUBTLE, PP_ALIGN.LEFT)],
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

    # Kicker pill strip
    add_rect(slide, 0.55, 0.52, 8.45, 0.34, fill=SURFACE_SUB, line_color=BORDER_GRAY, line_pt=0.75)
    add_textbox(
        slide,
        0.65,
        0.52,
        8.25,
        0.34,
        [("2026 DSC 공유대학(대전형) AI 실전 프로젝트 챌린지  |  과제 4 : 중소기업 반복 행정업무 개선", 10.5, True, NAVY, PP_ALIGN.LEFT)],
        margin_lr=0.0,
        margin_tb=0.0,
        valign=MSO_ANCHOR.MIDDLE,
    )

    # Main Title & Subtitle
    add_textbox(
        slide,
        0.55,
        1.04,
        8.45,
        1.45,
        [
            ("국방·공공 HWP/HWPX 파싱 × AI 기반", 25.0, True, INK, PP_ALIGN.LEFT),
            ("대전 B2B 중소기업 4종 행정서식 자동화", 25.0, True, INK, PP_ALIGN.LEFT),
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
        0.66,
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

    # Left 4-row executive spec table
    add_monochrome_table(
        slide,
        0.55,
        3.38,
        8.45,
        3.25,
        col_widths=[1.85, 6.60],
        headers=None,
        rows=[
            [
                ("타깃 기업\n(Option B)", True, INK, PP_ALIGN.LEFT),
                ("대전 대덕산단·대전산단·대덕특구 배후 B2B 정밀제조·방산·연구기자재 납품 중소기업 (5~30인 규모)", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("해결하는\n현장 병목", True, INK, PP_ALIGN.LEFT),
                ("비정형 공고(.hwp/.hwpx) 1건마다 견적서 → 발주·작업지시서 → 납품검수조서 → 지출결의서를 4번 수기 재입력", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("구현 결과물", True, INK, PP_ALIGN.LEFT),
                ("무라이선스 Python/JS HWP·HWPX 파서 + BAZE(gpt-6.1-terra) & Local sLLM 연동 + 3-Way 교차검증 웹 데모", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("발표 팀 / 구성", True, INK, PP_ALIGN.LEFT),
                ("충남대학교 B팀 (신수하 외 1인)  |  2026년 11월 27일 (발표 7분 + 질의응답 3분 · 총 8슬라이드)", True, NAVY, PP_ALIGN.LEFT),
            ],
        ],
        font_pt=10.5,
        row_fills=[SURFACE_SUB, WHITE, SURFACE_SUB, WHITE],
        pad_lr=0.10,
        pad_tb=0.08,
    )

    # Right QR Card
    add_card_with_bar(slide, 9.25, 0.52, 3.53, 6.11, fill=SURFACE_SUB, border_color=INK, accent_color=INK, accent_side="top", accent_thick=0.06)
    add_textbox(
        slide,
        9.40,
        0.74,
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
    add_rect(slide, 9.95, 1.36, 2.13, 2.13, fill=WHITE, line_color=BORDER_GRAY, line_pt=0.75)
    add_picture_fit(slide, QR_IMAGE_PATH, 10.03, 1.44, 1.97, 1.97)
    add_rect(slide, 9.45, 3.64, 3.13, 0.42, fill=WHITE, line_color=BORDER_GRAY, line_pt=0.75)
    add_textbox(
        slide,
        9.50,
        3.64,
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
        4.22,
        3.19,
        2.25,
        [
            [("실시간 시연 탑재 기능", 10.0, True, INK)],
            [("1. ", 9.5, True, NAVY), ("방위사업청 실물 .hwp/.hwpx 4종 즉시 파싱 및 원문·표 해독", 9.5, False, BODY)],
            [("2. ", 9.5, True, NAVY), ("3-Way 수량·단가 불일치 탐지 및 A4 서식 4종 동시 갱신", 9.5, False, BODY)],
            [("3. ", 9.5, True, NAVY), ("직접 .hwp 파일 업로드 및 폐쇄망 GPU 비용 시뮬레이터", 9.5, False, BODY)],
        ],
        space_after_pt=6.0,
    )

    # Bottom footer on slide 1
    add_rect(slide, 0.55, 7.04, 12.23, 0.012, fill=BORDER_GRAY, line_color=None)
    add_textbox(
        slide,
        0.55,
        7.08,
        12.23,
        0.26,
        [("충남대학교 B팀 (신수하 외 1인)  |  GitHub: woody-korean/dsc-hwp-ai-pipeline   |   1 / 8", 8.5, False, SUBTLE, PP_ALIGN.RIGHT)],
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

    # Left: Daejeon & Korea SME Verified Stats Table
    add_section_label(slide, 0.55, 1.36, 6.20, "1. 대전 지역 산업 구조 및 중소기업 AI 도입 공백 (검증 통계)")
    add_monochrome_table(
        slide,
        0.55,
        1.70,
        6.20,
        5.12,
        col_widths=[1.42, 3.12, 1.66],
        headers=["구분", "확인된 핵심 수치", "출처 및 기준"],
        rows=[
            [
                ("대전 중소기업\n거시 규모", True, INK, PP_ALIGN.LEFT),
                ("211,134개사 (종사자 481,130명 · 매출 70조 1,158억 원; 소상공인 20.1만·약 95%)", False, BODY, PP_ALIGN.LEFT),
                ("중기부 기본통계 (2023)\n*대전 업종 세부 미확인\n(KOSIS DT_BR_A001)", False, MUTED, PP_ALIGN.LEFT),
            ],
            [
                ("대전 2대\n핵심 산업단지", True, INK, PP_ALIGN.LEFT),
                ("대전산업단지 1,083개사(종업원 8,559명)\n대덕산업단지 365개사(종업원 14,901명)", False, BODY, PP_ALIGN.LEFT),
                ("대덕구청 산업단지 현황\n(2025년 기준)", False, MUTED, PP_ALIGN.LEFT),
            ],
            [
                ("대덕특구 · R&D\n고기술 집적", True, INK, PP_ALIGN.LEFT),
                ("전문·과학·기술업 3,452개사 (R&D 비중 196.9%), 첨단기술 1,106개사, 인증 2,593개사, 대덕특구 코스닥 64개사", False, BODY, PP_ALIGN.LEFT),
                ("DISTEP (2019/2020)\n전자신문 (2026.10)", False, MUTED, PP_ALIGN.LEFT),
            ],
            [
                ("국내 중소기업\nAI 도입 공백", True, CRIMSON, PP_ALIGN.LEFT),
                ("AI 미적용 94.7% (적용 5.3%)\n장애: 맞춤형 응용서비스 부족 64.0%\n필요: 맞춤형 성공사례 66.3% / 세제 84%", True, BODY, PP_ALIGN.LEFT),
                ("중소기업중앙회\n(2024.11, n=300)", False, MUTED, PP_ALIGN.LEFT),
            ],
            [
                ("반복 행정에\n소비되는 시간", True, INK, PP_ALIGN.LEFT),
                ("한국 직장인 반복·행정 연 251억 시간('거의 절반'), 68% 주 최대 10h, 55% 주 4h 절감 시 도입 의향", False, BODY, PP_ALIGN.LEFT),
                ("Dropbox×YouGov\n(2025.07, 전체 직장인 n≈600)", False, MUTED, PP_ALIGN.LEFT),
            ],
        ],
        font_pt=8.8,
        highlight_rows=[3],
        highlight_fill=CRIMSON_TINT,
        pad_lr=0.06,
        pad_tb=0.04,
    )

    # Right: 4-Stage As-Is Re-entry Bottleneck
    add_section_label(slide, 6.95, 1.36, 5.83, "2. 현장 페인포인트(As-Is): 동일 데이터를 4번 수기 재입력")
    steps = [
        ("① 견적서 (Quotation)", "출연연·방산청 .hwp/.hwpx 공고·도면·품목표를 열어 수량·규격·단가·마진을 엑셀에 수기 계산 후 표준 견적서 작성"),
        ("② 발주서 · 작업지시서 (PO / Work Order)", "수주 확정 시 견적서 내역을 내부 작업지시서와 원자재·외주 발주서에 또다시 수기 재입력 (사양 변경 시 누락 빈발)"),
        ("③ 거래명세서 · 납품검수조서 (Delivery / Inspection)", "납품 시 명세서·검수조서를 출력해 발주 수량·합격 수량·납기 조건을 담당자가 육안으로 일일이 대조"),
        ("④ 지출결의서 · 내부 품의서 (Expense / Approval)", "공급가액·부가세(10%)·필수 첨부서류를 품의서·지출결의서에 다시 기입하고 대표이사·연구소장 결재 요청"),
    ]
    curr_y = 1.72
    for title_txt, desc_txt in steps:
        add_card_with_bar(slide, 6.95, curr_y, 5.83, 0.96, fill=SURFACE_SUB, border_color=BORDER_GRAY, accent_color=NAVY, accent_side="left", accent_thick=0.05)
        add_rich_runs_textbox(
            slide,
            7.08,
            curr_y + 0.05,
            5.64,
            0.86,
            [
                [(title_txt, 10.5, True, INK)],
                [(desc_txt, 9.5, False, BODY)],
            ],
            margin_lr=0.02,
            margin_tb=0.02,
            space_after_pt=3.0,
        )
        curr_y += 1.04

    # Bottom Insight Box
    add_card_with_bar(slide, 6.95, 5.92, 5.83, 0.90, fill=NAVY_TINT, border_color=NAVY, accent_color=NAVY, accent_side="left", accent_thick=0.06)
    add_rich_runs_textbox(
        slide,
        7.10,
        5.96,
        5.60,
        0.82,
        [
            [("왜 'Option B(기술·제조 B2B)'가 과제 4에서 가장 높은 변별력을 갖는가?", 10.0, True, NAVY)],
            [("과제 1~3(홍보·외국인·CS)이 소상공인 접점이라면, 대전 5~30인 정밀제조·납품 기업은 ", 9.2, False, BODY), ("행정 전담 인력 없이 엔지니어가 건당 90~120분씩 반복 문서를 처리", 9.2, True, INK), ("하며 오류 1건이 납품 보류·대금 지연으로 직결됩니다.", 9.2, False, BODY)],
        ],
        margin_lr=0.02,
        margin_tb=0.02,
        space_after_pt=3.0,
    )

    set_speaker_notes(
        slide,
        "[0:30 - 1:30] 문제 정의\n"
        "먼저 왜 이 대상을 선택했는지 말씀드리겠습니다. 대전 전체 중소기업 21만 1천여 개 중 숫자상으로는 소상공인이 약 95%이지만, "
        "과제 1~3이 이미 소상공인 홍보·외국인·고객 응대에 초점을 맞추고 있습니다. 반면 대전을 대표하는 진짜 특화 산업은 "
        "대전산단 1,083개사·대덕산단 365개사와 대덕특구에 밀집한 3,452개 전문·과학·기술 기업, 즉 B2B 정밀제조·방산·연구기자재 중소기업입니다.\n"
        "중기중앙회 조사(2024년, 300개사)에 따르면 국내 중소기업의 94.7%가 AI를 전혀 못 쓰고 있고, 최대 장애물로 '맞춤형 응용서비스 부족(64.0%)'을 꼽았습니다. "
        "현장에서는 전담 행정직이 부족한 기술 기업이 공고문(.hwp) 하나를 받아 견적서, 작업지시서, 납품검수조서, 지출결의서까지 똑같은 내용을 4번씩 복붙·재입력하다가 산술 오류나 서류 누락을 겪습니다.",
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

    add_section_label(slide, 0.55, 1.36, 12.23, "1. 미국 · 일본 중소 제조 · B2B 납품기업 행정 자동화 레퍼런스 (모두 Vendor-Reported / Vendor-Commissioned)")
    add_monochrome_table(
        slide,
        0.55,
        1.70,
        12.23,
        3.16,
        col_widths=[1.85, 2.35, 2.55, 5.48],
        headers=["국가 · 솔루션", "적용 기업 · 조사 대상", "AI 자동화 적용 범위", "확인된 정량 개선 효과 (출처 명시 기준)"],
        rows=[
            [
                ("미국\nPaperless Parts", True, NAVY, PP_ALIGN.LEFT),
                ("Focused on Machining\n(미국 9인 CNC 가공업체)", False, BODY, PP_ALIGN.LEFT),
                ("2D PDF 도면·RFQ 자동 추출 → 견적 세팅 AI 보조", False, BODY, PP_ALIGN.LEFT),
                ("견적 리드타임 5~10영업일 → 1~3영업일 단축 / 매출·처리량 15~20% 성장 / 30~40건 세팅 수시간 → 30분 (vendor-reported)", True, INK, PP_ALIGN.LEFT),
            ],
            [
                ("미국\nPaperless Parts / BILL", True, NAVY, PP_ALIGN.LEFT),
                ("Metalmite (CNC) ·\nTeguar Computers (55인)", False, BODY, PP_ALIGN.LEFT),
                ("스프레드시트 RFQ 추적 대체 · AP 청구서·결재 자동화", False, BODY, PP_ALIGN.LEFT),
                ("Metalmite: 주당 최대 20시간 비효율 해소, 48시간 내 견적 보장 / Teguar(재무 2인): 주 5시간 이상 절감 (vendor-reported)", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("일본\nAI inside (DX Suite)", True, NAVY, PP_ALIGN.LEFT),
                ("일본 제조업 수주 조사(n=329)\n· KTK · 아이케이(IK)", False, BODY, PP_ALIGN.LEFT),
                ("종이·FAX 발주서 및 거래처별 납품서 AI-OCR 데이터화", False, BODY, PP_ALIGN.LEFT),
                ("95.2%+ 종이·73.3% FAX·60.4% 수기입력(88.1% 자동화 희망) / KTK: 납품서 입력 월 90시간 절감, IK: 50%+ 단축", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("일본\nLayerX (バクラク)", True, NAVY, PP_ALIGN.LEFT),
                ("CADDi (제조 조달 플랫폼) ·\n산쿄폴리에틸렌", False, BODY, PP_ALIGN.LEFT),
                ("월 수백 매 종이·PDF 협력사 청구서 AI 판독·대조·전자발송", False, BODY, PP_ALIGN.LEFT),
                ("CADDi: 월 400매 청구서 30~40시간 → 3~4시간 (1/10 단축) / 산쿄: 4~5명 반나절 → 1명 1~2시간, 우편비 월 9만→2만엔", True, INK, PP_ALIGN.LEFT),
            ],
            [
                ("일본\nCybozu (kintone)", True, NAVY, PP_ALIGN.LEFT),
                ("미타리카공업 (~30인 이화학)\n· 노리토미철공소", False, BODY, PP_ALIGN.LEFT),
                ("견적·발주·점검 단일 DB + 원클릭 품의·장표 출력", False, BODY, PP_ALIGN.LEFT),
                ("미타리카: 상담준비 1.5시간 → 5분, 예방점검 28%→50%+ / 노리토미: 주간회의 2h+·인원표 8h+ → 원클릭 출력", False, BODY, PP_ALIGN.LEFT),
            ],
        ],
        font_pt=8.7,
        highlight_rows=[0, 3],
        highlight_fill=SURFACE_SUB,
        pad_lr=0.07,
        pad_tb=0.04,
    )

    add_section_label(slide, 0.55, 4.98, 12.23, "2. 외산 SaaS를 그대로 쓸 수 없는 대한민국 대전 현장의 2가지 결정적 공백 (Gap)", bg=CRIMSON)

    # Gap Card 1
    add_card_with_bar(slide, 0.55, 5.32, 6.00, 1.52, fill=CRIMSON_TINT, border_color=CRIMSON_BORDER, accent_color=CRIMSON, accent_side="left", accent_thick=0.06)
    add_rich_runs_textbox(
        slide,
        0.72,
        5.38,
        5.72,
        1.40,
        [
            [("한계 1 | 한국 고유 공공·국방 문서 포맷 (.hwp / .hwpx) 미지원", 10.5, True, CRIMSON)],
            [("• 외산 SaaS(Paperless Parts 등)는 영문 PDF·FAX 전표에 최적화되어 있어, 대한민국 방위사업청·조달청·출연연 표준인 ", 9.3, False, BODY), (".hwp(OLE2 바이너리)", 9.3, True, INK), (" 및 ", 9.3, False, BODY), (".hwpx(KS X 6101 XML)", 9.3, True, INK), (" 파싱이 아예 불가능합니다.", 9.3, False, BODY)],
            [("• 기존 한컴 SDK는 유료 라이선스 및 Windows 서버 종속으로 영세 SME 도입에 장벽이 큽니다.", 9.3, False, MUTED)],
        ],
        space_after_pt=4.0,
    )

    # Gap Card 2
    add_card_with_bar(slide, 6.78, 5.32, 6.00, 1.52, fill=CRIMSON_TINT, border_color=CRIMSON_BORDER, accent_color=CRIMSON, accent_side="left", accent_thick=0.06)
    add_rich_runs_textbox(
        slide,
        6.95,
        5.38,
        5.72,
        1.40,
        [
            [("한계 2 | 방산·출연연 보안서약 문건의 외부 클라우드 유출 금지", 10.5, True, CRIMSON)],
            [("• 대덕특구 연구소기업과 방산 협력사는 국방규격서·보안서약 RFP·사내 원가표를 다루므로 ", 9.3, False, BODY), ("외부 퍼블릭 SaaS 서버로 원문을 전송하는 방식 자체가 도입 불가", 9.3, True, INK), ("합니다.", 9.3, False, BODY)],
            [("• 따라서 ", 9.3, False, BODY), ("로컬 무라이선스 HWP 파서 + 사내 Local sLLM 전환 구조", 9.3, True, NAVY), ("가 한국 현장의 필수 요건입니다.", 9.3, False, BODY)],
        ],
        space_after_pt=4.0,
    )

    set_speaker_notes(
        slide,
        "[1:30 - 2:15] 미국·일본 레퍼런스 & 한국의 빈틈\n"
        "미국과 일본은 이미 제조·연구장비 중소기업에서 해법을 증명했습니다. 미국의 9인 CNC 기업 Focused on Machining은 "
        "AI 견적 자동화로 리드타임을 최대 10일에서 1~3일로 줄여 매출이 15~20% 늘었고(vendor-reported), 일본 제조 조달사 CADDi는 "
        "월 400매 청구서 처리를 40시간에서 4시간으로 10분의 1로 줄였습니다. 이들의 공통점은 '기존 ERP를 통째로 갈아엎지 않고 비정형 문서 추출과 대조만 자동화했다'는 것입니다.\n"
        "하지만 외산 툴들은 한국에서 두 가지 벽에 부딪힙니다. 첫째, 한국 조달·출연연·방위사업청은 한글(.hwp/.hwpx)을 쓰는데 외산 툴은 파싱 자체가 안 됩니다. "
        "둘째, 방산·연구소 협력사 문서는 기밀이라 외부 클라우드에 올릴 수 없습니다. 그래서 저희가 직접 한국형 파이프라인을 구축했습니다.",
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

    # Top Principle Callout
    add_card_with_bar(slide, 0.55, 1.36, 12.23, 0.56, fill=NAVY_TINT, border_color=NAVY, accent_color=NAVY, accent_side="left", accent_thick=0.06)
    add_textbox(
        slide,
        0.72,
        1.38,
        11.95,
        0.52,
        [
            (
                "아키텍처 핵심:  ① HWP/HWPX 파싱(코드 · 0토큰)  →  ② 핵심 의미·리스크 JSON 추출(BAZE LLM ↔ Local sLLM)  →  ③ 단가·VAT·3-Way 검증(코드 · 산술오류 0%)  →  ④ 단일 원천 4종 A4 서식",
                10.5,
                True,
                INK,
                PP_ALIGN.LEFT,
            )
        ],
        margin_lr=0.0,
        margin_tb=0.0,
        valign=MSO_ANCHOR.MIDDLE,
    )

    # 4 Equal Vertical Pipeline Cards
    cols = [
        (
            "STEP 01",
            "한국형 HWP/HWPX 네이티브 파서",
            "순수 코드 · LLM 0 토큰",
            [
                ("엔진: ", "pipeline/hwp_parser.py & docs/hwp_browser_parser.js"),
                (".hwp 5.0: ", "OLE2 FAT/MiniFAT + zlib 복호화 + HWPTAG 67(PARA_TEXT) 직접 해독"),
                (".hwpx: ", "KS X 6101 OWPML ZIP/XML 파싱 및 병합 표 Markdown 복원"),
                ("이점: ", "유료 한컴 SDK·Windows 없이 서버·브라우저 100% 무손실 추출"),
            ],
            INK,
        ),
        (
            "STEP 02",
            "LLM 의미 추출 및 리스크 진단",
            "BAZE API ↔ Local sLLM",
            [
                ("엔진: ", "BAZE gpt-6.1-terra (폐쇄망 시 --base-url로 Ollama/vLLM 즉시 전환)"),
                ("입력/출력: ", "정제 원문 ~3,000토큰 → 고정 JSON 스키마 ~800토큰"),
                ("안정성: ", "_extract_json_payload() 실패 시 에러 역주입 최대 3회 자동 재시도"),
                ("진단: ", "입찰자격·납기·보안서약·필수첨부 누락 경고(HITL) 자동 추출"),
            ],
            NAVY,
        ),
        (
            "STEP 03",
            "결정론적 산술 · 3-Way 검증기",
            "순수 코드 · 산술 오류 0%",
            [
                ("엔진: ", "normalize_and_crosscheck() & 브라우저 recalcCaseTotals()"),
                ("강제 산식: ", "공급가액 = 수량 × 단가, VAT = 10%, 총액 코드 재계산 덮어쓰기"),
                ("3-Way 대조: ", "① 품목 수량 (견적↔발주↔검수) ② 총액 일치 ③ 납기일 ④ 필수첨부"),
                ("효과: ", "소형 sLLM의 20~30% 산술 환각 위험을 원천 0%로 제거"),
            ],
            INK,
        ),
        (
            "STEP 04",
            "단일 원천 4종 서식 동시 생성",
            "Single Source of Truth",
            [
                ("생성 서식: ", "① 표준 견적서 ② 발주·작업지시서 ③ 거래명세·납품검수조서 ④ 지출결의서"),
                ("실시간 연동: ", "1번 품목 수량·단가 1회 수정 시 4종 합계·VAT·검수판정 일괄 갱신"),
                ("실무 편의: ", "A4 결재란 인쇄/PDF 저장 + 구조화 JSON 다운로드 지원"),
                ("통제: ", "사람은 최종 4분 검수만 수행 (Human-in-the-Loop)"),
            ],
            NAVY,
        ),
    ]

    w_col = 2.93
    gap = 0.17
    for idx, (step_no, step_title, tag_txt, bullets, bar_col) in enumerate(cols):
        cx = 0.55 + idx * (w_col + gap)
        add_card_with_bar(slide, cx, 2.06, w_col, 3.68, fill=SURFACE_SUB, border_color=BORDER_GRAY, accent_color=bar_col, accent_side="top", accent_thick=0.05)
        add_rect(slide, cx + 0.12, 2.20, 0.85, 0.24, fill=bar_col, line_color=None)
        add_textbox(
            slide,
            cx + 0.12,
            2.20,
            0.85,
            0.24,
            [(step_no, 9.0, True, WHITE, PP_ALIGN.CENTER)],
            margin_lr=0.0,
            margin_tb=0.0,
            valign=MSO_ANCHOR.MIDDLE,
        )
        add_textbox(
            slide,
            cx + 1.03,
            2.20,
            w_col - 1.15,
            0.24,
            [(tag_txt, 8.5, True, bar_col, PP_ALIGN.RIGHT)],
            margin_lr=0.0,
            margin_tb=0.0,
            valign=MSO_ANCHOR.MIDDLE,
        )
        add_textbox(
            slide,
            cx + 0.12,
            2.50,
            w_col - 0.24,
            0.46,
            [(step_title, 11.0, True, INK, PP_ALIGN.LEFT)],
            margin_lr=0.0,
            margin_tb=0.0,
        )
        add_rect(slide, cx + 0.12, 2.98, w_col - 0.24, 0.012, fill=BORDER_GRAY, line_color=None)

        rich_lines = []
        for k, v in bullets:
            rich_lines.append([(f"• {k}", 9.0, True, INK), (v, 9.0, False, BODY)])
        add_rich_runs_textbox(
            slide,
            cx + 0.10,
            3.04,
            w_col - 0.20,
            2.64,
            rich_lines,
            margin_lr=0.02,
            margin_tb=0.02,
            space_after_pt=6.0,
        )

    # Bottom Comparison Strip
    add_monochrome_table(
        slide,
        0.55,
        5.88,
        12.23,
        0.96,
        col_widths=[2.65, 4.79, 4.79],
        headers=["설계 방식 비교", "일반 프롬프트 단독 LLM (파일 통째 업로드)", "본 디커플링 하이브리드 파이프라인 (충남대 B팀)"],
        rows=[
            [
                ("정확도 · 호환성 · 보안", True, INK, PP_ALIGN.LEFT),
                (".hwp 바이너리 해독 불가 / 단가·세액 산술 환각 빈발 / 기밀 유출 우려", False, CRIMSON, PP_ALIGN.LEFT),
                ("HWP·HWPX 100% 코드 파싱 / 산술·3-Way 오류 0% / 폐쇄망 sLLM 호환", True, NAVY, PP_ALIGN.LEFT),
            ]
        ],
        font_pt=9.0,
        pad_lr=0.08,
        pad_tb=0.03,
    )

    set_speaker_notes(
        slide,
        "[2:15 - 3:15] 해결 아키텍처\n"
        "저희 아키텍처의 가장 큰 차별점은 결정론적 코드와 생성형 AI의 역할을 엄격히 분리(Decoupling)한 것입니다.\n"
        "많은 AI 데모가 LLM에게 파일 통째로 넣고 계산까지 맡기다 보니 할루시네이션으로 합계가 틀립니다. 저희는 1단계에서 자체 구현한 Python 및 "
        "브라우저 자바스크립트 파서가 별도 한컴 프로그램 없이 .hwp 바이너리 스트림(OLE2/zlib)과 .hwpx XML 표를 토큰 소모 0으로 완벽히 분해합니다.\n"
        "2단계에서만 BAZE API의 gpt-6.1-terra 또는 사내 로컬 sLLM을 호출해 핵심 조건과 리스크를 JSON으로 뽑고, 파싱이 어긋나면 에러 원인을 되돌려 "
        "최대 3회 자동 재시도합니다. 그리고 3단계에서 normalize_and_crosscheck 코드가 수량×단가와 부가세 10%, 견적·발주·검수 간 3-Way 일치를 "
        "수학적으로 100% 강제 검증한 뒤, 4단계로 4종 A4 서식을 동시 생성합니다.",
    )


def build_slide_5(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_slide_chrome(
        slide,
        5,
        "실물 검증 및 라이브 시연  |  배점: 결과물 완성도 및 활용성 30점",
        "방위사업청 실물 HWP/HWPX 4종 파싱 검증 및 실시간 QR 웹 시연",
        "dapa.go.kr 실제 입찰·선정 공고 4종을 BAZE 파이프라인과 GitHub Pages 브라우저 엔진으로 교차 검증 완료",
    )

    add_section_label(slide, 0.55, 1.36, 12.23, "1. 방위사업청(dapa.go.kr) 실물 공고 4종 파싱 & BAZE LLM(gpt-6.1-terra) 파이프라인 실측 결과")
    add_monochrome_table(
        slide,
        0.55,
        1.70,
        12.23,
        1.98,
        col_widths=[3.15, 2.30, 2.45, 4.33],
        headers=["수집 실물 파일명 · 공고명", "문서 포맷 엔진", "파싱 추출 규모 (무손실)", "자동생성 4종 서식 예시 합계(VAT 포함) 및 상태"],
        rows=[
            [
                ("dapa_uav_bid.hwpx\n(해안정찰용무인항공기 입찰)", True, INK, PP_ALIGN.LEFT),
                ("HWPX (KS X 6101 XML)", False, BODY, PP_ALIGN.CENTER),
                ("105,207B · 303문단 · 8표 · 16,348자", False, BODY, PP_ALIGN.CENTER),
                ("3개 품목 자동 추출 → 총 36,300,000원 (3-Way PASS)", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("dapa_tactical_relay_bid.hwpx\n(전술이동중계기 입찰)", True, INK, PP_ALIGN.LEFT),
                ("HWPX (KS X 6101 XML)", False, BODY, PP_ALIGN.CENTER),
                ("99,065B · 166문단 · 8표 · 15,496자", False, BODY, PP_ALIGN.CENTER),
                ("3개 품목 자동 추출 → 총 20,900,000원 (3-Way PASS)", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("dapa_sme_priority_items.hwpx\n(중소기업 우선선정 품목)", True, INK, PP_ALIGN.LEFT),
                ("HWPX (KS X 6101 XML)", False, BODY, PP_ALIGN.CENTER),
                ("55,732B · 10문단 · 1표 · 509자", False, BODY, PP_ALIGN.CENTER),
                ("3개 품목 자동 추출 → 총 27,500,000원 (3-Way PASS)", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("dapa_defense_innov_sme.hwp\n(제5기 방산혁신기업 선정)", True, NAVY, PP_ALIGN.LEFT),
                ("HWP 5.0 Binary (OLE2/CFB)", True, NAVY, PP_ALIGN.CENTER),
                ("70,144B · 54문단 · 1표 · 1,155자", False, BODY, PP_ALIGN.CENTER),
                ("3개 품목 자동 추출 → 총 16,500,000원 (3-Way PASS)", True, INK, PP_ALIGN.LEFT),
            ],
        ],
        font_pt=8.7,
        highlight_rows=[3],
        highlight_fill=NAVY_TINT,
        pad_lr=0.06,
        pad_tb=0.03,
    )

    # Bottom Left: 3-Step Live Demo Sequence
    add_section_label(slide, 0.55, 3.82, 5.75, "2. 현장 라이브 시연 3단계 (브라우저 전환 시연)")
    demo_steps = [
        ("1단계 | 실물 .hwp/.hwpx 원문·표 해독 & 리스크 진단", "케이스 4(.hwp 바이너리) 클릭 → 매직바이트 0xd0cf11e0, 54문단·1표 추출 원문 및 실무 누락 경고 즉시 확인"),
        ("2단계 | 수량·금액 불일치 오류 실시간 탐지 시연", "'수량·금액 불일치 탐지 시연' 클릭 → 발주(2)≠납품(1) 및 품의 차액(55만 원) 빨간 [불일치] 경고·검수 보류 판정"),
        ("3단계 | 단일 원천 수량 수정 & 직접 파일 업로드", "1번 품목 수량(2→5) 수정 시 견적·발주·검수·품의 총액(21,450,000원) 즉시 동기화 / 탭 2 직접 .hwp 업로드 지원"),
    ]
    cy = 4.16
    for dt, dd in demo_steps:
        add_card_with_bar(slide, 0.55, cy, 5.75, 0.84, fill=SURFACE_SUB, border_color=BORDER_GRAY, accent_color=NAVY, accent_side="left", accent_thick=0.05)
        add_rich_runs_textbox(
            slide,
            0.70,
            cy + 0.05,
            5.50,
            0.74,
            [[(dt, 9.8, True, INK)], [(dd, 8.9, False, BODY)]],
            margin_lr=0.02,
            margin_tb=0.01,
            space_after_pt=2.5,
        )
        cy += 0.90

    # Bottom Right: Verified Live Website Screenshot Frame
    add_section_label(slide, 6.48, 3.82, 6.30, "3. 실제 배포된 GitHub Pages 시연 화면 (브라우저 검증 캡처)")
    add_rect(slide, 6.48, 4.12, 6.30, 2.74, fill=WHITE, line_color=BORDER_DARK, line_pt=1.0)
    if LIVE_SCREENSHOT_PATH.exists():
        add_picture_fit(slide, LIVE_SCREENSHOT_PATH, 6.54, 4.16, 6.18, 2.40)
    add_textbox(
        slide,
        6.54,
        6.58,
        6.18,
        0.24,
        [("텍스트 중심 A4 공문서 UI: 3-Way 교차검증 표 + 단일 원천 동기화 + 거래명세·납품검수조서 실시간 렌더링", 8.2, True, MUTED, PP_ALIGN.CENTER)],
        margin_lr=0.0,
        margin_tb=0.0,
        valign=MSO_ANCHOR.MIDDLE,
    )

    set_speaker_notes(
        slide,
        "[3:15 - 4:45] 실물 검증 및 라이브 시연 (화면 전환)\n"
        "가짜 샘플이 아니라 실제 방위사업청(dapa.go.kr)에 올라온 16,348자짜리 무인항공기 입찰 공고(.hwpx)부터 옛날 .hwp 5.0 바이너리 공고까지 "
        "4종을 직접 수집해 BAZE LLM 파이프라인으로 전부 검증했습니다. 지금부터 띄워놓은 실제 웹사이트로 30초 시연을 보여드리겠습니다.\n"
        "(브라우저 시연 화면 전환) 상단에서 방위사업청 실물 문서를 선택하면 원본 OLE2/XML 파싱 원문과 BAZE LLM이 짚어낸 실무 경고가 즉시 뜹니다.\n"
        "아래 3단계에서 '수량·금액 불일치 탐지 시연' 버튼을 누르면, 실납품 수량 누락과 품의 총액 55만 원 차이를 빨간 [불일치] 경고와 검수조서 '수량불일치(보류)'로 "
        "즉각 잡아냅니다. 마지막으로 1번 품목 수량을 고치자마자 견적서·발주서·검수조서·지출결의서 총액이 동시에 재계산됩니다.",
    )


def build_slide_6(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_slide_chrome(
        slide,
        6,
        "보안 아키텍처 및 폐쇄망 타당성  |  배점: AI 활용도 30점 · 활용성 30점",
        "기밀 유출 0% 폐쇄망 이원화 라우팅 및 국내·해외 오픈소스 Local sLLM",
        "보안서약 방산·출연연 문건은 코드 수정 없이 --base-url 옵션만으로 사내 폐쇄망 Ollama · vLLM 로컬 추론 전환",
    )

    # Top Section: Hybrid Security Routing Diagram
    add_section_label(slide, 0.55, 1.36, 12.23, "1. 보안 등급별 하이브리드 라우팅 (Hybrid Security Routing) — 외부 유출 차단 설계")

    # Box 1: Input & Local Parser
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
            [("• HWP/HWPX 해독 시 외부 서버 통신 0 Byte", 9.2, True, NAVY)],
            [("• 3-Way 산술 검증도 100% 로컬 코드로 처리", 9.2, False, BODY)],
        ],
        space_after_pt=4.0,
    )
    add_textbox(slide, 3.42, 2.38, 0.34, 0.40, [("→", 18.0, True, INK, PP_ALIGN.CENTER)], margin_lr=0.0, margin_tb=0.0)

    # Box 2: Classification Gate
    add_card_with_bar(slide, 3.78, 1.74, 2.35, 1.72, fill=WHITE, border_color=NAVY, accent_color=NAVY, accent_side="top", accent_thick=0.05)
    add_rich_runs_textbox(
        slide,
        3.88,
        1.86,
        2.15,
        1.50,
        [
            [("문서 보안 등급 판별", 10.5, True, NAVY)],
            [("공개 공고 vs 대외비·원가서 자동/수동 분기", 9.2, False, BODY)],
            [("표준 OpenAI 호환 API로 엔드포인트만 교체", 9.0, True, INK)],
        ],
        space_after_pt=5.0,
    )
    add_textbox(slide, 6.15, 1.98, 0.36, 0.36, [("→", 16.0, True, MUTED, PP_ALIGN.CENTER)], margin_lr=0.0, margin_tb=0.0)
    add_textbox(slide, 6.15, 2.88, 0.36, 0.36, [("→", 16.0, True, NAVY, PP_ALIGN.CENTER)], margin_lr=0.0, margin_tb=0.0)

    # Box 3A: Track A (Public)
    add_card_with_bar(slide, 6.53, 1.74, 6.25, 0.78, fill=SURFACE_SUB, border_color=BORDER_GRAY, accent_color=MUTED, accent_side="left", accent_thick=0.05)
    add_rich_runs_textbox(
        slide,
        6.68,
        1.78,
        5.98,
        0.70,
        [
            [("트랙 A (공개 입찰공고 · 나라장터 / DAPA 공개문)", 9.8, True, INK)],
            [("Enterprise API Gateway (BAZE Zero-Retention · gpt-6.1-terra) → 클라우드 고속 대량 처리", 9.0, False, BODY)],
        ],
        space_after_pt=2.5,
    )

    # Box 3B: Track B (Confidential On-Premise)
    add_card_with_bar(slide, 6.53, 2.64, 6.25, 0.82, fill=NAVY_TINT, border_color=NAVY, accent_color=NAVY, accent_side="left", accent_thick=0.06)
    add_rich_runs_textbox(
        slide,
        6.68,
        2.68,
        5.98,
        0.74,
        [
            [("트랙 B (대외비 · 사내 원가표 · 보안서약 RFP · 출연연 성적서)", 9.8, True, NAVY)],
            [("사내 폐쇄망 Local sLLM (--base-url http://localhost:11434/v1) → 외부 기밀 유출 0%", 9.2, True, INK)],
        ],
        space_after_pt=2.5,
    )

    # Bottom Section: Open-Weight Local sLLM Comparison Table
    add_section_label(slide, 0.55, 3.64, 12.23, "2. 국내 · 해외 오픈소스 / 오픈웨이트 Local sLLM 적용 가능성 비교 (사내 GPU 환경 기준)")
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
        font_pt=8.9,
        highlight_rows=[0, 2],
        highlight_fill=SURFACE_SUB,
        pad_lr=0.07,
        pad_tb=0.05,
    )

    set_speaker_notes(
        slide,
        "[4:45 - 5:45] 보안 아키텍처 & Local sLLM 타당성\n"
        "현장 심사에서 가장 많이 걱정하시는 질문이 '우리 회사 기밀 견적서와 방산 RFP를 외부 AI 서버로 보내도 되느냐'입니다. "
        "대덕특구와 방산 협력사는 보안서약 때문에 절대 외부 전송을 할 수 없습니다.\n"
        "저희는 개발 단계부터 국내 LG EXAONE 3.5(7.8B)나 업스테이지 SOLAR-10.7B, 해외 Qwen 2.5(14B) 같은 오픈소스 로컬 sLLM에서도 "
        "100% 돌아가도록 설계했습니다. 앞서 보신 4단계 역할 분리 덕분에 소형 로컬 모델이 어려운 바이너리 해독과 부가세 곱셈을 할 필요가 없고, "
        "오직 JSON 추출 한 가지만 맡기 때문입니다. 실제 구현된 baze_pipeline.py에서도 옵션 URL 하나만 localhost:11434 사내 Ollama 서버로 바꾸면 "
        "외부 통신 0바이트로 완결됩니다.",
    )


def build_slide_7(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_slide_chrome(
        slide,
        7,
        "인프라 비용 · 실패/재시도 기회비용 및 ROI  |  배점: 활용성 30점",
        "사내 GPU 컴퓨팅 비용과 실패·재시도 기회비용 계산 (설계 시나리오 추정)",
        "월 40건 · 시급 35,000원 기준, 기존 수작업(월 245만 원) 대비 하이브리드 파이프라인(월 ~20만 원)은 약 1.6개월 내 투자비 회수",
    )

    # Left Col: CapEx/OpEx + Retry Opportunity Cost Breakdown
    add_section_label(slide, 0.55, 1.36, 5.75, "1. 사내 하드웨어(CapEx) · 전력(OpEx) 및 재시도 기회비용 산출")

    add_monochrome_table(
        slide,
        0.55,
        1.70,
        5.75,
        1.85,
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
        font_pt=8.4,
        highlight_rows=[0],
        highlight_fill=NAVY_TINT,
        pad_lr=0.05,
        pad_tb=0.04,
    )

    add_card_with_bar(slide, 0.55, 3.68, 5.75, 3.16, fill=SURFACE_SUB, border_color=BORDER_GRAY, accent_color=INK, accent_side="left", accent_thick=0.05)
    add_rich_runs_textbox(
        slide,
        0.72,
        3.76,
        5.48,
        3.00,
        [
            [("Local sLLM 실패·재시도 3대 유형 및 기회비용 분석 (월 40건 가정)", 10.0, True, INK)],
            [("① JSON 문법·키 누락 실패 (1차 실패율 p=15% 가정):", 9.2, True, NAVY)],
            [("   • --max-retries 3 자동 재시도 시 기대 호출 1/(1-0.15) = ", 8.8, False, BODY), ("1.18회/건", 8.8, True, INK), (", 3회 후 잔여 실패율 ", 8.8, False, BODY), ("0.15³ = 0.34%", 8.8, True, INK), (" (추가 GPU 시간 건당 3~5초, 전력비 무시 가능).", 8.8, False, BODY)],
            [("② 단가·부가세·합계 산술 환각 (소형 모델 단독 시 ~20~30%):", 9.2, True, NAVY)],
            [("   • normalize_and_crosscheck()가 100% 코드 재계산 → ", 8.8, False, BODY), ("산술 재시도 기회비용 0원", 8.8, True, INK), (".", 8.8, False, BODY)],
            [("③ 문맥 보정 인적 검수 (Human-in-the-Loop):", 9.2, True, NAVY)],
            [("   • 단일 원천 수정(1회 수정 → 4종 동기화) 기준 건당 ", 8.8, False, BODY), ("평균 4분", 8.8, True, INK), (" → 월 ~2.7시간 = 인건비 ", 8.8, False, BODY), ("~9.5만 원/월", 8.8, True, INK), (" (시급 35,000원 기준).", 8.8, False, BODY)],
        ],
        space_after_pt=4.0,
    )

    # Right Col: 3-Scenario TCO Comparison Table + ROI Highlight Box
    add_section_label(slide, 6.48, 1.36, 6.30, "2. 운영 시나리오별 월 총소유비용(TCO) 비교 (웹 탭 3 시뮬레이터 연동)")
    add_monochrome_table(
        slide,
        6.48,
        1.70,
        6.30,
        3.38,
        col_widths=[1.62, 0.90, 1.25, 1.15, 1.38],
        headers=["운영 대안\n(월 40건)", "월 소요\n시간", "인건비 ·\n기회비용", "GPU 감가\n+ 전기료", "월 총비용\n합계 / 비고"],
        rows=[
            [
                ("1. 기존 수작업\n(As-Is)", True, CRIMSON, PP_ALIGN.LEFT),
                ("70.0시간\n(건당 105분)", False, BODY, PP_ALIGN.CENTER),
                ("245.0만 원", False, BODY, PP_ALIGN.RIGHT),
                ("0원", False, MUTED, PP_ALIGN.RIGHT),
                ("245.0만 원/월\n본업 이탈·오기입", True, CRIMSON, PP_ALIGN.RIGHT),
            ],
            [
                ("2. 무검증 자작 LLM\n(파서·검증 없음)", True, INK, PP_ALIGN.LEFT),
                ("24.5시간+\n(재검산 37분)", False, BODY, PP_ALIGN.CENTER),
                ("85.8만 원+\n(개발비 별도)", False, BODY, PP_ALIGN.RIGHT),
                ("~10.5만 원", False, BODY, PP_ALIGN.RIGHT),
                ("~96.2만 원+/월\n할루시네이션 불신", False, BODY, PP_ALIGN.RIGHT),
            ],
            [
                ("3. 본 하이브리드\n파이프라인 (옵션 A)", True, NAVY, PP_ALIGN.LEFT),
                ("~2.7시간\n(건당 4분+재시도)", True, NAVY, PP_ALIGN.CENTER),
                ("~9.5만 원", True, INK, PP_ALIGN.RIGHT),
                ("~10.5만 원", True, INK, PP_ALIGN.RIGHT),
                ("~20.0만 원/월\n유출 0% · 오류 0%", True, NAVY, PP_ALIGN.RIGHT),
            ],
        ],
        font_pt=8.7,
        highlight_rows=[2],
        highlight_fill=NAVY_TINT,
        pad_lr=0.05,
        pad_tb=0.06,
    )

    # ROI KPI Summary Card
    add_card_with_bar(slide, 6.48, 5.24, 6.30, 1.60, fill=WHITE, border_color=INK, accent_color=INK, accent_side="top", accent_thick=0.06)
    add_rich_runs_textbox(
        slide,
        6.64,
        5.36,
        5.98,
        1.42,
        [
            [("핵심 경제성 결론 (설계 시나리오 추정 기준)", 10.5, True, INK)],
            [("• 월 순절감액: ", 9.8, True, NAVY), ("약 225만 원/월", 11.5, True, INK), ("  (건당 90~120분 범위 적용 시 186만~263만 원 순절감)", 9.0, False, MUTED)],
            [("• 행정 시간 단축: ", 9.8, True, NAVY), ("96.1%↓ (70시간 → 2.7시간)", 11.0, True, INK), ("  |  R&D·엔지니어 인력의 본업 복귀", 9.0, False, MUTED)],
            [("• 하드웨어 투자 회수 기간(Payback): ", 9.8, True, NAVY), ("약 1.6개월", 11.5, True, CRIMSON), (" (초기 350만 원 ÷ 월 225만 원 순절감)", 9.0, False, MUTED)],
        ],
        space_after_pt=5.0,
    )

    set_speaker_notes(
        slide,
        "[5:45 - 6:30] 사내 GPU 비용 · 재시도 기회비용 & ROI\n"
        "그렇다면 로컬 GPU를 직접 사서 돌리면 오히려 손해가 아닐까? 실패와 재시도 기회비용까지 계산해 봤습니다.\n"
        "월 40건·시급 3만 5천 원 기준, 기존 수작업은 70시간, 인건비 기회비용 월 245만 원이 듭니다. 반면 350만 원대 단일 RTX GPU PC를 도입하면 "
        "36개월 감가와 전기료를 합쳐 월 약 10만 5천 원입니다. 로컬 모델이 첫 시도에 15% 확률로 JSON을 틀리더라도 3회 자동 재시도 기댓값이 1.18회"
        "(잔여 실패율 0.34%)에 불과하고, 산술 검증은 코드가 0원으로 막아주며, 사람은 건당 4분만 확인하면 됩니다.\n"
        "결과적으로 월 총비용은 20만 원 수준으로 낮아져 매달 약 225만 원 순절감, 도입 약 1.6개월 만에 GPU 투자비를 회수할 수 있으며, "
        "이 계산기 역시 데모 사이트 3번째 탭에 실시간 탑재했습니다.",
    )


def build_slide_8(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_slide_chrome(
        slide,
        8,
        "기대 효과 및 결론  |  배점: 창의성 및 발표 20점",
        "대전 기술 중소기업의 '문서 장벽 · 보안 불안 · 행정 소모' 3중 해소",
        "한글(.hwp/.hwpx) 0원 해체부터 폐쇄망 sLLM 완결, 월 60~80시간 행정 시간의 본업 환원까지 현장 즉시 적용 가능",
    )

    # Left Top: 3 Key Value Cards
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

    # Left Bottom: Q&A Quick Defense Table
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
                ("무라이선스 · 표 복원력", True, INK, PP_ALIGN.LEFT),
                ("방위사업청 303문단·8표(.hwpx) 및 54문단(.hwp 5.0) 실물 테스트 완료 (*스캔 이미지 PDF/HWP는 OCR 전처리 연계 가능)", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("범용 API · 폐쇄망 호환", True, INK, PP_ALIGN.LEFT),
                ("OpenAI 호환 규격으로 BAZE(gpt-6.1-terra) 실측 및 사내 Ollama/vLLM(--base-url) 즉시 전환 구조 검증", False, BODY, PP_ALIGN.LEFT),
            ],
            [
                ("지역 현장 확산 전략", True, NAVY, PP_ALIGN.LEFT),
                ("오픈소스 무료 배포 + 기업별 사내 견적·품의 서식 1회 커스터마이징 및 폐쇄망 GPU 워크스테이션 패키지화", False, BODY, PP_ALIGN.LEFT),
            ],
        ],
        font_pt=8.7,
        row_fills=[WHITE, SURFACE_SUB, WHITE],
        pad_lr=0.08,
        pad_tb=0.04,
    )

    # Right Side: Large QR + GitHub Card
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
            [("충남대학교 B팀  |  신수하 외 1인", 9.5, True, INK)],
        ],
        space_after_pt=4.5,
    )

    set_speaker_notes(
        slide,
        "[6:30 - 7:00] 결론 및 기대 효과\n"
        "정리하겠습니다. 저희 충남대 B팀이 구현한 솔루션은\n"
        "첫째, 대한민국 고유 포맷인 .hwp·.hwpx를 라이선스 비용 없이 완벽히 파싱하고,\n"
        "둘째, 폐쇄망 Local sLLM과 코드 기반 3-Way 검증을 결합해 정보유출과 실패 기회비용을 동시에 봉쇄했으며,\n"
        "셋째, 대덕특구와 산단 기술 인력들이 매달 수십 시간의 복붙 행정에서 벗어나 본업인 연구개발과 수주에 집중할 수 있게 만듭니다.\n"
        "화면의 QR과 GitHub에서 방위사업청 실물 테스트와 코드 전체를 확인하실 수 있습니다. 이상 발표를 마치겠습니다. 감사합니다.",
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

    prs.save(str(PRES_PATH))
    shutil.copy2(PRES_PATH, DOCS_PPT_PATH)
    print(f"GENERATED_PPTX: {PRES_PATH} (slides={len(prs.slides)})")
    print(f"COPIED_DOCS_PPTX: {DOCS_PPT_PATH}")


if __name__ == "__main__":
    main()
