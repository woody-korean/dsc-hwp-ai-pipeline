# 공고에서 검수까지 — 대전 납품 중소기업을 위한 한글 문서 자동화

**2026 DSC 공유대학 AI 실전 프로젝트 챌린지 · 과제 4 (중소기업 반복 행정업무 개선) · 충남대학교 B팀 (신수하 · 김우형)**

**대상 수상작입니다.**

공공·국방 공고는 HWP·HWPX 파일로 내려옵니다. 납품업체 담당자는 그 안의 품목·수량·납기·제출 요건을 읽어 견적서, 발주서, 납품검수조서, 지출결의서에 다시 옮겨 적습니다. 이 프로젝트는 공고 원문을 읽어 거래 기록 하나로 정리하고, 그 기록에서 서로 연결된 서식 4종을 만들어 줍니다. 조건이 바뀌면 영향을 받는 서류만 개정합니다.

- **라이브 데모:** https://woody-korean.github.io/dsc-hwp-ai-pipeline/
  - [`index.html`](https://woody-korean.github.io/dsc-hwp-ai-pipeline/): 전체 워크벤치
  - [`easy.html`](https://woody-korean.github.io/dsc-hwp-ai-pipeline/easy.html): 용어를 줄인 간편 시연 화면
- **발표 자료 (PDF, 10쪽):** [공고에서_검수까지_충남대B팀.pdf](https://woody-korean.github.io/dsc-hwp-ai-pipeline/공고에서_검수까지_충남대B팀.pdf)
- **가상 고객:** 대전 대덕특구 주변의 정밀제조·연구기자재 납품 중소기업 `(주)대덕정밀기계`

## 동작 방식

1. **원문 읽기.** 파서가 HWP·HWPX의 본문을 읽고, HWPX는 표의 행과 열까지 추출합니다. 한컴 SDK 없이 동작합니다.
2. **거래조건 추출.** LLM이 공고번호·예산·일정·제출서류·주의사항·품목을 뽑아 JSON 하나(단일 원천)에 담습니다.
3. **서식 4종 생성과 대조.** 그 JSON으로 아래 서식을 채우고, 수량과 금액을 세 방향으로 대조합니다.
   - ① 견적서 → ② 발주서·작업지시서 → ③ 거래명세서·납품검수조서 → ④ 지출결의서·품의서
4. **변경 요청 처리.** 책임자 교체 같은 변경이 들어오면 영향받는 서류만 개정(Rev.2)하고 나머지는 그대로 둡니다.
5. **기관 제출 서식 채우기.** 기관이 준 `.hwpx` 빈 양식을 표 구조로 분석해 채웁니다.

## 구성

| 경로 | 내용 |
| :--- | :--- |
| `pipeline/hwp_parser.py` | 파이썬 파서. HWP 5.0(OLE2/CFB → zlib → 문단 레코드)과 HWPX(ZIP + `section*.xml`)를 읽습니다. 표준 라이브러리만 씁니다. |
| `docs/hwp_browser_parser.js` | 같은 파서의 브라우저판. 파일을 브라우저 안에서 파싱합니다. |
| `pipeline/baze_pipeline.py` | 파싱 결과를 LLM에 보내 `docs/data/precomputed_cases.json`을 만듭니다. |
| `pipeline/build_hwpx_template.py` | 견적서·기관 서식 `.hwpx` 템플릿을 만듭니다. |
| `docs/` | 빌드 과정이 없는 정적 사이트. GitHub Pages로 배포됩니다. |
| `samples/` | 실제 공개 공고 5건 |
| `templates/` | 기관 제출용 `.hwpx` 서식 |

두 파서는 같은 동작을 해야 합니다. 한쪽의 파싱 동작을 바꾸면 다른 쪽도 함께 바꿉니다.

## 실행

```bash
python3 pipeline/hwp_parser.py --verify              # samples/ 의 모든 파일을 파싱 (실패 시 0이 아닌 종료 코드)
python3 pipeline/baze_pipeline.py --verify-only      # precomputed_cases.json 검증 (API 호출 없음)
python3 -m http.server -d docs 8000                  # 사이트를 로컬에서 보기
```

LLM 추출을 다시 돌릴 때만 키가 필요합니다. `BAZE_API_KEY`, `BAZE_BASE_URL`, `BAZE_MODEL`을 환경 변수나 `.env`(커밋하지 않음)에 둡니다.

```bash
python3 pipeline/baze_pipeline.py                    # 전체 재추출
python3 pipeline/baze_pipeline.py --only-missing     # 새로 넣은 샘플만 추출
python3 pipeline/baze_pipeline.py --base-url http://localhost:11434/v1 --model <모델>   # 사내망의 로컬 모델(OpenAI 호환)
```

`main`에 푸시하면 GitHub Actions가 위 두 검증을 돌리고 `docs/`를 배포합니다.

## 검증한 범위

**거래 서식 생성까지 확인한 공고 5건** (`samples/`)

| 파일 | 형식 | 문서 | 추출 문단 |
| :--- | :--- | :--- | ---: |
| `dapa_uav_bid.hwpx` | HWPX | [방위사업청 해안정찰용 무인항공기 구매 공고](https://www.dapa.go.kr/dapa/doc/selectDoc.do?menuSeq=3031&bbsSeq=443&docSeq=59128) | 303 |
| `dapa_tactical_relay_bid.hwpx` | HWPX | [방위사업청 전술이동중계기 구매 재공고](https://www.dapa.go.kr/dapa/doc/selectDoc.do?menuSeq=3031&bbsSeq=443&docSeq=58998) | 166 |
| `dapa_sme_priority_items.hwpx` | HWPX | [방위사업청 중소기업자 우선선정 품목지정 공고](https://www.dapa.go.kr/dapa/doc/selectDocList.do?menuSeq=3031&bbsSeq=443&ctgrySeq=186) | 10 |
| `dapa_defense_innov_sme.hwp` | HWP 5.0 | [방위사업청 방산혁신기업 선정기업 수정 공고](https://www.dapa.go.kr/dapa/doc/selectDocList.do?menuSeq=3031&bbsSeq=443&ctgrySeq=186) | 54 |
| `kriss_gpu_workstation_spec.hwp` | HWP 5.0 | [한국표준과학연구원 GPU 워크스테이션 구매규격서](https://www.kriss.re.kr/board.es?mid=a10506000000&bid=0005&list_no=63917&act=view) | 39 |

**파서만 돌린 공개 한글 파일 313건**

방위사업청 공지사항과 한국표준과학연구원 입찰공고 게시판의 HWP·HWPX 첨부를 고르지 않고 게시 순서대로 받아 파서를 돌렸습니다.

| 항목 | 값 |
| :--- | :--- |
| 본문 추출 | 313건 중 313건 |
| 형식 | HWPX 213건, HWP 100건 |
| 출처 | 방위사업청 252건, 한국표준과학연구원 61건 |
| HWPX 글자 수 대조 | 213건 모두 원본 XML과 추출 결과의 글자 수가 같음 |
| 본문 기준 서로 다른 문서 | 296건 |

이 숫자는 본문을 읽었다는 뜻이며, 정확도나 시간 절감을 입증하지 않습니다. LLM 추출과 서식 생성은 위 5건에서만 확인했습니다. 수집 스크립트와 파일별 목록은 아직 이 저장소에 올리지 않았습니다.

## 한계

- 구형 HWP는 본문은 읽지만, 표의 셀 위치는 복원하지 못합니다.
- 구형 HWP 100건 중 3건에서 한컴 전용 특수기호 14자가 깨져 나옵니다.
- 313건은 두 기관의 문서입니다. 다른 기관의 서식으로 일반화하지 않습니다.
- 시연의 품목·단가는 예시 값이고, 등장 인물은 가상 인물입니다.
- 작업시간 단축 효과는 아직 현장에서 재지 않았습니다. 발표 자료의 수치는 목표와 문헌 기반 추정치입니다.

## 팀

충남대학교 B팀: 신수하, 김우형
