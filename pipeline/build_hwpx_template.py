#!/usr/bin/env python3
"""
Builds an authentic KS X 6101 (.hwpx) official submission form template by cloning
verified Hancom container metadata/header/styles from samples/dapa_sme_priority_items.hwpx
and generating a clean A4 table-structured Contents/section0.xml with {{PLACEHOLDER}} tags.

Outputs:
  - templates/standard_quote_submit_template.hwpx
  - docs/templates/standard_quote_submit_template.hwpx
"""

from __future__ import annotations

import shutil
import xml.sax.saxutils as sax
import zipfile
from pathlib import Path

from hwp_parser import parse_hwp_any

ROOT_DIR = Path(__file__).resolve().parent.parent
SEED_HWPX = ROOT_DIR / "samples" / "dapa_sme_priority_items.hwpx"
OUT_TEMPLATE = ROOT_DIR / "templates" / "standard_quote_submit_template.hwpx"
OUT_DOCS_TEMPLATE = ROOT_DIR / "docs" / "templates" / "standard_quote_submit_template.hwpx"

NS_DECLS = (
    'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" '
    'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" '
    'xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" '
    'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" '
    'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" '
    'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" '
    'xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" '
    'xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" '
    'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" '
    'xmlns:dc="http://purl.org/dc/elements/1.1/" '
    'xmlns:opf="http://www.idpf.org/2007/opf/" '
    'xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" '
    'xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" '
    'xmlns:epub="http://www.idpf.org/2007/ops" '
    'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"'
)


def make_para(text: str, char_pr: str = "0", para_pr: str = "0", pid: int = 100) -> str:
    esc = sax.escape(text)
    return (
        f'<hp:p id="{pid}" paraPrIDRef="{para_pr}" styleIDRef="0" '
        f'pageBreak="0" columnBreak="0" merged="0">'
        f'<hp:run charPrIDRef="{char_pr}"><hp:t>{esc}</hp:t></hp:run>'
        f"</hp:p>"
    )


def make_table(
    tbl_id: int,
    rows: list[list[str]],
    col_widths: list[int],
    row_height: int = 2100,
    header_rows: int = 0,
    char_pr: str = "0",
) -> str:
    n_rows = len(rows)
    n_cols = len(col_widths)
    total_w = sum(col_widths)
    total_h = n_rows * row_height
    tr_xml: list[str] = []

    for r_idx, row in enumerate(rows):
        tc_xml: list[str] = []
        bf_id = "5" if r_idx < header_rows else "6"
        c_pr = "27" if r_idx < header_rows else char_pr
        for c_idx, cell_text in enumerate(row):
            cw = col_widths[c_idx]
            esc = sax.escape(cell_text)
            tc_xml.append(
                f'<hp:tc name="" header="{1 if r_idx < header_rows else 0}" '
                f'hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="{bf_id}">'
                f'<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" '
                f'vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" '
                f'textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
                f'<hp:p id="{2000 + tbl_id * 100 + r_idx * 10 + c_idx}" '
                f'paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
                f'<hp:run charPrIDRef="{c_pr}"><hp:t>{esc}</hp:t></hp:run>'
                f"</hp:p></hp:subList>"
                f'<hp:cellAddr colAddr="{c_idx}" rowAddr="{r_idx}"/>'
                f'<hp:cellSpan colSpan="1" rowSpan="1"/>'
                f'<hp:cellSz width="{cw}" height="{row_height}"/>'
                f'<hp:cellMargin left="141" right="141" top="110" bottom="110"/>'
                f"</hp:tc>"
            )
        tr_xml.append("<hp:tr>" + "".join(tc_xml) + "</hp:tr>")

    return (
        f'<hp:p id="{tbl_id}" paraPrIDRef="0" styleIDRef="0" '
        f'pageBreak="0" columnBreak="0" merged="0">'
        f'<hp:run charPrIDRef="{char_pr}">'
        f'<hp:tbl id="{tbl_id}" zOrder="0" numberingType="TABLE" '
        f'textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" '
        f'pageBreak="CELL" repeatHeader="1" rowCnt="{n_rows}" colCnt="{n_cols}" '
        f'cellSpacing="0" borderFillIDRef="4" noAdjust="1">'
        f'<hp:sz width="{total_w}" widthRelTo="ABSOLUTE" height="{total_h}" heightRelTo="ABSOLUTE" protect="0"/>'
        f'<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" '
        f'holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" '
        f'vertOffset="0" horzOffset="0"/>'
        f'<hp:outMargin left="141" right="141" top="141" bottom="141"/>'
        f'<hp:inMargin left="141" right="141" top="110" bottom="110"/>'
        + "".join(tr_xml)
        + "</hp:tbl></hp:run></hp:p>"
    )


