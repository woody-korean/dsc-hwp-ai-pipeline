(function () {
  const BAZE_ENDPOINT = "https://factchat-cloud.mindlogic.ai/v1/gateway/chat/completions";
  const BAZE_MODEL = "gpt-6.1-terra";
  const PROFILE_STORAGE_KEY = "dsc_team_b_company_profile_v1";

  const DEFAULT_PROFILE = {
    name: "(주)대덕정밀기계",
    biz_no: "314-81-59204",
    ceo: "김대전",
    contact: "이행정 대리",
    addr: "대전 대덕구 문평서로 18번길 (대덕산업단지)",
    phone: "042-930-4100 / sales@dd-precision.kr",
    certs: "벤처기업 · 이노비즈 · 직접생산확인",
    bank: "기업은행 314-092811-01-012",
  };

  let cases = [];
  let activeCase = null;
  let baselineCase = null;
  let pendingProposal = null;
  let activeDocTab = "quotation";
  let simulateMismatch = false;
  let companyProfile = { ...DEFAULT_PROFILE };

  const el = (id) => document.getElementById(id);

  function loadProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null");
      if (saved && typeof saved === "object") {
        companyProfile = { ...DEFAULT_PROFILE, ...saved };
      }
    } catch (_) {
      companyProfile = { ...DEFAULT_PROFILE };
    }
    syncProfileInputs();
  }

  function saveProfile() {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(companyProfile));
    } catch (_) {
      // Ignore storage errors in strict browser privacy modes
    }
  }

  function syncProfileInputs() {
    const map = {
      profName: "name",
      profBizNo: "biz_no",
      profCeo: "ceo",
      profContact: "contact",
      profAddr: "addr",
      profPhone: "phone",
      profCerts: "certs",
      profBank: "bank",
    };
    Object.entries(map).forEach(([id, key]) => {
      const node = el(id);
      if (node) node.value = companyProfile[key] || "";
    });
    const prev = el("profileSummaryPreview");
    if (prev) {
      prev.textContent = `${companyProfile.name} · ${companyProfile.biz_no} · 대표 ${companyProfile.ceo} · 클릭해 편집`;
    }
  }

  function readProfileInputs() {
    companyProfile = {
      name: (el("profName")?.value || "").trim() || DEFAULT_PROFILE.name,
      biz_no: (el("profBizNo")?.value || "").trim() || DEFAULT_PROFILE.biz_no,
      ceo: (el("profCeo")?.value || "").trim() || DEFAULT_PROFILE.ceo,
      contact: (el("profContact")?.value || "").trim() || DEFAULT_PROFILE.contact,
      addr: (el("profAddr")?.value || "").trim() || DEFAULT_PROFILE.addr,
      phone: (el("profPhone")?.value || "").trim() || DEFAULT_PROFILE.phone,
      certs: (el("profCerts")?.value || "").trim() || DEFAULT_PROFILE.certs,
      bank: (el("profBank")?.value || "").trim() || DEFAULT_PROFILE.bank,
    };
    const prev = el("profileSummaryPreview");
    if (prev) {
      prev.textContent = `${companyProfile.name} · ${companyProfile.biz_no} · 대표 ${companyProfile.ceo} · 클릭해 편집`;
    }
    saveProfile();
  }

  function applyProfileToCase(c) {
    if (!c || !c.doc_chain) return;
    const q = c.doc_chain.quotation;
    const ap = c.doc_chain.expense_approval;
    if (q) {
      q.supplier = `${companyProfile.name} (사업자 ${companyProfile.biz_no} / 대표 ${companyProfile.ceo} / ${companyProfile.addr})`;
    }
    if (ap) {
      ap.drafter = companyProfile.contact;
    }
  }

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function won(n) {
    return Number(n || 0).toLocaleString("ko-KR") + "원";
  }

  function num(n) {
    return Number(n || 0).toLocaleString("ko-KR");
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function recalcCaseTotals(c) {
    applyProfileToCase(c);
    const q = c.doc_chain.quotation;
    const po = c.doc_chain.purchase_order;
    const di = c.doc_chain.delivery_inspection;
    const ap = c.doc_chain.expense_approval;
    const shortage = Math.max(0, parseInt(c.shortage_qty || 0, 10) || 0);

    let totalSupply = 0;
    q.items.forEach((it, idx) => {
      it.qty = Math.max(1, parseInt(it.qty, 10) || 1);
      it.unit_price = Math.max(0, parseInt(it.unit_price, 10) || 0);
      it.supply_amount = it.qty * it.unit_price;
      totalSupply += it.supply_amount;

      if (po.items[idx]) po.items[idx].qty = it.qty;
      if (di.items[idx]) {
        di.items[idx].ordered_qty = it.qty;
        let deliv = it.qty;
        if (idx === 0) {
          if (shortage > 0) deliv = Math.max(0, it.qty - shortage);
          if (simulateMismatch) deliv = Math.max(0, deliv - 1);
        }
        di.items[idx].delivered_qty = deliv;
        di.items[idx].passed_qty = deliv;
        di.items[idx].result =
          di.items[idx].delivered_qty === di.items[idx].ordered_qty ? "적합" : "수량불일치(보류)";
      }
    });

    q.total_supply = totalSupply;
    q.vat = Math.round(totalSupply * 0.1);
    q.grand_total = totalSupply + q.vat;

    ap.total_supply = totalSupply;
    ap.vat = q.vat;
    ap.grand_total = simulateMismatch ? q.grand_total + 550000 : q.grand_total;

    const qtyMatch = q.items.every(
      (it, i) =>
        po.items[i] &&
        di.items[i] &&
        it.qty === po.items[i].qty &&
        it.qty === di.items[i].delivered_qty
    );
    const totalMatch = ap.grand_total === q.grand_total;
    const dateOk = Boolean(po.due_date && di.delivery_date);
    const attOk = (ap.attachments || []).length >= 2;

    c.cross_check = {
      overall_status: qtyMatch && totalMatch && dateOk && attOk ? "PASS" : "FAIL",
      checks: [
        {
          rule: "품목 수·수량 3-Way 일치 (견적 ↔ 발주 ↔ 납품검수)",
          status: qtyMatch ? "PASS" : "FAIL",
          detail: qtyMatch
            ? `${q.items.length}개 품목 수량 100% 일치`
            : `1번 품목 발주(${q.items[0].qty}) ≠ 실납품(${di.items[0].delivered_qty}) 불일치 탐지!`,
        },
        {
          rule: "공급가액·부가세(10%)·품의총액 산식 검증",
          status: totalMatch ? "PASS" : "FAIL",
          detail: totalMatch
            ? `공급가액 ${num(totalSupply)}원 + VAT ${num(q.vat)}원 = ${num(q.grand_total)}원 일치`
            : `견적총액(${num(q.grand_total)}원) ≠ 품의총액(${num(ap.grand_total)}원) 차이 550,000원 경고!`,
        },
        {
          rule: "납기·검수 일정 정합성 검증",
          status: dateOk ? "PASS" : "WARN",
          detail: `발주납기 ${po.due_date || "-"} / 검수일 ${di.delivery_date || "-"}`,
        },
        {
          rule: "공고 요구 필수 서류·품의 첨부 체크",
          status: attOk ? "PASS" : "WARN",
          detail: `필수 첨부 ${(ap.attachments || []).length}건 바인딩 완료`,
        },
      ],
    };
  }

  function resetChangeRequestPanel() {
    pendingProposal = null;
    if (el("applyChangeBtn")) el("applyChangeBtn").disabled = true;
    if (el("copyReplyBtn")) el("copyReplyBtn").disabled = true;
    if (el("revertRevBtn")) el("revertRevBtn").disabled = !(activeCase && (activeCase.revision || 1) > 1);
    if (el("changeStatusLine")) el("changeStatusLine").textContent = "";
    if (el("changeDiffBox")) {
      el("changeDiffBox").innerHTML = `
        <div class="text-block" style="color: var(--muted);">
          위 시나리오 버튼을 누르거나 거래처 변경 메일 내용을 입력한 뒤 <strong>[변경요청 분석 및 Diff 비교]</strong>를 실행하면, 수량·단가·부가세·총액·납기 변화량이 즉시 계산됩니다.
        </div>`;
    }
    if (el("replyDraftBox")) {
      el("replyDraftBox").textContent =
        "변경요청 분석 후 거래처에 바로 발송할 수 있는 공식 회신 문구(변경 내역·조정 금액·납기 확인·서명 포함)가 자동 생성됩니다.";
    }
  }

  function selectCaseClean(c) {
    simulateMismatch = false;
    el("toggleMismatchBtn").classList.remove("btn-accent");
    activeCase = deepClone(c);
    activeCase.revision = 1;
    activeCase.shortage_qty = 0;
    activeCase.last_change_summary = "";
    recalcCaseTotals(activeCase);
    baselineCase = deepClone(activeCase);
    resetChangeRequestPanel();
    renderAll();
  }

  function renderCorpusCards() {
    const grid = el("corpusGrid");
    grid.innerHTML = "";
    cases.forEach((c) => {
      const isHwp = c.parse_info.format_type.includes("5.0");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `corpus-card ${activeCase && activeCase.id === c.id ? "active" : ""}`;
      btn.innerHTML = `
        <div class="meta-top">
          <span class="tag-mono">${isHwp ? "HWP 5.0" : "HWPX"}</span>
          <span class="tag-muted">${esc(c.badge)}</span>
        </div>
        <h3>${esc(c.short_title)}</h3>
        <p>${esc(c.sme_role)}</p>
        <div class="corpus-stats">
          문단 ${c.parse_info.paragraph_count} · 표 ${c.parse_info.table_count} · ${(c.parse_info.file_size / 1024).toFixed(1)} KB
        </div>
      `;
      btn.addEventListener("click", () => selectCaseClean(c));
      grid.appendChild(btn);
    });
  }

  function renderStep1(c) {
    const p = c.parse_info;
    const actions = el("step1Actions");
    actions.innerHTML = "";
    if (c.download_path) {
      const dl = document.createElement("a");
      dl.href = c.download_path;
      dl.download = p.filename;
      dl.className = "btn btn-sm";
      dl.textContent = `원본 파일 받기 (${p.filename})`;
      actions.appendChild(dl);
    }
    if (c.source_url) {
      const src = document.createElement("a");
      src.href = c.source_url;
      src.target = "_blank";
      src.rel = "noopener";
      src.className = "btn btn-sm";
      src.textContent = "발주기관 원문 페이지";
      actions.appendChild(src);
    }

    el("parseKvGrid").innerHTML = `
      <table class="meta-table">
        <tbody>
          <tr>
            <th>파일명</th><td>${esc(p.filename)}</td>
            <th>포맷 엔진</th><td>${esc(p.format_type)}</td>
            <th>매직 바이트</th><td class="mono">0x${esc(p.magic_hex)}</td>
          </tr>
          <tr>
            <th>내부 버전</th><td class="mono">${esc(p.hwp_version || "-")}</td>
            <th>구조 추출</th><td>${p.paragraph_count}문단 / ${p.table_count}표</td>
            <th>추출 문자 수</th><td class="num-inline">${num(p.char_count)}자</td>
          </tr>
        </tbody>
      </table>`;

    el("rawExtractedBox").textContent = p.extracted_text || "(추출 텍스트 없음)";
  }

  function renderStep2(c) {
    const s = c.source_summary;
    el("llmMetaBadge").textContent = c.is_live_upload
      ? c.used_live_llm
        ? "브라우저 실시간 BAZE LLM 변환"
        : "브라우저 HWP 파서 + 규칙 기반 구조화"
      : "BAZE API Gateway (gpt-6.1-terra) 추출 완료";

    el("summaryKvGrid").innerHTML = `
      <table class="meta-table">
        <tbody>
          <tr><th>발주 · 공고기관</th><td>${esc(s.issuing_agency)}</td></tr>
          <tr><th>공고 · 문서번호</th><td class="mono">${esc(s.notice_number)}</td></tr>
          <tr><th>사업 분류</th><td>${esc(s.project_category)}</td></tr>
          <tr><th>예산 · 선정규모</th><td><strong>${esc(s.budget_or_scale)}</strong></td></tr>
        </tbody>
      </table>`;

    el("eligibilityText").textContent = s.eligibility_summary || "";
    const listItems = [
      ...(s.key_schedules || []).map((x) => `<li><span class="list-key">일정</span> ${esc(x)}</li>`),
      ...(s.mandatory_attachments || []).map((x) => `<li><span class="list-key">필수</span> ${esc(x)}</li>`),
    ];
    el("scheduleAttachList").innerHTML = listItems.join("");

    el("riskAlertsBox").innerHTML = (s.risk_alerts || [])
      .map(
        (a) => `
        <div class="alert-item ${a.level === "high" ? "high" : ""}">
          <div class="alert-head">[${a.level === "high" ? "중요 경고" : "확인 권장"}] ${esc(a.title)}</div>
          <div class="alert-body">${esc(a.detail)}</div>
        </div>`
      )
      .join("");
  }

  function renderCrossCheck(c) {
    const labelMap = { PASS: "적합", WARN: "주의", FAIL: "불일치" };
    el("crossCheckGrid").innerHTML = `
      <table class="check-table">
        <thead>
          <tr>
            <th style="width: 34%;">3-Way 교차검증 규칙</th>
            <th style="width: 10%; text-align: center;">판정</th>
            <th>세부 검증 근거</th>
          </tr>
        </thead>
        <tbody>
          ${(c.cross_check.checks || [])
            .map((chk) => {
              const cls = chk.status === "FAIL" ? "fail" : chk.status === "WARN" ? "warn" : "pass";
              return `
                <tr class="${cls}">
                  <td><strong>${esc(chk.rule)}</strong></td>
                  <td class="center"><span class="status-tag ${cls}">${labelMap[chk.status] || esc(chk.status)}</span></td>
                  <td>${esc(chk.detail)}</td>
                </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;
  }

  function renderSheet(c) {
    const chain = c.doc_chain;
    const container = el("a4SheetContainer");

    const stampHtml = (lines) => `
      <table class="stamp-box">
        <tr>${lines.map((l) => `<th>${esc(l)}</th>`).join("")}</tr>
        <tr>${lines.map((_, i) => `<td>${i === 0 ? "기안" : "검토대기"}</td>`).join("")}</tr>
      </table>`;

    if (activeDocTab === "quotation") {
      const q = chain.quotation;
      container.innerHTML = `
        <div class="sheet-top">
          <div>
            <h2 class="sheet-title">표 준 견 적 서</h2>
            <div style="font-size: 12.5px; color: var(--muted); margin-top: 4px;">
              문서번호: <strong>${esc(q.doc_no)}</strong> | 견적일자: ${esc(q.quote_date)} | 유효기간: ${esc(q.valid_until)}
            </div>
          </div>
          ${stampHtml(["담당", "기술연구소장", "대표이사"])}
        </div>
        <table class="doc-table">
          <tr>
            <th style="width: 15%;">수신처</th><td style="width: 35%;">${esc(q.recipient)}</td>
            <th style="width: 15%;">공급자</th><td style="width: 35%;">${esc(q.supplier)}</td>
          </tr>
          <tr>
            <th>건 명</th><td colspan="3"><strong>${esc(q.project_name)}</strong></td>
          </tr>
          <tr class="total-highlight">
            <th>합계금액<br/>(VAT 포함)</th>
            <td colspan="3" style="font-size: 15px;">일금 ${num(q.grand_total)}원 정 (공급가액 ${num(q.total_supply)}원 + 부가세 ${num(q.vat)}원)</td>
          </tr>
        </table>
        <table class="doc-table">
          <thead>
            <tr>
              <th style="width: 6%;">No</th>
              <th>품 명</th>
              <th style="width: 24%;">규격 / 사양</th>
              <th style="width: 8%;">단위</th>
              <th style="width: 8%;">수량</th>
              <th style="width: 14%;">단가(원)</th>
              <th style="width: 16%;">공급가액(원)</th>
            </tr>
          </thead>
          <tbody>
            ${q.items
              .map(
                (it, idx) => `
              <tr>
                <td class="center">${idx + 1}</td>
                <td>${esc(it.name)}</td>
                <td>${esc(it.spec)}</td>
                <td class="center">${esc(it.unit)}</td>
                <td class="num">${num(it.qty)}</td>
                <td class="num">${num(it.unit_price)}</td>
                <td class="num"><strong>${num(it.supply_amount)}</strong></td>
              </tr>`
              )
              .join("")}
            <tr>
              <th colspan="6">공급가액 계 / 부가가치세 (10%)</th>
              <td class="num">${num(q.total_supply)} / ${num(q.vat)}</td>
            </tr>
            <tr class="total-highlight">
              <th colspan="6">총 합계금액 (VAT 포함)</th>
              <td class="num">${won(q.grand_total)}</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size: 12.5px; margin-top: 10px;">
          <strong>특기사항:</strong> ${esc(q.notes)}
        </div>
      `;
    } else if (activeDocTab === "purchase_order") {
      const po = chain.purchase_order;
      container.innerHTML = `
        <div class="sheet-top">
          <div>
            <h2 class="sheet-title">발주서 · 작업지시서</h2>
            <div style="font-size: 12.5px; color: var(--muted); margin-top: 4px;">
              관리번호: <strong>${esc(po.doc_no)}</strong> | 지시일자: ${esc(po.order_date)} | 납기일: <strong>${esc(po.due_date)}</strong>
            </div>
          </div>
          ${stampHtml(["발행", "생산팀장", "공장장"])}
        </div>
        <table class="doc-table">
          <tr>
            <th style="width: 18%;">연계 공고번호</th><td style="width: 32%;">${esc(po.linked_notice_no)}</td>
            <th style="width: 18%;">수행부서·협력사</th><td style="width: 32%;">${esc(po.vendor_or_dept)}</td>
          </tr>
        </table>
        <table class="doc-table">
          <thead>
            <tr>
              <th style="width: 6%;">No</th>
              <th>품목 / 공정명</th>
              <th style="width: 24%;">재질 · 작업규격</th>
              <th style="width: 8%;">수량</th>
              <th style="width: 14%;">담당파트</th>
              <th style="width: 24%;">품질 · 국방규격 기준</th>
            </tr>
          </thead>
          <tbody>
            ${po.items
              .map(
                (it, idx) => `
              <tr>
                <td class="center">${idx + 1}</td>
                <td>${esc(it.name)}</td>
                <td>${esc(it.spec_material)}</td>
                <td class="num"><strong>${num(it.qty)}</strong></td>
                <td class="center">${esc(it.assignee)}</td>
                <td>${esc(it.qc_standard)}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
        <div style="font-size: 12.5px; margin-top: 10px;">
          <strong>작업 · 납기 지시사항:</strong> ${esc(po.instructions)}
        </div>
      `;
    } else if (activeDocTab === "delivery_inspection") {
      const di = chain.delivery_inspection;
      container.innerHTML = `
        <div class="sheet-top">
          <div>
            <h2 class="sheet-title">거래명세 · 납품검수조서</h2>
            <div style="font-size: 12.5px; color: var(--muted); margin-top: 4px;">
              검수번호: <strong>${esc(di.doc_no)}</strong> | 납품·검수일: ${esc(di.delivery_date)}
            </div>
          </div>
          ${stampHtml(["납품자", "검수자", "확인관"])}
        </div>
        <table class="doc-table">
          <tr>
            <th style="width: 18%;">납품장소</th><td style="width: 32%;">${esc(di.delivery_location)}</td>
            <th style="width: 18%;">검수기관·부서</th><td style="width: 32%;">${esc(di.inspector_org)}</td>
          </tr>
        </table>
        <table class="doc-table">
          <thead>
            <tr>
              <th style="width: 6%;">No</th>
              <th>납품 품명</th>
              <th style="width: 26%;">규격</th>
              <th style="width: 10%;">발주수량</th>
              <th style="width: 10%;">납품수량</th>
              <th style="width: 10%;">합격수량</th>
              <th style="width: 14%;">검수판정</th>
            </tr>
          </thead>
          <tbody>
            ${di.items
              .map(
                (it, idx) => `
              <tr class="${it.result !== "적합" ? "row-fail" : ""}">
                <td class="center">${idx + 1}</td>
                <td>${esc(it.name)}</td>
                <td>${esc(it.spec)}</td>
                <td class="num">${num(it.ordered_qty)}</td>
                <td class="num">${num(it.delivered_qty)}</td>
                <td class="num">${num(it.passed_qty)}</td>
                <td class="center">${esc(it.result)}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
        <div style="font-size: 12.5px; margin-top: 10px;">
          <strong>검수 확인 의견:</strong> ${esc(di.inspector_note)}
        </div>
      `;
    } else {
      const ap = chain.expense_approval;
      container.innerHTML = `
        <div class="sheet-top">
          <div>
            <h2 class="sheet-title">지출결의 · 내부 품의서</h2>
            <div style="font-size: 12.5px; color: var(--muted); margin-top: 4px;">
              품의번호: <strong>${esc(ap.doc_no)}</strong> | 기안일: ${esc(ap.draft_date)} | 기안부서: ${esc(ap.department)} (${esc(ap.drafter)})
            </div>
          </div>
          ${stampHtml(ap.approval_line || ["담당", "팀장", "대표이사"])}
        </div>
        <table class="doc-table">
          <tr>
            <th style="width: 18%;">품의 제목</th>
            <td colspan="3"><strong>${esc(ap.title)}</strong></td>
          </tr>
          <tr>
            <th>계정 과목</th><td>${esc(ap.account_subject)}</td>
            <th>공급가액 / 세액</th><td class="num">${won(ap.total_supply)} / ${won(ap.vat)}</td>
          </tr>
          <tr class="total-highlight">
            <th>품의 요청 총액</th>
            <td colspan="3" style="font-size: 15px;">${won(ap.grand_total)} (부가가치세 포함)</td>
          </tr>
          <tr>
            <th>사업 목적 및<br/>기대 효과</th>
            <td colspan="3" style="line-height: 1.65;">${esc(ap.purpose_and_effect)}</td>
          </tr>
          <tr>
            <th>자동 첨부 서류</th>
            <td colspan="3">${(ap.attachments || []).map((a, idx) => `${idx + 1}. ${esc(a)}`).join(" &nbsp;&nbsp;|&nbsp;&nbsp; ")}</td>
          </tr>
        </table>
      `;
    }
  }

  function renderAll() {
    if (!activeCase) return;
    renderCorpusCards();
    renderStep1(activeCase);
    renderStep2(activeCase);
    renderCrossCheck(activeCase);
    renderSheet(activeCase);

    const rev = activeCase.revision || 1;
    if (el("revisionBadge")) {
      el("revisionBadge").textContent =
        rev === 1
          ? "현재 문서 버전: Rev.1 (최초 기안)"
          : `현재 문서 버전: Rev.${rev} (${activeCase.last_change_summary || "변경 반영"})`;
    }
    if (el("revertRevBtn")) {
      el("revertRevBtn").disabled = rev <= 1;
    }

    const first = activeCase.doc_chain.quotation.items[0];
    if (first) {
      el("liveQtyInput").value = first.qty;
      el("livePriceInput").value = first.unit_price;
    }
  }

  async function tryCallLiveBaze(parsed, apiKey) {
    const prompt = `당신은 대전 방산·정밀제조·출연연 납품 중소기업 '${companyProfile.name}' 행정 AI 비서입니다.
아래 파싱된 HWP/HWPX 원문을 읽고, source_summary(document_title, issuing_agency, notice_number, project_category, budget_or_scale, key_schedules[], eligibility_summary, mandatory_attachments[], risk_alerts[{level,title,detail}])와 doc_chain(quotation, purchase_order, delivery_inspection, expense_approval) JSON만 반환하세요.`;

    const res = await fetch(BAZE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: BAZE_MODEL,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `[파일명] ${parsed.filename}\n\n${parsed.extracted_text.slice(0, 10000)}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
  }

  async function handleUploadedFile(file) {
    const status = el("uploadStatus");
    status.className = "status-line";
    status.textContent = `[파싱 중] "${file.name}" 바이너리·XML 구조 분석 중...`;
    try {
      const parsed = await window.HwpBrowserParser.parseHwpFile(file);
      let structured = null;
      let usedLiveLlm = false;
      const key = el("liveApiKey").value.trim();

      if (key) {
        status.textContent = `[LLM 호출] 파싱 완료(${num(parsed.char_count)}자). BAZE LLM(${BAZE_MODEL}) 구조화 중...`;
        try {
          structured = await tryCallLiveBaze(parsed, key);
          if (structured && structured.doc_chain && structured.doc_chain.quotation) {
            usedLiveLlm = true;
          }
        } catch (err) {
          console.warn("Live BAZE fallback triggered:", err);
        }
      }

      if (!structured || !structured.doc_chain) {
        structured = window.HwpBrowserParser.buildFallbackChainFromParsed(parsed);
      }

      selectCaseClean({
        id: "uploaded_live",
        short_title: file.name,
        badge: "실시간 업로드",
        sme_role: "사용자 업로드 HWP/HWPX 문서 기반 자동 변환",
        parse_info: parsed,
        source_summary: structured.source_summary,
        doc_chain: structured.doc_chain,
        is_live_upload: true,
        used_live_llm: usedLiveLlm,
      });
      status.className = "status-line pass";
      status.textContent = `[완료] 파싱 및 4종 서식 생성 완료 (${parsed.format_type}, ${parsed.paragraph_count}문단, ${parsed.table_count}표)`;
    } catch (err) {
      status.className = "status-line fail";
      status.textContent = `[오류] ${err.message}`;
    }
  }

  function renderSecuritySimulator() {
    const volume = Math.max(1, parseInt(el("simVolume").value, 10) || 40);
    const manualMin = Math.max(5, parseInt(el("simManualMin").value, 10) || 105);
    const rawRetry = parseFloat(el("simRetryPct").value);
    const retryRate = Math.min(0.6, Math.max(0, (Number.isFinite(rawRetry) ? rawRetry : 15) / 100));
    const reviewMin = Math.max(1, parseInt(el("simReviewMin").value, 10) || 4);
    const wage = Math.max(10000, parseInt(el("simWage").value, 10) || 35000);
    const hwTier = el("simHwTier").value;

    const capex = hwTier === "server" ? 9500000 : 3500000;
    const monthlyDepr = Math.round(capex / 36);
    const monthlyElec = hwTier === "server" ? 20000 : 7500;
    const monthlyHw = monthlyDepr + monthlyElec;

    const expectedRuns = 1 / Math.max(0.1, 1 - retryRate);
    const residualFailPct = Math.pow(retryRate, 3) * 100;
    const gpuSecPerDoc = Math.round(20 * expectedRuns);
    const extraRetryMinPerDoc = (20 * (expectedRuns - 1)) / 60;

    const manualHours = (volume * manualMin) / 60;
    const manualCost = Math.round(manualHours * wage);

    const unguardedHours = (volume * Math.max(20, manualMin * 0.35)) / 60;
    const unguardedCost = Math.round(unguardedHours * wage) + monthlyHw;

    const hybridHours = (volume * (reviewMin + extraRetryMinPerDoc)) / 60;
    const hybridLaborCost = Math.round(hybridHours * wage);
    const hybridTotalCost = hybridLaborCost + monthlyHw;

    const netSavings = manualCost - hybridTotalCost;
    const timeSavedPct = (((manualHours - hybridHours) / manualHours) * 100).toFixed(1);
    const paybackMonths = netSavings > 0 ? (capex / netSavings).toFixed(1) : "∞";

    el("simResultGrid").innerHTML = `
      <table class="kpi-table">
        <thead>
          <tr>
            <th>기대 추론 · 잔여 실패율</th>
            <th>기존 수작업 월 기회비용</th>
            <th>본 시스템 월 총비용</th>
            <th>월 순절감액 · 시간 단축</th>
            <th>하드웨어 회수 기간</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${expectedRuns.toFixed(2)}회/건 (잔여 ${residualFailPct.toFixed(2)}%)</td>
            <td>${manualHours.toFixed(1)}시간 / ${won(manualCost)}</td>
            <td>${hybridHours.toFixed(1)}시간 / ${won(hybridTotalCost)}</td>
            <td><strong>${won(netSavings)}/월 (${timeSavedPct}%↓)</strong></td>
            <td><strong>${paybackMonths}개월</strong> (초기 ${won(capex)})</td>
          </tr>
        </tbody>
      </table>`;

    el("simCompareTable").innerHTML = `
      <table class="doc-table">
        <thead>
          <tr>
            <th>운영 시나리오 (월 ${num(volume)}건 기준)</th>
            <th>월 인력 투입시간</th>
            <th>월 인건비·재시도 기회비용</th>
            <th>월 GPU 감가(36개월)+전기료</th>
            <th>월 총비용 합계</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>1. 기존 수작업 (As-Is)</strong></td>
            <td class="num">${manualHours.toFixed(1)}시간</td>
            <td class="num">${won(manualCost)}</td>
            <td class="num">0원</td>
            <td class="num"><strong>${won(manualCost)}</strong></td>
            <td>납기 지연·오기입·연구인력 이탈</td>
          </tr>
          <tr>
            <td><strong>2. 무검증 자작 LLM</strong> (파서·3-Way 없음)</td>
            <td class="num">${unguardedHours.toFixed(1)}시간</td>
            <td class="num">${won(Math.round(unguardedHours * wage))}</td>
            <td class="num">${won(monthlyHw)}</td>
            <td class="num">${won(unguardedCost)}</td>
            <td>할루시네이션·산술 재검산 부담</td>
          </tr>
          <tr class="total-highlight">
            <td><strong>3. 본 하이브리드 파이프라인 (Local sLLM)</strong></td>
            <td class="num">${hybridHours.toFixed(1)}시간</td>
            <td class="num">${won(hybridLaborCost)}</td>
            <td class="num">${won(monthlyHw)} (${won(monthlyDepr)}+${won(monthlyElec)})</td>
            <td class="num"><strong>${won(hybridTotalCost)}</strong></td>
            <td>건당 GPU ~${gpuSecPerDoc}초 · 정보유출 0%</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function triggerDownloadBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function buildTemplateMaps(c) {
    applyProfileToCase(c);
    const q = c.doc_chain.quotation;
    const po = c.doc_chain.purchase_order;
    const di = c.doc_chain.delivery_inspection;
    const s = c.source_summary || {};
    const revTag = `Rev.${c.revision || 1}`;
    const map = {
      COMPANY_NAME: companyProfile.name,
      BIZ_NO: companyProfile.biz_no,
      CEO_NAME: companyProfile.ceo,
      COMPANY_ADDR: companyProfile.addr,
      CONTACT_NAME: companyProfile.contact,
      CONTACT_PHONE: companyProfile.phone,
      CERTIFICATIONS: companyProfile.certs,
      BANK_ACCOUNT: companyProfile.bank,
      ISSUING_AGENCY: s.issuing_agency || q.recipient || "-",
      NOTICE_NO: s.notice_number || po.linked_notice_no || "-",
      PROJECT_NAME: q.project_name || s.document_title || "-",
      DOC_NO: q.doc_no || "-",
      REVISION_TAG: revTag,
      DOC_DATE: q.quote_date || "-",
      DUE_DATE: po.due_date || di.delivery_date || "-",
      TOTAL_SUPPLY: won(q.total_supply),
      VAT_AMOUNT: won(q.vat),
      GRAND_TOTAL: won(q.grand_total),
      CHANGE_NOTE: c.last_change_summary || q.notes || "초기 견적·발주 기준 적합",
    };

    for (let i = 0; i < 4; i += 1) {
      const idx = i + 1;
      const it = q.items[i];
      map[`ITEM${idx}_NAME`] = it ? it.name : "";
      map[`ITEM${idx}_SPEC`] = it ? it.spec : "";
      map[`ITEM${idx}_UNIT`] = it ? it.unit : "";
      map[`ITEM${idx}_QTY`] = it ? num(it.qty) : "";
      map[`ITEM${idx}_PRICE`] = it ? num(it.unit_price) : "";
      map[`ITEM${idx}_AMOUNT`] = it ? num(it.supply_amount) : "";
    }
    return map;
  }

  async function fillAndDownloadTemplate(arrayBuffer, outFilename) {
    const status = el("templateStatusLine");
    if (!activeCase) return;
    try {
      const maps = buildTemplateMaps(activeCase);
      const res = await window.HwpBrowserParser.fillHwpxTemplate(arrayBuffer, maps, maps);
      triggerDownloadBlob(res.blob, outFilename);
      status.className = "sot-note";
      status.style.color = "var(--navy)";
      status.textContent = `[완료] '${outFilename}' 생성 및 다운로드 (${res.filledCount}개 항목 자동 채우기 완료)`;
    } catch (err) {
      status.className = "sot-note";
      status.style.color = "var(--fail)";
      status.textContent = `[오류] 양식 채우기 실패: ${err.message}`;
    }
  }

  function exportErpCsv(c) {
    const q = c.doc_chain.quotation;
    const po = c.doc_chain.purchase_order;
    const s = c.source_summary || {};
    const revTag = `Rev.${c.revision || 1}`;
    const csvCell = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;

    const headers = [
      "문서버전",
      "공고번호",
      "발주기관",
      "수신처",
      "공급자",
      "사업자등록번호",
      "문서번호",
      "작성일",
      "납기일",
      "품번",
      "품명",
      "규격",
      "단위",
      "수량",
      "단가",
      "공급가액",
      "부가세(문서합계)",
      "총합계금액(VAT포함)",
    ];
    const rows = q.items.map((it, idx) =>
      [
        revTag,
        s.notice_number || po.linked_notice_no || "",
        s.issuing_agency || "",
        q.recipient || "",
        companyProfile.name,
        companyProfile.biz_no,
        q.doc_no,
        q.quote_date,
        po.due_date || "",
        idx + 1,
        it.name,
        it.spec,
        it.unit,
        it.qty,
        it.unit_price,
        it.supply_amount,
        q.vat,
        q.grand_total,
      ]
        .map(csvCell)
        .join(",")
    );

    const csvContent = "\uFEFF" + [headers.map(csvCell).join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const outName = `${c.id}_Rev${c.revision || 1}_erp_import.csv`;
    triggerDownloadBlob(blob, outName);

    const status = el("templateStatusLine");
    status.style.color = "var(--navy)";
    status.textContent = `[완료] '${outName}' ERP 일괄등록용 CSV 저장 완료 (${q.items.length}개 품목)`;
  }

  function shiftIsoDate(dateStr, daysDelta) {
    const m = String(dateStr || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(2026, 11, 20);
    d.setDate(d.getDate() + daysDelta);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function parseKoreanChangeRules(text, baseCase) {
    const q = baseCase.doc_chain.quotation;
    const po = baseCase.doc_chain.purchase_order;
    const di = baseCase.doc_chain.delivery_inspection;

    const itemMatch = text.match(/([1-9])번\s*(?:품목|항목)/);
    const targetIdx = itemMatch ? Math.min(q.items.length - 1, parseInt(itemMatch[1], 10) - 1) : 0;
    const targetItem = q.items[targetIdx] || q.items[0];
    const oldQty = targetItem.qty;
    const oldPrice = targetItem.unit_price;
    const oldDue = po.due_date || "2026-12-20";

    let newQty = oldQty;
    let newPrice = oldPrice;
    let newDue = oldDue;
    let shortageQty = baseCase.shortage_qty || 0;
    const changeTags = [];

    // 1. Quantity change patterns ("100개에서 120개로", "100→120개", "+2개 증량", "수량 5개")
    const rangeQty = text.match(/(\d[\d,]*)\s*(?:개|EA|SET)?\s*(?:에서|->|→)\s*(\d[\d,]*)\s*(?:개|EA|SET)?/);
    const explicitQty = text.match(/수량[^\d\n]{0,12}(?:을|를|은|는)?\s*(\d[\d,]*)\s*(?:개|EA|SET)?\s*(?:으로|로|까지)/);
    const deltaQty = text.match(/(?:\+\s*(\d+)\s*개|(\d+)\s*개\s*(?:추가|증량|증가))/);

    if (rangeQty) {
      newQty = Math.max(1, parseInt(rangeQty[2].replace(/,/g, ""), 10) || oldQty);
      changeTags.push(`1번 수량 ${oldQty}→${newQty}개`);
    } else if (deltaQty) {
      const addVal = parseInt(deltaQty[1] || deltaQty[2], 10) || 0;
      newQty = Math.max(1, oldQty + addVal);
      changeTags.push(`수량 +${addVal}개(${oldQty}→${newQty})`);
    } else if (explicitQty) {
      newQty = Math.max(1, parseInt(explicitQty[1].replace(/,/g, ""), 10) || oldQty);
      changeTags.push(`수량 ${oldQty}→${newQty}개`);
    }

    // 2. Unit price adjustment ("단가 5% 할인", "단가 300만원으로")
    const pctMatch = text.match(/단가[^\d\n]{0,16}(\d+(?:\.\d+)?)\s*%\s*(할인|인하|감액|조정|인상|증액)/);
    const absPriceMatch = text.match(/단가(?:를|는|은)?\s*(\d[\d,]*)\s*원/);
    if (pctMatch) {
      const pct = parseFloat(pctMatch[1]) || 0;
      const isUp = /인상|증액/.test(pctMatch[2]);
      newPrice = Math.round(oldPrice * (1 + (isUp ? pct : -pct) / 100));
      changeTags.push(`단가 ${pct}% ${isUp ? "인상" : "할인"}`);
    } else if (absPriceMatch) {
      newPrice = Math.max(0, parseInt(absPriceMatch[1].replace(/,/g, ""), 10) || oldPrice);
      changeTags.push(`단가 ${num(newPrice)}원 조정`);
    }

    // 3. Due date change ("7일 연장" / "일주일 연장" or explicit new target date)
    const daysMatch = text.match(/(\d+)\s*일\s*(연장|연기|순연|단축|앞당)/);
    const weekMatch = text.match(/(일주일|1주|한\s*주)\s*(연장|연기|순연)/);
    const allDates = Array.from(text.matchAll(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/g)).map(
      (m) => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
    );
    const explicitNewDate = allDates.find((d) => d !== oldDue);
    if (daysMatch) {
      const nDays = parseInt(daysMatch[1], 10) || 0;
      const sign = /단축|앞당/.test(daysMatch[2]) ? -1 : 1;
      const baseRef = allDates[0] || oldDue;
      newDue = shiftIsoDate(baseRef, sign * nDays);
      changeTags.push(`납기 ${sign > 0 ? `+${nDays}` : `-${nDays}`}일(${newDue})`);
    } else if (weekMatch) {
      const baseRef = allDates[0] || oldDue;
      newDue = shiftIsoDate(baseRef, 7);
      changeTags.push(`납기 +7일(${newDue})`);
    } else if (explicitNewDate) {
      newDue = explicitNewDate;
      changeTags.push(`납기 ${newDue}`);
    }

    // 4. Delivery shortage ("1개 부족", "검수 보류")
    const shortMatch = text.match(/(\d+)\s*(?:개|EA|SET)?\s*(?:부족|누락|미납|결품|빠짐)/);
    if (shortMatch) {
      shortageQty = Math.max(1, parseInt(shortMatch[1], 10) || 1);
      changeTags.push(`실납품 ${shortageQty}개 부족(검수 보류)`);
    }

    return {
      target_item_index: targetIdx,
      new_qty: newQty,
      new_unit_price: newPrice,
      new_due_date: newDue,
      delivery_shortage: shortageQty,
      reason_summary: changeTags.length ? changeTags.join(" · ") : "텍스트 기반 변경 검토",
      used_live_llm: false,
      base_due_date: oldDue,
      base_di_date: di.delivery_date || oldDue,
    };
  }

  async function tryCallBazeChangeAnalysis(text, baseCase, apiKey) {
    const q = baseCase.doc_chain.quotation;
    const po = baseCase.doc_chain.purchase_order;
    const sys = `당신은 '${companyProfile.name}' 행정 변경관리 AI 비서입니다.
현재 문서 JSON 상태와 거래처 변경 요청 메일을 비교해 JSON만 반환하세요.
스키마: {"target_item_index":0,"new_qty":숫자,"new_unit_price":숫자,"new_due_date":"YYYY-MM-DD","delivery_shortage":0,"reason_summary":"한줄 요약"}`;
    const userMsg = `[현재 1번 품목] ${q.items[0].name} | 수량=${q.items[0].qty} | 단가=${q.items[0].unit_price} | 납기=${po.due_date}\n\n[거래처 요청]\n${text}`;

    const res = await fetch(BAZE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: BAZE_MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    return {
      ...parseKoreanChangeRules(text, baseCase),
      ...parsed,
      used_live_llm: true,
    };
  }

  function buildReplyEmailDraft(baseCase, afterCase, proposal) {
    const qOld = baseCase.doc_chain.quotation;
    const qNew = afterCase.doc_chain.quotation;
    const poNew = afterCase.doc_chain.purchase_order;
    const diNew = afterCase.doc_chain.delivery_inspection;
    const idx = proposal.target_item_index || 0;
    const itemOld = qOld.items[idx] || qOld.items[0];
    const itemNew = qNew.items[idx] || qNew.items[0];
    const nextRev = (baseCase.revision || 1) + 1;
    const deltaTotal = qNew.grand_total - qOld.grand_total;

    const lines = [
      `제목: [변경확인 · Rev.${nextRev}] ${qNew.project_name} (${qNew.doc_no}) 변경 반영 안내`,
      `수신: ${qNew.recipient} 담당자님`,
      `발신: ${companyProfile.name} ${companyProfile.contact} (${companyProfile.phone})`,
      "",
      `안녕하십니까, ${companyProfile.name} ${companyProfile.contact}입니다.`,
      `요청 주신 변경 사항을 당사 4종 관리 서식(견적서·발주/작업지시서·납품검수조서·지출결의서)에 일괄 대조한 결과(Rev.${nextRev})를 아래와 같이 회신드립니다.`,
      "",
      `1. 변경 핵심 내역 (${idx + 1}번 품목: ${itemNew.name})`,
    ];

    if (itemOld.qty !== itemNew.qty) {
      lines.push(` - 계약 수량: ${num(itemOld.qty)}${itemOld.unit} → ${num(itemNew.qty)}${itemNew.unit} (${itemNew.qty > itemOld.qty ? "+" : ""}${num(itemNew.qty - itemOld.qty)}${itemOld.unit})`);
    }
    if (itemOld.unit_price !== itemNew.unit_price) {
      lines.push(` - 품목 단가: ${won(itemOld.unit_price)} → ${won(itemNew.unit_price)}`);
    }
    if ((baseCase.doc_chain.purchase_order.due_date || "-") !== (poNew.due_date || "-")) {
      lines.push(` - 납품 기한: ${baseCase.doc_chain.purchase_order.due_date} → ${poNew.due_date} (검수 예정일: ${diNew.delivery_date})`);
    }
    if ((proposal.delivery_shortage || 0) > 0) {
      const deliv = diNew.items[idx]?.delivered_qty ?? 0;
      lines.push(` - 납품 검수 알림: 발주 ${num(itemNew.qty)} 대비 실납품 ${num(deliv)} 확인 (${num(proposal.delivery_shortage)}${itemNew.unit} 부족 → '수량불일치(보류)' 판정)`);
      lines.push(` - 후속 조치: 확인된 수량 우선 검수 후 부족분 ${num(proposal.delivery_shortage)}${itemNew.unit}는 3영업일 내 추가 직송 납품 예정입니다.`);
    }

    lines.push("");
    lines.push("2. 금액 변동 요약 (부가세 10% 포함)");
    lines.push(` - 변경 전 총액(Rev.${baseCase.revision || 1}): ${won(qOld.grand_total)} (공급가액 ${won(qOld.total_supply)} + VAT ${won(qOld.vat)})`);
    lines.push(` - 변경 후 총액(Rev.${nextRev}): ${won(qNew.grand_total)} (공급가액 ${won(qNew.total_supply)} + VAT ${won(qNew.vat)})`);
    lines.push(` - 총액 증감 차액: ${deltaTotal >= 0 ? "+" : ""}${won(deltaTotal)}`);
    lines.push("");
    lines.push(`위 변경내역이 반영된 개정 견적서 및 기관 지정 양식(.hwpx)을 첨부드리오니 확인 후 회신 부탁드립니다.`);
    lines.push(`감사합니다.`);
    lines.push("");
    lines.push(`--`);
    lines.push(`${companyProfile.name} | 대표 ${companyProfile.ceo} | 사업자번호 ${companyProfile.biz_no}`);
    lines.push(`${companyProfile.addr} | 입금계좌: ${companyProfile.bank}`);
    return lines.join("\n");
  }

  function addRevisionSuffix(docNo, revNum) {
    const clean = String(docNo || "DOC-2026").replace(/-Rev\d+$/i, "");
    return `${clean}-Rev${revNum}`;
  }

  function buildProposedCase(baseCase, proposal) {
    const next = deepClone(baseCase);
    const nextRev = (baseCase.revision || 1) + 1;
    next.revision = nextRev;
    next.shortage_qty = proposal.delivery_shortage || 0;
    next.last_change_summary = proposal.reason_summary;

    const q = next.doc_chain.quotation;
    const po = next.doc_chain.purchase_order;
    const di = next.doc_chain.delivery_inspection;
    const ap = next.doc_chain.expense_approval;

    const idx = proposal.target_item_index || 0;
    if (q.items[idx]) {
      q.items[idx].qty = Math.max(1, parseInt(proposal.new_qty, 10) || q.items[idx].qty);
      q.items[idx].unit_price = Math.max(0, parseInt(proposal.new_unit_price, 10) || q.items[idx].unit_price);
    }

    if (proposal.new_due_date && proposal.new_due_date !== po.due_date) {
      po.due_date = proposal.new_due_date;
      di.delivery_date = shiftIsoDate(proposal.new_due_date, -2);
    }

    q.doc_no = addRevisionSuffix(q.doc_no, nextRev);
    po.doc_no = addRevisionSuffix(po.doc_no, nextRev);
    di.doc_no = addRevisionSuffix(di.doc_no, nextRev);
    ap.doc_no = addRevisionSuffix(ap.doc_no, nextRev);
    q.notes = `[Rev.${nextRev} 변경반영: ${proposal.reason_summary}] ${String(q.notes || "").replace(/^\[Rev\.\d+[^\]]*\]\s*/, "")}`;
    if ((proposal.delivery_shortage || 0) > 0) {
      di.inspector_note = `[검수 보류 알림] 1번 품목 ${proposal.delivery_shortage}개 부족 납품 확인 — 잔여분 재납품 후 최종 합격 처리 요망.`;
    }

    recalcCaseTotals(next);
    return next;
  }

  function renderChangeDiffAndReply(baseCase, afterCase, proposal) {
    const qOld = baseCase.doc_chain.quotation;
    const qNew = afterCase.doc_chain.quotation;
    const poOld = baseCase.doc_chain.purchase_order;
    const poNew = afterCase.doc_chain.purchase_order;
    const diOld = baseCase.doc_chain.delivery_inspection;
    const diNew = afterCase.doc_chain.delivery_inspection;
    const idx = proposal.target_item_index || 0;
    const itOld = qOld.items[idx] || qOld.items[0];
    const itNew = qNew.items[idx] || qNew.items[0];

    const qtyDelta = itNew.qty - itOld.qty;
    const priceDelta = itNew.unit_price - itOld.unit_price;
    const vatDelta = qNew.vat - qOld.vat;
    const totalDelta = qNew.grand_total - qOld.grand_total;
    const delivOld = diOld.items[idx]?.delivered_qty ?? itOld.qty;
    const delivNew = diNew.items[idx]?.delivered_qty ?? itNew.qty;
    const dueChanged = (poOld.due_date || "-") !== (poNew.due_date || "-");
    const statusOld = baseCase.cross_check?.overall_status === "PASS" ? "적합(PASS)" : "보류(FAIL)";
    const statusNew = afterCase.cross_check?.overall_status === "PASS" ? "적합(PASS)" : "검수보류(FAIL)";

    const rows = [
      {
        field: `${idx + 1}번 품목 수량 (${itNew.name.slice(0, 14)})`,
        before: `${num(itOld.qty)}${itOld.unit}`,
        after: `${num(itNew.qty)}${itNew.unit}`,
        delta: qtyDelta === 0 ? "변동 없음" : `${qtyDelta > 0 ? "+" : ""}${num(qtyDelta)}${itNew.unit}`,
        cls: qtyDelta !== 0 ? "changed" : "",
      },
      {
        field: `${idx + 1}번 품목 단가`,
        before: won(itOld.unit_price),
        after: won(itNew.unit_price),
        delta: priceDelta === 0 ? "변동 없음" : `${priceDelta > 0 ? "+" : ""}${won(priceDelta)}`,
        cls: priceDelta !== 0 ? "changed" : "",
      },
      {
        field: "납품 기한 (발주서 기준)",
        before: poOld.due_date || "-",
        after: poNew.due_date || "-",
        delta: dueChanged ? "일정 변경 반영" : "변동 없음",
        cls: dueChanged ? "changed" : "",
      },
      {
        field: "실납품 예정 수량 / 3-Way 판정",
        before: `${num(delivOld)}${itOld.unit} (${statusOld})`,
        after: `${num(delivNew)}${itNew.unit} (${statusNew})`,
        delta: delivNew < itNew.qty ? `${num(itNew.qty - delivNew)}${itNew.unit} 부족(보류)` : "전량 일치",
        cls: delivNew < itNew.qty ? "deficit" : "",
      },
      {
        field: "부가가치세 (10%)",
        before: won(qOld.vat),
        after: won(qNew.vat),
        delta: vatDelta === 0 ? "변동 없음" : `${vatDelta > 0 ? "+" : ""}${won(vatDelta)}`,
        cls: vatDelta !== 0 ? "changed" : "",
      },
      {
        field: "총 합계금액 (VAT 포함)",
        before: won(qOld.grand_total),
        after: won(qNew.grand_total),
        delta: totalDelta === 0 ? "변동 없음" : `${totalDelta > 0 ? "+" : ""}${won(totalDelta)}`,
        cls: totalDelta !== 0 ? "changed" : "",
      },
    ];

    el("changeDiffBox").innerHTML = `
      <table class="meta-table diff-table">
        <thead>
          <tr>
            <th style="width: 34%;">대조 항목</th>
            <th style="width: 22%;">변경 전 (Rev.${baseCase.revision || 1})</th>
            <th style="width: 22%;">변경 후 (Rev.${afterCase.revision})</th>
            <th style="width: 22%;">증감 · 판정</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr class="${r.cls}">
              <td><strong>${esc(r.field)}</strong></td>
              <td>${esc(r.before)}</td>
              <td><strong>${esc(r.after)}</strong></td>
              <td class="diff-delta">${esc(r.delta)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;

    el("replyDraftBox").textContent = buildReplyEmailDraft(baseCase, afterCase, proposal);
    el("applyChangeBtn").disabled = false;
    el("copyReplyBtn").disabled = false;
    el("changeStatusLine").style.color = "var(--navy)";
    el("changeStatusLine").textContent = `[분석 완료 · ${proposal.used_live_llm ? "BAZE LLM" : "한국어 변경 파서"}] ${proposal.reason_summary} — 아래 [4종 서식(Rev.${afterCase.revision})에 일괄 반영]을 누르면 문서에 즉시 적용됩니다.`;
  }

  async function analyzeChangeRequestText() {
    if (!activeCase) return;
    const text = (el("changeRequestInput").value || "").trim();
    if (!text) {
      el("changeStatusLine").style.color = "var(--fail)";
      el("changeStatusLine").textContent = "거래처 변경 요청 내용을 입력하거나 위 시나리오 버튼을 클릭하세요.";
      return;
    }

    const status = el("changeStatusLine");
    status.style.color = "var(--navy)";
    status.textContent = "변경요청 내용 파싱 및 기존 문서 대조(Diff) 계산 중...";

    let proposal = null;
    const key = (el("liveApiKey")?.value || "").trim();
    if (key) {
      try {
        proposal = await tryCallBazeChangeAnalysis(text, activeCase, key);
      } catch (err) {
        console.warn("Baze change parse fallback:", err);
      }
    }
    if (!proposal) {
      proposal = parseKoreanChangeRules(text, activeCase);
    }

    const afterCase = buildProposedCase(activeCase, proposal);
    pendingProposal = { proposal, afterCase };
    renderChangeDiffAndReply(activeCase, afterCase, proposal);
  }

  function bindEvents() {
    document.querySelectorAll(".mode-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".mode-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const mode = btn.dataset.mode;
        el("corpusSection").classList.toggle("hidden", mode !== "corpus");
        el("uploadSection").classList.toggle("hidden", mode !== "upload");
        el("securitySection").classList.toggle("hidden", mode !== "security");
        el("pipelineWorkspace").classList.toggle("hidden", mode === "security");
        if (mode === "security") renderSecuritySimulator();
      });
    });

    // Registered Company Profile inputs (live binding + localStorage persistence)
    ["profName", "profBizNo", "profCeo", "profContact", "profAddr", "profPhone", "profCerts", "profBank"].forEach(
      (id) => {
        el(id)?.addEventListener("input", () => {
          readProfileInputs();
          if (activeCase) {
            applyProfileToCase(activeCase);
            renderSheet(activeCase);
            if (pendingProposal) {
              applyProfileToCase(pendingProposal.afterCase);
              el("replyDraftBox").textContent = buildReplyEmailDraft(
                activeCase,
                pendingProposal.afterCase,
                pendingProposal.proposal
              );
            }
          }
        });
      }
    );

    el("resetProfileBtn")?.addEventListener("click", () => {
      companyProfile = { ...DEFAULT_PROFILE };
      syncProfileInputs();
      saveProfile();
      if (activeCase) {
        applyProfileToCase(activeCase);
        renderSheet(activeCase);
      }
    });

    ["simVolume", "simManualMin", "simRetryPct", "simReviewMin", "simWage", "simHwTier"].forEach(
      (id) => {
        el(id).addEventListener("input", renderSecuritySimulator);
        el(id).addEventListener("change", renderSecuritySimulator);
      }
    );

    document.querySelectorAll(".doc-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".doc-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeDocTab = btn.dataset.doc;
        if (activeCase) renderSheet(activeCase);
      });
    });

    const onSotChange = () => {
      if (!activeCase || !activeCase.doc_chain.quotation.items[0]) return;
      activeCase.doc_chain.quotation.items[0].qty = parseInt(el("liveQtyInput").value, 10) || 1;
      activeCase.doc_chain.quotation.items[0].unit_price = parseInt(el("livePriceInput").value, 10) || 0;
      recalcCaseTotals(activeCase);
      renderCrossCheck(activeCase);
      renderSheet(activeCase);
    };
    el("liveQtyInput").addEventListener("input", onSotChange);
    el("livePriceInput").addEventListener("input", onSotChange);

    el("toggleMismatchBtn").addEventListener("click", () => {
      simulateMismatch = !simulateMismatch;
      el("toggleMismatchBtn").classList.toggle("btn-accent", simulateMismatch);
      if (activeCase) {
        recalcCaseTotals(activeCase);
        renderCrossCheck(activeCase);
        renderSheet(activeCase);
      }
    });

    el("printBtn").addEventListener("click", () => window.print());

    el("downloadJsonBtn").addEventListener("click", () => {
      if (!activeCase) return;
      const blob = new Blob([JSON.stringify(activeCase, null, 2)], { type: "application/json" });
      triggerDownloadBlob(blob, `${activeCase.id}_Rev${activeCase.revision || 1}_4docs.json`);
    });

    // Built-in HWPX Template Auto-Fill
    el("downloadFilledHwpxBtn")?.addEventListener("click", async () => {
      if (!activeCase) return;
      const status = el("templateStatusLine");
      status.style.color = "var(--navy)";
      status.textContent = "기관 지정 .hwpx 양식 불러오는 중...";
      try {
        const resp = await fetch("templates/standard_quote_submit_template.hwpx");
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buf = await resp.arrayBuffer();
        await fillAndDownloadTemplate(
          buf,
          `${activeCase.id}_Rev${activeCase.revision || 1}_지정양식.hwpx`
        );
      } catch (err) {
        status.style.color = "var(--fail)";
        status.textContent = `[오류] 기본 양식 로드 실패: ${err.message}`;
      }
    });

    // User Custom HWPX Template Upload & Auto-Fill
    const cti = el("customTemplateInput");
    el("uploadCustomTemplateBtn")?.addEventListener("click", () => cti?.click());
    cti?.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const buf = await f.arrayBuffer();
      await fillAndDownloadTemplate(buf, `filled_${f.name}`);
      cti.value = "";
    });

    el("downloadErpCsvBtn")?.addEventListener("click", () => {
      if (activeCase) exportErpCsv(activeCase);
    });

    // Step 04 Scenario Presets & Change Analysis
    document.querySelectorAll(".scenario-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!activeCase) return;
        const first = activeCase.doc_chain.quotation.items[0];
        const due = activeCase.doc_chain.purchase_order.due_date || "2026-12-20";
        const sc = btn.dataset.scenario;
        if (sc === "qty_due") {
          el("changeRequestInput").value =
            `담당자님, ${activeCase.doc_chain.quotation.project_name} 건에서 1번 품목(${first.name}) 납품 수량을 100개에서 120개로 변경하고, 납기는 기존(${due}) 대비 7일 연장해 주세요. 수정된 견적·발주 내역과 회신 부탁드립니다.`;
        } else if (sc === "price_discount") {
          el("changeRequestInput").value =
            `발주 협의 결과 1번 품목(${first.name}) 수량을 2개 추가(+2개 증량)하는 조건으로 단가 5% 할인 적용 부탁드립니다. 변경 총액 확인 후 회신 바랍니다.`;
        } else if (sc === "short_delivery") {
          el("changeRequestInput").value =
            `현장 물류 출고 확인 결과 금일 1번 품목(${first.name})이 1개 부족 납품될 예정입니다. 검수조서 보류 처리 및 잔여분 재납품 일정 회신 요청드립니다.`;
        }
        analyzeChangeRequestText();
      });
    });

    el("analyzeChangeBtn")?.addEventListener("click", analyzeChangeRequestText);

    el("applyChangeBtn")?.addEventListener("click", () => {
      if (!pendingProposal || !pendingProposal.afterCase) return;
      activeCase = deepClone(pendingProposal.afterCase);
      recalcCaseTotals(activeCase);
      renderAll();
      el("applyChangeBtn").disabled = true;
      el("revertRevBtn").disabled = false;
      el("changeStatusLine").style.color = "var(--navy)";
      el("changeStatusLine").textContent =
        `[반영 완료] 4종 행정서식이 Rev.${activeCase.revision}로 일괄 업데이트되었습니다. 상단 Step 03 견적·발주·검수조서·품의서와 HWPX 다운로드를 확인하세요.`;
    });

    el("revertRevBtn")?.addEventListener("click", () => {
      if (!baselineCase) return;
      activeCase = deepClone(baselineCase);
      recalcCaseTotals(activeCase);
      resetChangeRequestPanel();
      renderAll();
      el("changeStatusLine").textContent = "[복원] 최초 기안 상태(Rev.1)로 되돌렸습니다.";
    });

    el("copyReplyBtn")?.addEventListener("click", async () => {
      const txt = el("replyDraftBox")?.textContent || "";
      if (!txt) return;
      try {
        await navigator.clipboard.writeText(txt);
        el("copyReplyBtn").textContent = "복사 완료";
        setTimeout(() => {
          el("copyReplyBtn").textContent = "회신 초안 복사";
        }, 1600);
      } catch (_) {
        el("changeStatusLine").textContent = "클립보드 접근이 제한되어 텍스트를 직접 드래그해 복사하세요.";
      }
    });

    el("openQrBtn").addEventListener("click", () => el("qrModal").classList.add("open"));
    el("closeQrBtn").addEventListener("click", () => el("qrModal").classList.remove("open"));
    el("qrModal").addEventListener("click", (e) => {
      if (e.target === el("qrModal")) el("qrModal").classList.remove("open");
    });

    const dz = el("dropZone");
    const fi = el("fileInput");
    dz.addEventListener("click", () => fi.click());
    dz.addEventListener("dragover", (e) => {
      e.preventDefault();
      dz.classList.add("dragover");
    });
    dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault();
      dz.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleUploadedFile(e.dataTransfer.files[0]);
      }
    });
    fi.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        handleUploadedFile(e.target.files[0]);
      }
    });
  }

  async function init() {
    loadProfile();
    bindEvents();
    try {
      const resp = await fetch("data/precomputed_cases.json");
      const bundle = await resp.json();
      cases = bundle.cases || [];
      if (cases.length > 0) {
        selectCaseClean(cases[0]);
      }
    } catch (err) {
      el("rawExtractedBox").textContent = `데이터 로드 실패: ${err.message}`;
    }
  }

  init();
})();
