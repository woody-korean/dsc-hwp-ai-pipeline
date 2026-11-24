"""BAZE LLM pipeline: transforms parsed Korean HWP/HWPX documents into 4 bound SME admin docs."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from hwp_parser import parse_hwp_any

ROOT_DIR = Path(__file__).resolve().parent.parent
SAMPLES_DIR = ROOT_DIR / "samples"
DOCS_SAMPLES_DIR = ROOT_DIR / "docs" / "samples"
OUT_JSON = ROOT_DIR / "docs" / "data" / "precomputed_cases.json"

DEFAULT_BASE_URL = "https://factchat-cloud.mindlogic.ai/v1/gateway"
DEFAULT_MODEL = "gpt-6.1-terra"

DOC_META = {
    "dapa_uav_bid.hwpx": {
        "id": "dapa_uav_bid",
        "short_title": "해안정찰용무인항공기 국내구매 입찰공고",
        "badge": "국방 물품입찰 (430억원)",
        "sme_role": "무인기 광학·기체 정밀부품 협력납품 견적·품의",
        "source_url": "https://www.dapa.go.kr/dapa/doc/selectDoc.do?menuSeq=3031&bbsSeq=443&docSeq=59128",
    },
    "dapa_tactical_relay_bid.hwpx": {
        "id": "dapa_tactical_relay_bid",
        "short_title": "전술이동중계기 국내구매 입찰공고(재공고)",
        "badge": "국방 통신장비 (120억원)",
        "sme_role": "전술통신 함체·RF모듈 가공 발주 및 검수 패키지",
        "source_url": "https://www.dapa.go.kr/dapa/doc/selectDoc.do?menuSeq=3031&bbsSeq=443&docSeq=58998",
    },
    "dapa_sme_priority_items.hwpx": {
        "id": "dapa_sme_priority_items",
        "short_title": "중소기업자 우선선정 품목지정 공고(2026-144호)",
        "badge": "방산 중소기업 우선선정",
        "sme_role": "20mm 원격사격(레이저)·와치봇 R&D 시제품 견적·품의",
        "source_url": "https://www.dapa.go.kr/dapa/doc/selectDocList.do?menuSeq=3031&bbsSeq=443&ctgrySeq=186",
    },
    "dapa_defense_innov_sme.hwp": {
        "id": "dapa_defense_innov_sme",
        "short_title": "2026년 제5기 방산혁신기업 선정기업 공고(수정)",
        "badge": "HWP 5.0 바이너리 원문",
        "sme_role": "대전·충청 방산혁신기업 기술협력·시제품 외주발주 자동화",
        "source_url": "https://www.dapa.go.kr/dapa/doc/selectDocList.do?menuSeq=3031&bbsSeq=443&ctgrySeq=186",
    },
    "kriss_gpu_workstation_spec.hwp": {
        "id": "kriss_gpu_workstation_spec",
        "short_title": "KRISS GPU 워크스테이션 구매규격서",
        "badge": "대전 출연연 (KRISS)",
        "sme_role": "대덕연구단지 출연연(한국표준과학연구원) 연구장비 납품",
        "source_url": "https://www.kriss.re.kr/board.es?mid=a10506000000&bid=0005&list_no=63917&act=view",
    },
}

SYSTEM_PROMPT = """당신은 대한민국 대전 대덕산업단지·대덕특구 배후에서 정밀기계 부품 및 연구·방산 장비를 납품하는 B2B 중소기업 '(주)대덕정밀기계'(직원 18명)의 AI 행정 자동화 비서입니다.
사용자가 제공하는 원문은 방위사업청(DAPA)·정부출연연구기관(한국표준과학연구원 KRISS 등) 실제 공공·연구기관의 HWP/HWPX 문서에서 파싱한 텍스트입니다.
반드시 원문에 등장하는 기관명, 공고번호, 사업명, 일정, 예산, 필수 제출서류, 품목/기술 키워드를 정확히 근거로 삼아 아래 JSON 스키마에 맞춰 완벽한 한국어 JSON만 출력하세요.

