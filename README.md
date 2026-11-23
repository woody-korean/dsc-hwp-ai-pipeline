# 2026 DSC 공유대학 AI 실전 프로젝트 챌린지 — 과제 4 (충남대 B팀)

> **국방·공공 HWP / HWPX 파싱 × BAZE LLM 기반 대전 중소기업 반복 행정문서(4종 서식) 원클릭 자동화**

- **라이브 시연 페이지:** https://woody-korean.github.io/dsc-hwp-ai-pipeline/
- **팀원:** 충남대 B팀 (신수하, 우디)
- **타깃 페르소나:** 대전 대덕산단·대덕특구 배후 정밀제조·방산·연구기자재 B2B 중소기업 (`(주)대덕정밀기계`)

## 핵심 아키텍처

1. **Pure-Python / Browser-Native HWP & HWPX 파서 (`pipeline/hwp_parser.py`, `docs/hwp_browser_parser.js`)**
   - `.hwp` (HWP 5.0 Binary OLE2/CFB): FAT/MiniFAT 스트림 추출 → `zlib` 압축 해제 → `HWPTAG_PARA_TEXT (tag=67)` UTF-16LE 및 16바이트 제어문자 디코딩.
   - `.hwpx` (KS X 6101 OWPML ZIP+XML): `Contents/section*.xml` 문단(`hp:p`)·표(`hp:tbl`) 구조화 추출.
2. **BAZE API Gateway LLM 파이프라인 (`pipeline/baze_pipeline.py`)**
   - `gpt-6.1-terra` 모델로 방위사업청(DAPA) 실전 공고에서 공고번호·예산·일정·필수 제출서류·리스크 경고를 추출하고, **단일 원천(Single Source of Truth) JSON** 생성.
3. **4종 행정서식 자동생성 & 3-Way 교차검증 (`docs/`)**
   - **① 표준 견적서** ↔ **② 발주서·작업지시서** ↔ **③ 거래명세·납품검수조서** ↔ **④ 지출결의·내부 품의서**
   - GitHub Actions(`.github/workflows/hwp-pipeline.yml`)를 통해 파서 검증 및 GitHub Pages 자동 배포.

## 실전 샘플 데이터 (`samples/`)

| 파일명 | 포맷 | 출처 |
| :--- | :--- | :--- |
| `dapa_uav_bid.hwpx` | HWPX (OWPML XML) | 방위사업청 해안정찰용무인항공기 국내 구매사업 입찰공고 |
| `dapa_tactical_relay_bid.hwpx` | HWPX (OWPML XML) | 방위사업청 전술이동중계기 국내구매사업 입찰공고(재공고) |
| `dapa_sme_priority_items.hwpx` | HWPX (OWPML XML) | 방위사업청 2026-144호 중소기업자 우선선정 품목지정 공고 |
| `dapa_defense_innov_sme.hwp` | HWP 5.0 (OLE2 Binary) | 방위사업청 2026-124호 제5기 방산혁신기업 선정기업 공고 |