def build_section_xml(seed_sec_xml: str) -> str:
    sec_pr_start = seed_sec_xml.find("<hp:secPr")
    sec_pr_end = seed_sec_xml.find("</hp:secPr>") + len("</hp:secPr>")
    ctrl_start = seed_sec_xml.find("<hp:ctrl", sec_pr_end)
    ctrl_end = seed_sec_xml.find("</hp:ctrl>", ctrl_start) + len("</hp:ctrl>")
    sec_pr_block = seed_sec_xml[sec_pr_start:sec_pr_end]
    ctrl_block = seed_sec_xml[ctrl_start:ctrl_end]

    title_p = (
        f'<hp:p id="1" paraPrIDRef="15" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
        f'<hp:run charPrIDRef="20">{sec_pr_block}{ctrl_block}</hp:run>'
        f'<hp:run charPrIDRef="20"><hp:t>표준 견적제출 및 납품확인서 (기관 · 사내 지정 양식)</hp:t></hp:run>'
        f"</hp:p>"
    )

    subtitle_p = make_para(
        "문서번호: {{DOC_NO}} ({{REVISION_TAG}})   |   작성일자: {{DOC_DATE}}   |   납품요청기한: {{DUE_DATE}}",
        char_pr="2",
        pid=2,
    )

    h1 = make_para("1. 제출기업(공급자) 등록 정보", char_pr="27", pid=10)
    tbl1 = make_table(
        101,
        [
            ["상호(법인명)", "{{COMPANY_NAME}}", "사업자등록번호", "{{BIZ_NO}}"],
            ["대표자명", "{{CEO_NAME}}", "담당자 / 연락처", "{{CONTACT_NAME}} / {{CONTACT_PHONE}}"],
            ["본사 · 공장 주소", "{{COMPANY_ADDR}}", "보유 인증", "{{CERTIFICATIONS}}"],
            ["입금 계좌 정보", "{{BANK_ACCOUNT}}", "발주 · 공고기관", "{{ISSUING_AGENCY}}"],
        ],
        col_widths=[8000, 16000, 8500, 15500],
    )

    h2 = make_para("2. 연계 공고 및 계약 개요", char_pr="27", pid=20)
    tbl2 = make_table(
        201,
        [
            ["공고 · 문서번호", "{{NOTICE_NO}}", "총 합계금액(VAT포함)", "{{GRAND_TOTAL}}"],
            ["사업 · 건명", "{{PROJECT_NAME}}", "공급가액 / 부가세", "{{TOTAL_SUPPLY}} / {{VAT_AMOUNT}}"],
        ],
        col_widths=[8000, 16000, 9500, 14500],
    )

    h3 = make_para("3. 세부 견적 · 발주 · 납품 품목 명세", char_pr="27", pid=30)
    tbl3 = make_table(
        301,
        [
            ["No", "품명", "규격 및 사양", "단위", "수량", "단가(원)", "공급가액(원)"],
            ["1", "{{ITEM1_NAME}}", "{{ITEM1_SPEC}}", "{{ITEM1_UNIT}}", "{{ITEM1_QTY}}", "{{ITEM1_PRICE}}", "{{ITEM1_AMOUNT}}"],
            ["2", "{{ITEM2_NAME}}", "{{ITEM2_SPEC}}", "{{ITEM2_UNIT}}", "{{ITEM2_QTY}}", "{{ITEM2_PRICE}}", "{{ITEM2_AMOUNT}}"],
            ["3", "{{ITEM3_NAME}}", "{{ITEM3_SPEC}}", "{{ITEM3_UNIT}}", "{{ITEM3_QTY}}", "{{ITEM3_PRICE}}", "{{ITEM3_AMOUNT}}"],
            ["4", "{{ITEM4_NAME}}", "{{ITEM4_SPEC}}", "{{ITEM4_UNIT}}", "{{ITEM4_QTY}}", "{{ITEM4_PRICE}}", "{{ITEM4_AMOUNT}}"],
        ],
        col_widths=[2500, 11000, 14500, 3500, 4000, 6000, 6500],
        header_rows=1,
    )

    note_p = make_para("4. 변경 이력 및 특기사항: {{CHANGE_NOTE}}", char_pr="0", pid=40)
    footer_p = make_para("본 문서는 충남대 B팀 HWP·AI 행정자동화 파이프라인을 통해 기업 프로필 및 단일 원천(JSON)에서 자동 생성되었습니다.", char_pr="2", pid=41)

    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
        f"<hs:sec {NS_DECLS}>"
        + title_p
        + subtitle_p
        + h1
        + tbl1
        + h2
        + tbl2
        + h3
        + tbl3
        + note_p
        + footer_p
        + "</hs:sec>"
    )


def main() -> None:
    OUT_TEMPLATE.parent.mkdir(parents=True, exist_ok=True)
    OUT_DOCS_TEMPLATE.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(SEED_HWPX, "r") as zin:
        seed_sec = zin.read("Contents/section0.xml").decode("utf-8", "replace")
        new_sec_xml = build_section_xml(seed_sec).encode("utf-8")
        prv_text = (
            "표준 견적제출 및 납품확인서 ({{COMPANY_NAME}} / {{DOC_NO}} / {{GRAND_TOTAL}})"
        ).encode("utf-8")

        with zipfile.ZipFile(OUT_TEMPLATE, "w") as zout:
            # Store mimetype first with zero compression per OWPML / OCF standard
            if "mimetype" in zin.namelist():
                zout.writestr("mimetype", zin.read("mimetype"), compress_type=zipfile.ZIP_STORED)
            for info in zin.infolist():
                if info.filename == "mimetype":
                    continue
                if info.filename == "Contents/section0.xml":
                    zout.writestr(info.filename, new_sec_xml, compress_type=zipfile.ZIP_DEFLATED)
                elif info.filename == "Preview/PrvText.txt":
                    zout.writestr(info.filename, prv_text, compress_type=zipfile.ZIP_DEFLATED)
                else:
                    compress = (
                        zipfile.ZIP_STORED
                        if info.compress_type == zipfile.ZIP_STORED
                        else zipfile.ZIP_DEFLATED
                    )
                    zout.writestr(info.filename, zin.read(info.filename), compress_type=compress)

    shutil.copy2(OUT_TEMPLATE, OUT_DOCS_TEMPLATE)
    parsed = parse_hwp_any(OUT_TEMPLATE)
    print(
        f"BUILT_TEMPLATE: {OUT_TEMPLATE} | format={parsed['format_type']} | "
        f"tables={parsed['table_count']} | paras={parsed['paragraph_count']} | chars={parsed['char_count']}"
    )


if __name__ == "__main__":
    main()