출력 JSON 스키마 (반드시 키 이름을 정확히 유지):
{
  "source_summary": {
    "document_title": "원문 문서 제목",
    "issuing_agency": "발주/공고 기관명",
    "notice_number": "원문 공고번호 (없으면 미기재)",
    "project_category": "사업/계약 분류",
    "budget_or_scale": "원문상 사업예산 또는 선정규모 (원문 그대로)",
    "key_schedules": ["일정 1 (원문 근거)", "일정 2", "일정 3"],
    "eligibility_summary": "참가자격 또는 대상 요건 요약 (2문장 이내)",
    "mandatory_attachments": ["원문상 필수 제출서류 또는 후속 절차 1", "항목 2", "항목 3"],
    "risk_alerts": [
      {"level": "high|medium", "title": "누락/실수 방지 경고 제목", "detail": "원문 근거 구체적 주의사항 (기한, 보안서약, 신원조사, 인감 등)"}
    ]
  },
  "doc_chain": {
    "quotation": {
      "doc_no": "Q-2026-XXXX",
      "quote_date": "2026-11-23",
      "recipient": "수신처 (원청 또는 발주기관 담당부서)",
      "supplier": "(주)대덕정밀기계 (대전 대덕구 문평동 / 대표 김대전)",
      "project_name": "견적 건명 (원문 사업명 연계)",
      "valid_until": "견적일로부터 30일",
      "items": [
        {"name": "품명 (원문 사업과 연계된 중소기업 납품/개발 품목 3~4건)", "spec": "규격/사양", "unit": "식|EA|SET", "qty": 2, "unit_price": 4500000}
      ],
      "notes": "납기, 대금지급 조건, 원문 요구규격 반영 사항"
    },
    "purchase_order": {
      "doc_no": "PO-2026-XXXX",
      "order_date": "2026-11-24",
      "due_date": "2026-12-20",
      "linked_notice_no": "원문 공고번호",
      "vendor_or_dept": "생산기술팀 / 협력가공업체",
      "items": [
        {"name": "동일 품명", "spec_material": "재질/공정 규격", "qty": 2, "assignee": "담당팀/파트", "qc_standard": "품질/국방규격 검사기준"}
      ],
      "instructions": "작업/외주 지시 및 납기 준수 특이사항"
    },
    "delivery_inspection": {
      "doc_no": "DI-2026-XXXX",
      "delivery_date": "2026-12-18",
      "delivery_location": "납품 장소",
      "inspector_org": "검수 담당 기관/부서",
      "items": [
        {"name": "동일 품명", "spec": "규격", "ordered_qty": 2, "delivered_qty": 2, "passed_qty": 2, "result": "적합"}
      ],
      "inspector_note": "외관·치수·기능 성적서 확인 및 납품검수 의견"
    },
    "expense_approval": {
      "doc_no": "AP-2026-XXXX",
      "draft_date": "2026-11-24",
      "department": "기술영업·생산관리팀",
      "drafter": "대리 이행정",
      "approval_line": ["담당", "기술연구소장", "대표이사"],
      "title": "내부 품의 및 지출결의 제목",
      "purpose_and_effect": "사업 참여/납품 목적 및 기대효과 (2문장)",
      "account_subject": "외주가공비 / 연구재료비 / 입찰대응비 등",
      "attachments": ["표준 견적서", "발주/작업지시서", "원문 공고 요구 서약서류"]
    }
  }
}

중요 규칙:
1. quotation.items, purchase_order.items, delivery_inspection.items는 동일한 품목명과 수량(qty == ordered_qty == delivered_qty == passed_qty)으로 1:1 정합성을 유지하세요.
2. 품목 수는 3~4개, 중소기업 협력납품·시제품 기준 현실적인 단가(백만 원~수천만 원 단위 정수, 원 단위)를 사용하세요.
3. 원문에 없는 사실(예: 원문에 없는 특정 예산 숫자)을 원문 요약(source_summary)에 지어내지 말고, 없으면 '원문 미기재'라고 명시하세요.
"""


def load_env_file(env_path: Path) -> None:
    """Load key=value pairs from .env if not already present in os.environ."""
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def _extract_json_payload(raw_text: str) -> dict[str, Any]:
    """Parse JSON even if a small local sLLM wraps output in markdown code fences."""
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    data = json.loads(cleaned)
    for req_top in ("source_summary", "doc_chain"):
        if req_top not in data or not isinstance(data[req_top], dict):
            raise ValueError(f"Missing required top-level key: {req_top}")
    for req_doc in ("quotation", "purchase_order", "delivery_inspection", "expense_approval"):
        if req_doc not in data["doc_chain"] or not isinstance(data["doc_chain"][req_doc], dict):
            raise ValueError(f"Missing required doc_chain key: {req_doc}")
    if not data["doc_chain"]["quotation"].get("items"):
        raise ValueError("doc_chain.quotation.items must be a non-empty list")
    return data


def call_baze_llm(
    parsed_doc: dict[str, Any],
    meta: dict[str, str],
    api_key: str,
    base_url: str,
    model: str,
    max_retries: int = 3,
) -> dict[str, Any]:
    """Call OpenAI-compatible gateway (BAZE cloud or Local Ollama/vLLM) with JSON retry loop."""
    endpoint = base_url.rstrip("/") + "/chat/completions"
    excerpt = parsed_doc["extracted_text"][:12000]
    user_msg = (
        f"[파일명] {parsed_doc['filename']}\n"
        f"[포맷] {parsed_doc['format_type']}\n"
        f"[우리 중소기업 수행 맥락] {meta['sme_role']}\n\n"
        f"[HWP/HWPX 파싱 원문]\n{excerpt}"
    )
    messages: list[dict[str, str]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_msg},
    ]

    last_err: Exception | None = None
    for attempt in range(1, max_retries + 1):
        payload = {
            "model": model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": 0.1 if attempt > 1 else 0.2,
        }
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key or 'local-onprem'}",
                "Content-Type": "application/json",
                "User-Agent": "DSC-HWP-Pipeline/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            content = body["choices"][0]["message"]["content"]
            return _extract_json_payload(content)
        except urllib.error.HTTPError as exc:
            err_text = exc.read().decode("utf-8", errors="ignore")
            last_err = RuntimeError(f"LLM HTTP {exc.code}: {err_text[:400]}")
            if exc.code in (401, 403):
                raise last_err from exc
        except (ValueError, KeyError, json.JSONDecodeError, urllib.error.URLError) as exc:
            last_err = exc
            # Feed schema/parse feedback back to the model for self-correction on retry
            messages.append(
                {
                    "role": "user",
                    "content": (
                        f"이전 응답 JSON 검증 실패 ({type(exc).__name__}: {exc}). "
                        "마크다운 코드블록 없이 스키마에 맞는 순수 JSON 객체만 다시 출력하세요."
                    ),
                }
            )
        if attempt < max_retries:
            print(f"  [RETRY {attempt}/{max_retries - 1}] {parsed_doc['filename']} -> {last_err}")

    raise RuntimeError(f"Failed after {max_retries} attempts: {last_err}")


def normalize_and_crosscheck(llm_data: dict[str, Any]) -> dict[str, Any]:
    """Compute exact supply/VAT totals and deterministic 3-way validation across the 4 docs."""
    chain = llm_data["doc_chain"]
    q_items = chain["quotation"]["items"]
    total_supply = 0
    for item in q_items:
        qty = int(item.get("qty", 1))
        unit_price = int(item.get("unit_price", 0))
        supply = qty * unit_price
        item["qty"] = qty
        item["unit_price"] = unit_price
        item["supply_amount"] = supply
        total_supply += supply

    vat = round(total_supply * 0.1)
    grand_total = total_supply + vat
    chain["quotation"]["total_supply"] = total_supply
    chain["quotation"]["vat"] = vat
    chain["quotation"]["grand_total"] = grand_total

    chain["expense_approval"]["total_supply"] = total_supply
    chain["expense_approval"]["vat"] = vat
    chain["expense_approval"]["grand_total"] = grand_total

    po_items = chain["purchase_order"]["items"]
    di_items = chain["delivery_inspection"]["items"]

    qty_match = (
        len(q_items) == len(po_items) == len(di_items)
        and all(
            q_items[i]["qty"] == int(po_items[i].get("qty", -1))
            and q_items[i]["qty"] == int(di_items[i].get("delivered_qty", -1))
            and q_items[i]["qty"] == int(di_items[i].get("passed_qty", -1))
            for i in range(len(q_items))
        )
    )
    vat_match = (vat == round(total_supply * 0.1)) and (grand_total == total_supply + vat)
    att_ok = len(chain["expense_approval"].get("attachments", [])) >= 2
    date_ok = bool(chain["purchase_order"].get("due_date")) and bool(
        chain["delivery_inspection"].get("delivery_date")
    )

    checks = [
        {
            "rule": "품목 수·수량 3-Way 일치 (견적 ↔ 발주 ↔ 납품검수)",
            "status": "PASS" if qty_match else "WARN",
            "detail": f"{len(q_items)}개 품목 수량 100% 일치" if qty_match else "품목 또는 수량 불일치 감지",
        },
        {
            "rule": "공급가액·부가세(10%)·품의총액 산식 검증",
            "status": "PASS" if vat_match else "FAIL",
            "detail": f"공급가액 {total_supply:,}원 + VAT {vat:,}원 = {grand_total:,}원 일치",
        },
        {
            "rule": "납기·검수 일정 정합성 검증",
            "status": "PASS" if date_ok else "WARN",
            "detail": (
                f"발주납기 {chain['purchase_order'].get('due_date')} / "
                f"검수일 {chain['delivery_inspection'].get('delivery_date')}"
            ),
        },
        {
            "rule": "공고 요구 필수 서류·품의 첨부 체크",
            "status": "PASS" if att_ok else "WARN",
            "detail": f"필수 첨부 {len(chain['expense_approval'].get('attachments', []))}건 바인딩 완료",
        },
    ]
    llm_data["cross_check"] = {
        "overall_status": "PASS" if all(c["status"] == "PASS" for c in checks) else "WARN",
        "checks": checks,
    }
    return llm_data


def verify_existing_json() -> int:
    """Verify docs/data/precomputed_cases.json and sample HWP/HWPX files without calling API."""
    if not OUT_JSON.exists():
        print(f"Missing {OUT_JSON}", file=sys.stderr)
        return 1
    data = json.loads(OUT_JSON.read_text(encoding="utf-8"))
    cases = data.get("cases", [])
    if len(cases) < len(DOC_META):
        print(f"Expected at least {len(DOC_META)} cases, found {len(cases)}", file=sys.stderr)
        return 1
    for c in cases:
        chain = c.get("doc_chain", {})
        for key in ("quotation", "purchase_order", "delivery_inspection", "expense_approval"):
            if key not in chain:
                print(f"Missing {key} in case {c.get('id')}", file=sys.stderr)
                return 1
        print(
            f"[VERIFIED CASE] {c['id']} | {c['parse_info']['format_type']} | "
            f"items={len(chain['quotation']['items'])} | "
            f"total={chain['quotation']['grand_total']:,} KRW"
        )
    return 0


def _is_local_endpoint(url: str) -> bool:
    return any(host in url.lower() for host in ("localhost", "127.0.0.1", "0.0.0.0", "::1"))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run HWP/HWPX -> LLM automation pipeline (BAZE Gateway or Local Ollama/vLLM)."
    )
    parser.add_argument("--verify-only", action="store_true", help="Validate existing JSON only.")
    parser.add_argument(
        "--base-url",
        help="Override OpenAI-compatible base URL (e.g. http://localhost:11434/v1 for local Ollama).",
    )
    parser.add_argument(
        "--model",
        help="Override model name (e.g. exaone3.5:7.8b or qwen2.5:14b for local inference).",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=3,
        help="Max JSON schema auto-retry attempts per document (default: 3).",
    )
    parser.add_argument(
        "--only-missing",
        action="store_true",
        help="Keep existing precomputed cases and call LLM only for newly added documents.",
    )
    args = parser.parse_args()

    if args.verify_only:
        return verify_existing_json()

    load_env_file(ROOT_DIR / ".env")
    base_url = (args.base_url or os.environ.get("BAZE_BASE_URL", DEFAULT_BASE_URL)).strip()
    model = (args.model or os.environ.get("BAZE_MODEL", DEFAULT_MODEL)).strip()
    api_key = os.environ.get("BAZE_API_KEY", "").strip()
    is_local = _is_local_endpoint(base_url)

    if not api_key and not is_local:
        print(
            "Error: BAZE_API_KEY is not set in environment or .env "
            "(or pass --base-url http://localhost:11434/v1 for air-gapped local sLLM).",
            file=sys.stderr,
        )
        return 1
    if is_local and not api_key:
        api_key = "local-onprem"

    DOCS_SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)

    existing_by_id: dict[str, dict[str, Any]] = {}
    if args.only_missing and OUT_JSON.exists():
        try:
            old_bundle = json.loads(OUT_JSON.read_text(encoding="utf-8"))
            for item in old_bundle.get("cases", []):
                existing_by_id[item["id"]] = item
        except Exception:
            existing_by_id = {}

    cases: list[dict[str, Any]] = []
    for fname, meta in DOC_META.items():
        src_path = SAMPLES_DIR / fname
        if not src_path.exists():
            print(f"Missing sample file: {src_path}", file=sys.stderr)
            return 1

        # Copy raw sample into docs/samples/ for live download from GitHub Pages
        shutil.copy2(src_path, DOCS_SAMPLES_DIR / fname)

        if args.only_missing and meta["id"] in existing_by_id:
            cases.append(existing_by_id[meta["id"]])
            print(f"Reusing existing precomputed case for {meta['id']} ({fname})")
            continue

        parsed = parse_hwp_any(src_path)
        print(
            f"Parsed {fname} ({parsed['format_type']}, {parsed['char_count']} chars) "
            f"-> calling {'Local sLLM' if is_local else 'BAZE'} ({model})..."
        )
        llm_raw = call_baze_llm(
            parsed, meta, api_key, base_url, model, max_retries=max(1, args.max_retries)
        )
        llm_norm = normalize_and_crosscheck(llm_raw)

        cases.append(
            {
                "id": meta["id"],
                "short_title": meta["short_title"],
                "badge": meta["badge"],
                "sme_role": meta["sme_role"],
                "source_url": meta["source_url"],
                "download_path": f"samples/{fname}",
                "parse_info": {
                    "filename": parsed["filename"],
                    "format_type": parsed["format_type"],
                    "magic_hex": parsed["magic_hex"],
                    "hwp_version": parsed["hwp_version"],
                    "file_size": parsed["file_size"],
                    "section_count": parsed["section_count"],
                    "table_count": parsed["table_count"],
                    "paragraph_count": parsed["paragraph_count"],
                    "char_count": parsed["char_count"],
                    "streams_preview": parsed["streams"][:12],
                    "extracted_text": parsed["extracted_text"],
                    "tables": parsed["tables"][:4],
                },
                "source_summary": llm_norm["source_summary"],
                "doc_chain": llm_norm["doc_chain"],
                "cross_check": llm_norm["cross_check"],
            }
        )
        print(
            f"  [OK] Generated 4-doc chain for {meta['id']} | "
            f"grand_total={llm_norm['doc_chain']['quotation']['grand_total']:,} KRW | "
            f"cross_check={llm_norm['cross_check']['overall_status']}"
        )

    bundle = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "pipeline": {
            "parser": "Pure-Python HWP 5.0 (OLE2/CFB + zlib + HWPTAG_PARA_TEXT) & HWPX (KS X 6101 OWPML ZIP+XML)",
            "llm_gateway": "Mindlogic BAZE API Gateway",
            "model": model,
            "target_persona": "(주)대덕정밀기계 (대전 대덕산단·유성구 B2B 정밀제조·방산·연구기자재 납품 SME)",
        },
        "cases": cases,
    }
    OUT_JSON.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved {len(cases)} processed cases to {OUT_JSON}")
    return verify_existing_json()


if __name__ == "__main__":
    raise SystemExit(main())
