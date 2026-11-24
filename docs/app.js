(function () {
  const BAZE_ENDPOINT = "https://factchat-cloud.mindlogic.ai/v1/gateway/chat/completions";
  const BAZE_MODEL = "gpt-6.1-terra";
  const ASSET_VER = "20261124d";
  const PROFILE_STORAGE_KEY = "dsc_team_b_company_profile_v2";
  const LEGACY_PROFILE_KEY = "dsc_team_b_company_profile_v1";

  const DEFAULT_PROFILE = {
    name: "(주)대덕정밀기계",
    biz_no: "314-81-59204",
    ceo: "김대전",
    contact: "이행정 대리",
    addr: "대전 대덕구 문평서로 18번길 (대덕산업단지)",
    phone: "042-930-4100 / sales@dd-precision.kr",
    certs: "벤처기업 · 이노비즈 · 직접생산확인",
    bank: "기업은행 314-092811-01-012",
    est_rev: "2016.04.15 설립 · 연매출 42억 원 · 상시 18명 (연구전담 6명)",
    capability: "5축 CNC 머시닝센터 4대 · 3차원 좌표측정기(CMM) · DQMS/ISO9001 전수검수 체계",
    staff_text: [
      "이준호 | 수석연구원 | 총괄책임자(PM) | 기계공학 박사 · 방산/출연연 납품 12년",
      "박서연 | 책임연구원 | 시스템·SW/검증 | 컴퓨터공학 석사 · GPU/임베디드 8년",
      "최민규 | 품질팀장 | 품질보증(QA)·검수 | 국방품질경영시스템(DQMS) · 정밀측정 10년",
    ].join("\n"),
    track_record_text: [
      "국방과학연구소(ADD) | UAV 구동부 정밀 하우징 시제품 | 2025.03 ~ 2025.11 | 8,400만 원",
      "한국항공우주연구원 | 위성시험용 광학 마운트 제작 | 2024.06 ~ 2025.02 | 6,200만 원",
      "한국표준과학연구원 | 고집적 GPU 서버 랙 냉각 모듈 납품 | 2024.02 ~ 2024.09 | 4,900만 원",
    ].join("\n"),
  };

  const DOC_REGISTRY = [
    { id: "quotation", name: "1. 표준 견적서", kind: "핵심 4종" },
    { id: "purchase_order", name: "2. 발주서 · 작업지시서", kind: "핵심 4종" },
    { id: "delivery_inspection", name: "3. 거래명세서 · 납품검수조서", kind: "핵심 4종" },
    { id: "expense_approval", name: "4. 지출결의서 · 내부 품의서", kind: "핵심 4종" },
    { id: "form_company_staff", name: "기관양식 A. 업체 일반현황 · 참여인력표 (.hwpx)", kind: "기관 양식" },
    { id: "form_project_plan", name: "기관양식 B. 사업수행계획서 요약 (.hwpx)", kind: "기관 양식" },
  ];

  let cases = [];
  let activeCase = null;
  let baselineCase = null;
  let pendingProposal = null;
  let activeDocTab = "quotation";
  let simulateMismatch = false;
  let companyProfile = { ...DEFAULT_PROFILE };
  let activeFormBuffer = null;
  let activeFormFilename = "";
  let activeFormPlan = null;

  const el = (id) => document.getElementById(id);

  function defaultRevisions() {
    return {
      quotation: 1,
      purchase_order: 1,
      delivery_inspection: 1,
      expense_approval: 1,
      form_company_staff: 1,
      form_project_plan: 1,
    };
  }

  function ensureDocRevisions(c) {
    c.doc_revisions = { ...defaultRevisions(), ...(c.doc_revisions || {}) };
    return c.doc_revisions;
  }

  function parseStaffRows(raw) {
    return String(raw || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|").map((p) => p.trim());
        return {
          name: parts[0] || "",
          title: parts[1] || "연구원",
          role: parts[2] || "참여인력",
          career: parts[3] || "",
        };
      });
  }

  function parseTrackRows(raw) {
    return String(raw || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|").map((p) => p.trim());
        return {
          org: parts[0] || "",
          project: parts[1] || "",
          period: parts[2] || "",
          amount: parts[3] || "",
        };
      });
  }

  function getEffectiveStaffRows(c) {
    const baseRows = parseStaffRows(companyProfile.staff_text);
    const desiredPm = (c && c.pm_name) || "";
    if (!desiredPm || baseRows.length === 0) return baseRows;

    const matchIdx = baseRows.findIndex((r) => r.name === desiredPm || r.name.includes(desiredPm));
    const reordered = baseRows.map((r) => ({ ...r }));
    if (matchIdx > 0) {
      const [picked] = reordered.splice(matchIdx, 1);
      if (reordered[0] && /PM|총괄/.test(reordered[0].role)) {
        reordered[0].role = "핵심기술지원 (전임 PM)";
      }
      picked.role = "총괄책임자(PM)";
      reordered.unshift(picked);
    } else if (matchIdx === -1) {
      if (reordered[0] && /PM|총괄/.test(reordered[0].role)) {
        reordered[0].role = "핵심기술지원";
      }
      reordered.unshift({
        name: desiredPm,
        title: "책임연구원",
        role: "총괄책임자(PM)",
        career: "변경 지정 총괄책임자(PM)",
      });
    } else {
      reordered[0].role = "총괄책임자(PM)";
    }
    return reordered;
  }

  function loadProfile() {
    try {
      const savedV2 = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null");
      const savedV1 = JSON.parse(localStorage.getItem(LEGACY_PROFILE_KEY) || "null");
      const merged = savedV2 || savedV1;
      if (merged && typeof merged === "object") {
        companyProfile = { ...DEFAULT_PROFILE, ...merged };
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
      profEstRev: "est_rev",
      profCapability: "capability",
      profStaff: "staff_text",
      profTrackRecord: "track_record_text",
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
      est_rev: (el("profEstRev")?.value || "").trim() || DEFAULT_PROFILE.est_rev,
      capability: (el("profCapability")?.value || "").trim() || DEFAULT_PROFILE.capability,
      staff_text: (el("profStaff")?.value || "").trim() || DEFAULT_PROFILE.staff_text,
      track_record_text: (el("profTrackRecord")?.value || "").trim() || DEFAULT_PROFILE.track_record_text,
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

  function recalcCaseTotals(c, opts = {}) {
    const syncFromQuotation = opts.syncFromQuotation !== false;
    applyProfileToCase(c);
    ensureDocRevisions(c);
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

      if (syncFromQuotation) {
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
      }
    });

    q.total_supply = totalSupply;
    q.vat = Math.round(totalSupply * 0.1);
    q.grand_total = totalSupply + q.vat;

    if (syncFromQuotation) {
      ap.total_supply = totalSupply;
      ap.vat = q.vat;
      ap.grand_total = simulateMismatch ? q.grand_total + 550000 : q.grand_total;
    } else if (simulateMismatch) {
      ap.grand_total = q.grand_total + 550000;
    }

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
            : `1번 품목 발주(${po.items[0]?.qty ?? q.items[0].qty}) ≠ 실납품(${di.items[0]?.delivered_qty ?? 0}) 불일치 탐지!`,
        },
        {
          rule: "공급가액·부가세(10%)·품의총액 산식 검증",
          status: totalMatch ? "PASS" : "FAIL",
          detail: totalMatch
            ? `공급가액 ${num(totalSupply)}원 + VAT ${num(q.vat)}원 = ${num(q.grand_total)}원 일치`
            : `견적총액(${num(q.grand_total)}원) ≠ 품의총액(${num(ap.grand_total)}원) 차이 경고!`,
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
    if (el("applyChangeBtn")) {
      el("applyChangeBtn").disabled = true;
      el("applyChangeBtn").textContent = "선택된 서류만 개정 반영";
    }
    if (el("copyReplyBtn")) el("copyReplyBtn").disabled = true;
    if (el("revertRevBtn")) {
      const hasAnyRev = activeCase && Object.values(ensureDocRevisions(activeCase)).some((r) => r > 1);
      el("revertRevBtn").disabled = !hasAnyRev;
    }
    if (el("changeStatusLine")) el("changeStatusLine").textContent = "";
    if (el("impactMatrixBox")) {
      el("impactMatrixBox").innerHTML = `
        <div class="text-block" style="color: var(--muted);">
          위 시나리오 버튼을 누르거나 변경 요청을 입력한 뒤 <strong>[영향 서류 판별 및 Diff 비교]</strong>를 실행하면, 6종 서류(핵심 4종 + 기관양식 2종) 중 <strong>실제로 수정이 필요한 서류만 자동 체크</strong>되고 무관한 서류는 기존 버전(Rev.1)을 유지합니다.
        </div>`;
    }
    if (el("changeDiffBox")) {
      el("changeDiffBox").innerHTML = `
        <div class="text-block" style="color: var(--muted);">
          변경 요청 분석 시 수량·단가·납기·납품장소·총괄책임자(PM)·총액 변동 내역이 대조 표시됩니다.
        </div>`;
    }
    if (el("replyDraftBox")) {
      el("replyDraftBox").textContent =
        "변경요청 분석 후 개정 서류(Rev.2) 및 원안 유지 서류(Rev.1)가 구분 명시된 공식 회신 문구가 자동 생성됩니다.";
    }
  }

  function selectCaseClean(c) {
    simulateMismatch = false;
    el("toggleMismatchBtn").classList.remove("btn-accent");
    activeCase = deepClone(c);
    activeCase.revision = 1;
    activeCase.doc_revisions = defaultRevisions();
    activeCase.shortage_qty = 0;
    activeCase.last_change_summary = "";
    activeCase.delivery_location =
      activeCase.doc_chain?.delivery_inspection?.delivery_location || "발주기관 지정 납품장소";
    activeCase.pm_name = parseStaffRows(companyProfile.staff_text)[0]?.name || "이준호";
    recalcCaseTotals(activeCase);
    baselineCase = deepClone(activeCase);
    if (el("formWorkbenchPreview")) {
      el("formWorkbenchPreview").classList.add("hidden");
    }
    activeFormBuffer = null;
    activeFormPlan = null;
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
    const revs = ensureDocRevisions(activeCase);
    renderCorpusCards();
    renderStep1(activeCase);
    renderStep2(activeCase);
    renderCrossCheck(activeCase);
    renderSheet(activeCase);

    ["quotation", "purchase_order", "delivery_inspection", "expense_approval"].forEach((docId) => {
      const badge = el(`tabRev_${docId}`);
      if (badge) {
        badge.textContent = `Rev.${revs[docId] || 1}`;
        badge.classList.toggle("updated", (revs[docId] || 1) > 1);
      }
    });
    ["form_company_staff", "form_project_plan"].forEach((docId) => {
      const badge = el(`formRev_${docId}`);
      if (badge) {
        badge.textContent = `Rev.${revs[docId] || 1}`;
        badge.classList.toggle("updated", (revs[docId] || 1) > 1);
      }
    });

    const updatedCount = Object.values(revs).filter((r) => r > 1).length;
    if (el("revisionBadge")) {
      el("revisionBadge").textContent =
        updatedCount === 0
          ? "관리 대상 6종 문서 · 전체 Rev.1 (최초 기안)"
          : `선별 개정 상태: ${updatedCount}종 개정(Rev.2+) / ${6 - updatedCount}종 Rev.1 유지 (${activeCase.last_change_summary || "변경 반영"})`;
    }
    if (el("revertRevBtn")) {
      el("revertRevBtn").disabled = updatedCount === 0;
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
    const revs = ensureDocRevisions(c);
    const q = c.doc_chain.quotation;
    const po = c.doc_chain.purchase_order;
    const di = c.doc_chain.delivery_inspection;
    const s = c.source_summary || {};
    const revTag = `Rev.${revs.quotation || 1}`;
    const map = {
      COMPANY_NAME: companyProfile.name,
      BIZ_NO: companyProfile.biz_no,
      CEO_NAME: companyProfile.ceo,
      EST_REV: companyProfile.est_rev,
      COMPANY_ADDR: companyProfile.addr,
      CONTACT_NAME: companyProfile.contact,
      CONTACT_PHONE: companyProfile.phone,
      CONTACT_COMBINED: `${companyProfile.contact} (${companyProfile.phone})`,
      CERTIFICATIONS: companyProfile.certs,
      BANK_ACCOUNT: companyProfile.bank,
      ISSUING_AGENCY: s.issuing_agency || q.recipient || "-",
      NOTICE_NO: s.notice_number || po.linked_notice_no || "-",
      PROJECT_NAME: q.project_name || s.document_title || "-",
      DOC_NO: q.doc_no || "-",
      REVISION_TAG: revTag,
      DOC_DATE: q.quote_date || "-",
      DUE_DATE: po.due_date || di.delivery_date || "-",
      DELIVERY_LOCATION: c.delivery_location || di.delivery_location || "발주기관 지정 장소",
      PM_NAME: `${c.pm_name || "이준호"} (총괄책임자 · ${companyProfile.name})`,
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

  function buildUniversalFormContext(c) {
    const placeholders = buildTemplateMaps(c);
    const q = c.doc_chain.quotation;
    const po = c.doc_chain.purchase_order;
    const di = c.doc_chain.delivery_inspection;
    const s = c.source_summary || {};
    const staffRows = getEffectiveStaffRows(c);
    const trackRows = parseTrackRows(companyProfile.track_record_text);
    const itemSummary = (q.items || [])
      .slice(0, 3)
      .map((it) => `${it.name}(${num(it.qty)}${it.unit})`)
      .join(", ");
    const delivLoc = c.delivery_location || di.delivery_location || "발주기관 지정 장소";
    const pmDisplay = c.pm_name || staffRows[0]?.name || companyProfile.ceo;

    const kv = {
      ...placeholders,
      PM_NAME: `${pmDisplay} (${staffRows[0]?.title || "수석연구원"} / ${companyProfile.name})`,
      DELIVERY_LOCATION: delivLoc,
      PLAN_GOAL: `${s.issuing_agency || ""} '${s.document_title || q.project_name}' 과업의 요구 규격·정밀 공차를 100% 충족하고 납기 내 안전 검수를 완수함.`,
      PLAN_SCOPE: `총괄책임자(PM) ${pmDisplay} 책임 하에 ${itemSummary} 제작·공급 및 시험성적서 제출 수행 (총 제안액 ${won(q.grand_total)}).`,
      PLAN_SCHEDULE: `계약·작업지시(${po.order_date}) → 정밀가공·사내 QA → 현장 납품(장소: ${delivLoc} / 납기: ${po.due_date}) → 검수 완료(${di.delivery_date}).`,
      PLAN_QUALITY: `${companyProfile.capability} 및 보유 인증(${companyProfile.certs}) 기준 출하 전수검사를 적용함.`,
      PLAN_TRACK: trackRows.map((t) => `• ${t.org}: ${t.project} (${t.period}, ${t.amount})`).join(" / "),
    };

    const itemRows = (q.items || []).map((it) => ({
      name: it.name,
      spec: it.spec,
      unit: it.unit,
      qty: num(it.qty),
      price: num(it.unit_price),
      amount: num(it.supply_amount),
    }));

    return { placeholders, kv, staffRows, trackRows, itemRows };
  }

  async function tryFillUnmappedSlotsWithBaze(plan, baseCase, apiKey) {
    const emptySlots = (plan.slots || []).filter((s) => !String(s.value || "").trim());
    if (emptySlots.length === 0) return;

    const slotList = emptySlots.map((s) => ({ id: s.id, label: s.label, location: s.location }));
    const sys = `당신은 '${companyProfile.name}' 기관 양식 작성 AI 어시스턴트입니다.
기업 정보와 공고 요약을 참고해 아래 빈 양식 슬롯 ID별 작성 값을 {"values": {"슬롯ID": "값"}} JSON 형식으로 반환하세요.`;
    const userMsg = `[기업] ${companyProfile.name} / 사업자 ${companyProfile.biz_no} / 역량 ${companyProfile.capability}
[공고] ${baseCase.source_summary?.document_title || ""} (${baseCase.source_summary?.issuing_agency || ""})
[빈 슬롯 목록]\n${JSON.stringify(slotList, null, 2)}`;

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
        temperature: 0.2,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content || "{}");
    const values = parsed.values || {};
    emptySlots.forEach((s) => {
      if (values[s.id]) {
        s.value = String(values[s.id]);
        s.source = "AI 초안";
      }
    });
  }

  function renderFormWorkbench() {
    const preview = el("formWorkbenchPreview");
    const wrap = el("slotMapTableWrap");
    if (!preview || !wrap || !activeFormPlan) return;

    const filledCount = activeFormPlan.slots.filter((s) => String(s.value || "").trim() !== "").length;
    el("workbenchMetaInfo").textContent =
      `감지된 양식 유형: [${activeFormPlan.formType}] · 표 ${activeFormPlan.tableCount}개 · 자동 매핑 ${filledCount} / ${activeFormPlan.slots.length}개 항목 (${activeFormFilename})`;

    const sourceClass = (src) => {
      if (src === "기업자료") return "company";
      if (src === "AI 초안") return "ai";
      if (src && src.includes("직접")) return "manual";
      return "";
    };

    wrap.innerHTML = `
      <table class="slot-map-table">
        <thead>
          <tr>
            <th style="width: 17%;">양식 내 위치</th>
            <th style="width: 24%;">감지된 빈 칸 · 항목명</th>
            <th style="width: 14%;">매핑 출처</th>
            <th style="width: 45%;">자동 입력값 (직접 클릭해 수정 가능)</th>
          </tr>
        </thead>
        <tbody>
          ${activeFormPlan.slots
            .map(
              (s, i) => `
            <tr>
              <td class="mono">${esc(s.location)}</td>
              <td><strong>${esc(s.label)}</strong></td>
              <td><span class="source-tag ${sourceClass(s.source)}">${esc(s.source)}</span></td>
              <td><input type="text" class="slot-input" data-slot-idx="${i}" value="${esc(s.value)}" placeholder="필요 시 직접 입력" /></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;

    wrap.querySelectorAll(".slot-input").forEach((inp) => {
      inp.addEventListener("input", (e) => {
        const idx = parseInt(e.target.dataset.slotIdx, 10);
        if (activeFormPlan && activeFormPlan.slots[idx]) {
          activeFormPlan.slots[idx].value = e.target.value;
        }
      });
    });

    preview.classList.remove("hidden");
  }

  async function openFormWorkbenchFromBuffer(arrayBuffer, outFilename) {
    const status = el("templateStatusLine");
    if (!activeCase) return;
    try {
      const pool = buildUniversalFormContext(activeCase);
      const plan = await window.HwpBrowserParser.analyzeHwpxForm(arrayBuffer, pool);
      const key = (el("liveApiKey")?.value || "").trim();
      if (key) {
        try {
          await tryFillUnmappedSlotsWithBaze(plan, activeCase, key);
        } catch (err) {
          console.warn("Live BAZE slot fill fallback:", err);
        }
      }
      activeFormBuffer = arrayBuffer;
      activeFormFilename = outFilename;
      activeFormPlan = plan;
      renderFormWorkbench();

      const filledCount = plan.slots.filter((s) => String(s.value || "").trim() !== "").length;
      status.style.color = "var(--navy)";
      status.textContent = `[구조 분석 완료] '${plan.formType}' (표 ${plan.tableCount}개 · ${filledCount}/${plan.slots.length}개 항목 매핑). 아래 표 검토 후 [완성된 .hwpx 내려받기]를 누르세요.`;
    } catch (err) {
      status.style.color = "var(--fail)";
      status.textContent = `[오류] 양식 구조 분석 실패: ${err.message}`;
    }
  }

  async function refreshOpenWorkbenchIfVisible() {
    if (!activeFormBuffer || !activeCase) return;
    const preview = el("formWorkbenchPreview");
    if (!preview || preview.classList.contains("hidden")) return;
    const pool = buildUniversalFormContext(activeCase);
    activeFormPlan = await window.HwpBrowserParser.analyzeHwpxForm(activeFormBuffer, pool);
    renderFormWorkbench();
  }

  function exportErpCsv(c) {
    const revs = ensureDocRevisions(c);
    const q = c.doc_chain.quotation;
    const po = c.doc_chain.purchase_order;
    const s = c.source_summary || {};
    const revTag = `Rev.${revs.quotation || 1}`;
    const csvCell = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;

    const headers = [
      "견적버전",
      "공고번호",
      "발주기관",
      "수신처",
      "공급자",
      "사업자등록번호",
      "총괄책임자(PM)",
      "납품장소",
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
        c.pm_name || "이준호",
        c.delivery_location || c.doc_chain.delivery_inspection?.delivery_location || "",
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
    const outName = `${c.id}_Rev${revs.quotation || 1}_erp_import.csv`;
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
    const oldLoc = baseCase.delivery_location || di.delivery_location || "발주기관 지정 납품장소";
    const oldPm = baseCase.pm_name || parseStaffRows(companyProfile.staff_text)[0]?.name || "이준호";

    let newQty = oldQty;
    let newPrice = oldPrice;
    let newDue = oldDue;
    let newLocation = oldLoc;
    let newPm = oldPm;
    let shortageQty = baseCase.shortage_qty || 0;
    const changeTags = [];

    // 1. Quantity change patterns ("100개에서 120개로", "100→120개", "+2개 증량")
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

    // 2. Unit price adjustment
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

    // 3. Due date change (evaluate relative N days / 1 week BEFORE standalone explicit date!)
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

    // 4. Delivery location change ("납품장소는 기존 ...에서 '제2연구동 ...'로 변경")
    const quotedLocMatch = text.match(
      /(?:납품\s*장소|납품처|설치\s*장소|수행\s*장소)[^\n.;]{0,45}?['"‘“]([^'"’”\n]{2,45})['"’”]\s*(?:으로|로)?\s*(?:변경|이전|수정)/
    );
    const plainLocMatch = text.match(
      /(?:납품\s*장소|납품처|설치\s*장소|수행\s*장소)(?:을|를|은|는)?\s*(?:[^\n.,]+에서\s+)?([^\n.,'"()]{2,34}?)\s*(?:으로|로)\s*(?:변경|이전|수정)/
    );
    if (quotedLocMatch) {
      newLocation = quotedLocMatch[1].trim();
      changeTags.push(`납품장소('${newLocation}')`);
    } else if (plainLocMatch) {
      newLocation = plainLocMatch[1].trim();
      changeTags.push(`납품장소('${newLocation}')`);
    }

    // 5. PM / Staff change ("총괄책임자(PM)를 이준호에서 박서연으로 교체")
    const pmArrowMatch = text.match(
      /(?:총괄\s*책임자|연구\s*책임자|PM)(?:\([A-Za-z]+\))?(?:[을를은는])?\s*(?:기존\s+)?([가-힣]{2,3}|[가-힣]{4})(?:\s*(?:수석연구원|책임연구원|선임연구원|연구원|수석|책임|팀장|부장|과장|대리|님))?\s*(?:에서|->|→)\s*([가-힣]{2,3}|[가-힣]{4})(?:\s*(?:수석연구원|책임연구원|선임연구원|연구원|수석|책임|팀장|부장|과장|대리|님))?(?:으로|로)?/
    );
    const pmSimpleMatch = text.match(
      /(?:총괄\s*책임자|연구\s*책임자|PM)(?:\([A-Za-z]+\))?(?:[을를은는])?\s*([가-힣]{2,3}|[가-힣]{4})(?:\s*(?:수석연구원|책임연구원|선임연구원|연구원|수석|책임|팀장|부장|과장|대리|님))?\s*(?:으로|로)\s*(?:교체|변경)/
    );
    if (pmArrowMatch) {
      newPm = pmArrowMatch[2].trim();
      changeTags.push(`총괄책임자(PM) ${oldPm}→${newPm}`);
    } else if (pmSimpleMatch) {
      newPm = pmSimpleMatch[1].trim();
      changeTags.push(`총괄책임자(PM) →${newPm}`);
    }

    // 6. Delivery shortage ("1개 부족", "검수 보류")
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
      new_location: newLocation,
      new_pm: newPm,
      delivery_shortage: shortageQty,
      reason_summary: changeTags.length ? changeTags.join(" · ") : "텍스트 기반 변경 검토",
      used_live_llm: false,
      base_due_date: oldDue,
      base_di_date: di.delivery_date || oldDue,
      base_location: oldLoc,
      base_pm: oldPm,
    };
  }

  async function tryCallBazeChangeAnalysis(text, baseCase, apiKey) {
    const q = baseCase.doc_chain.quotation;
    const po = baseCase.doc_chain.purchase_order;
    const loc = baseCase.delivery_location || baseCase.doc_chain.delivery_inspection?.delivery_location || "";
    const pm = baseCase.pm_name || "이준호";
    const sys = `당신은 '${companyProfile.name}' 행정 변경관리 AI 비서입니다.
현재 문서 JSON 상태와 거래처 변경 요청 메일을 비교해 JSON만 반환하세요.
스키마: {"target_item_index":0,"new_qty":숫자,"new_unit_price":숫자,"new_due_date":"YYYY-MM-DD","new_location":"납품장소","new_pm":"성명","delivery_shortage":0,"reason_summary":"한줄 요약"}`;
    const userMsg = `[현재] 1번=${q.items[0].name} | 수량=${q.items[0].qty} | 단가=${q.items[0].unit_price} | 납기=${po.due_date} | 장소=${loc} | PM=${pm}\n\n[거래처 요청]\n${text}`;

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

  function computeImpactMatrix(baseCase, proposal) {
    const revs = ensureDocRevisions(baseCase);
    const q = baseCase.doc_chain.quotation;
    const po = baseCase.doc_chain.purchase_order;
    const di = baseCase.doc_chain.delivery_inspection;
    const idx = proposal.target_item_index || 0;
    const it = q.items[idx] || q.items[0];
    const oldDue = po.due_date || "-";
    const oldLoc = baseCase.delivery_location || di.delivery_location || "";
    const oldPm = baseCase.pm_name || "이준호";

    const qtyChanged = proposal.new_qty !== it.qty;
    const priceChanged = proposal.new_unit_price !== it.unit_price;
    const moneyChanged = qtyChanged || priceChanged;
    const dueChanged = proposal.new_due_date !== oldDue;
    const locChanged = Boolean(proposal.new_location && proposal.new_location !== oldLoc);
    const pmChanged = Boolean(proposal.new_pm && proposal.new_pm !== oldPm);
    const shortChanged = (proposal.delivery_shortage || 0) !== (baseCase.shortage_qty || 0);

    const reasons = {
      quotation: moneyChanged
        ? `품목 수량·단가 및 총액 재산정 필요`
        : `수량·단가·총액 변동 없음`,
      purchase_order:
        qtyChanged || dueChanged || locChanged
          ? [
              qtyChanged ? `수량 ${it.qty}→${proposal.new_qty}` : "",
              dueChanged ? `납기 ${oldDue}→${proposal.new_due_date}` : "",
              locChanged ? `납품장소 변경` : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : `발주 수량·납기·작업지시 변동 없음`,
      delivery_inspection:
        qtyChanged || dueChanged || locChanged || shortChanged
          ? [
              shortChanged ? `실납품 ${proposal.delivery_shortage}개 부족(검수보류)` : "",
              qtyChanged ? `검수기준 수량 ${proposal.new_qty}` : "",
              dueChanged ? `검수예정일 조정` : "",
              locChanged ? `납품장소 '${proposal.new_location}' 반영` : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : `검수 수량·일정·납품처 변동 없음`,
      expense_approval: moneyChanged
        ? `집행 예산(총액) 변경으로 재결재 품의 필요`
        : `지출 총액 변동 없어 품의서 재결재 불필요`,
      form_company_staff: pmChanged
        ? `총괄책임자(PM) ${oldPm}→${proposal.new_pm} 참여인력표 현행화`
        : `기업 일반현황·참여인력 변동 없음`,
      form_project_plan:
        pmChanged || dueChanged || locChanged || moneyChanged
          ? [
              pmChanged ? `총괄책임자(${proposal.new_pm}) 반영` : "",
              dueChanged ? `추진일정·기한 조정` : "",
              locChanged ? `설치·납품장소 현행화` : "",
              moneyChanged ? `제안 총액 조정` : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : `수행목표·일정·인력·장소 변동 없음`,
    };

    const impactedMap = {
      quotation: moneyChanged,
      purchase_order: qtyChanged || dueChanged || locChanged,
      delivery_inspection: qtyChanged || dueChanged || locChanged || shortChanged,
      expense_approval: moneyChanged,
      form_company_staff: pmChanged,
      form_project_plan: pmChanged || dueChanged || locChanged || moneyChanged,
    };

    return DOC_REGISTRY.map((meta) => {
      const currentRev = revs[meta.id] || 1;
      const impacted = Boolean(impactedMap[meta.id]);
      return {
        ...meta,
        impacted,
        reason: reasons[meta.id],
        currentRev,
        nextRev: impacted ? currentRev + 1 : currentRev,
      };
    });
  }

  function addRevisionSuffix(docNo, revNum) {
    const clean = String(docNo || "DOC-2026").replace(/-Rev\d+$/i, "");
    return revNum <= 1 ? clean : `${clean}-Rev${revNum}`;
  }

  function buildProposedCaseSelective(baseCase, proposal, selectedDocIds) {
    const next = deepClone(baseCase);
    const revs = ensureDocRevisions(next);
    const selected = new Set(selectedDocIds || []);

    const q = next.doc_chain.quotation;
    const po = next.doc_chain.purchase_order;
    const di = next.doc_chain.delivery_inspection;
    const ap = next.doc_chain.expense_approval;
    const idx = proposal.target_item_index || 0;

    const oldQty = q.items[idx]?.qty ?? 1;
    const oldPrice = q.items[idx]?.unit_price ?? 0;
    const oldDue = po.due_date || "2026-12-20";
    const oldLoc = next.delivery_location || di.delivery_location || "";
    const oldPm = next.pm_name || "이준호";

    const qtyChanged = proposal.new_qty !== oldQty;
    const dueChanged = proposal.new_due_date !== oldDue;
    const locChanged = Boolean(proposal.new_location && proposal.new_location !== oldLoc);
    const pmChanged = Boolean(proposal.new_pm && proposal.new_pm !== oldPm);
    const shortVal = proposal.delivery_shortage || 0;

    if (selected.has("quotation") && q.items[idx]) {
      q.items[idx].qty = Math.max(1, parseInt(proposal.new_qty, 10) || oldQty);
      q.items[idx].unit_price = Math.max(0, parseInt(proposal.new_unit_price, 10) || oldPrice);
      q.items[idx].supply_amount = q.items[idx].qty * q.items[idx].unit_price;
      const totalSupply = q.items.reduce((acc, it) => acc + it.qty * it.unit_price, 0);
      q.total_supply = totalSupply;
      q.vat = Math.round(totalSupply * 0.1);
      q.grand_total = totalSupply + q.vat;

      revs.quotation = (revs.quotation || 1) + 1;
      q.doc_no = addRevisionSuffix(q.doc_no, revs.quotation);
      q.notes = `[Rev.${revs.quotation} 변경반영: ${proposal.reason_summary}] ${String(q.notes || "").replace(/^\[Rev\.\d+[^\]]*\]\s*/, "")}`;
    }

    if (selected.has("purchase_order")) {
      if (po.items[idx] && qtyChanged) {
        po.items[idx].qty = Math.max(1, parseInt(proposal.new_qty, 10) || po.items[idx].qty);
      }
      if (dueChanged) {
        po.due_date = proposal.new_due_date;
      }
      if (locChanged) {
        po.instructions = `[납품처 변경: ${proposal.new_location}] ${String(po.instructions || "").replace(/^\[납품처 변경:[^\]]*\]\s*/, "")}`;
      }
      revs.purchase_order = (revs.purchase_order || 1) + 1;
      po.doc_no = addRevisionSuffix(po.doc_no, revs.purchase_order);
    }

    if (selected.has("delivery_inspection")) {
      next.shortage_qty = shortVal;
      if (di.items[idx]) {
        if (qtyChanged) {
          di.items[idx].ordered_qty = Math.max(1, parseInt(proposal.new_qty, 10) || di.items[idx].ordered_qty);
        }
        const ord = di.items[idx].ordered_qty;
        const deliv = Math.max(0, ord - shortVal);
        di.items[idx].delivered_qty = deliv;
        di.items[idx].passed_qty = deliv;
        di.items[idx].result = deliv === ord ? "적합" : "수량불일치(보류)";
      }
      if (dueChanged) {
        di.delivery_date = shiftIsoDate(proposal.new_due_date, -2);
      }
      if (locChanged) {
        di.delivery_location = proposal.new_location;
        next.delivery_location = proposal.new_location;
      }
      if (shortVal > 0) {
        di.inspector_note = `[검수 보류 알림] 1번 품목 ${shortVal}개 부족 납품 확인 — 잔여분 재납품 후 최종 합격 처리 요망.`;
      }
      revs.delivery_inspection = (revs.delivery_inspection || 1) + 1;
      di.doc_no = addRevisionSuffix(di.doc_no, revs.delivery_inspection);
    }

    if (selected.has("expense_approval")) {
      ap.total_supply = q.total_supply;
      ap.vat = q.vat;
      ap.grand_total = q.grand_total;
      revs.expense_approval = (revs.expense_approval || 1) + 1;
      ap.doc_no = addRevisionSuffix(ap.doc_no, revs.expense_approval);
    }

    if (selected.has("form_company_staff")) {
      if (pmChanged) next.pm_name = proposal.new_pm;
      revs.form_company_staff = (revs.form_company_staff || 1) + 1;
    }

    if (selected.has("form_project_plan")) {
      if (pmChanged) next.pm_name = proposal.new_pm;
      if (locChanged) next.delivery_location = proposal.new_location;
      revs.form_project_plan = (revs.form_project_plan || 1) + 1;
    }

    next.doc_revisions = revs;
    next.revision = Math.max(...Object.values(revs));
    next.last_change_summary = proposal.reason_summary;
    recalcCaseTotals(next, { syncFromQuotation: false });
    return next;
  }

  function buildReplyEmailDraft(baseCase, afterCase, proposal, selectedDocIds) {
    const selected = new Set(selectedDocIds || []);
    const oldRevs = ensureDocRevisions(baseCase);
    const newRevs = ensureDocRevisions(afterCase);
    const qOld = baseCase.doc_chain.quotation;
    const qNew = afterCase.doc_chain.quotation;
    const poNew = afterCase.doc_chain.purchase_order;
    const diNew = afterCase.doc_chain.delivery_inspection;
    const idx = proposal.target_item_index || 0;
    const itemOld = qOld.items[idx] || qOld.items[0];
    const itemNew = qNew.items[idx] || qNew.items[0];
    const deltaTotal = qNew.grand_total - qOld.grand_total;

    const revisedList = DOC_REGISTRY.filter((d) => selected.has(d.id)).map(
      (d) => `${d.name} (Rev.${oldRevs[d.id] || 1}→Rev.${newRevs[d.id] || 1})`
    );
    const keptList = DOC_REGISTRY.filter((d) => !selected.has(d.id)).map(
      (d) => `${d.name} (Rev.${oldRevs[d.id] || 1} 유지)`
    );

    const lines = [
      `제목: [선별 개정확인] ${qNew.project_name} (${qNew.doc_no}) 변경 요청 검토 회신`,
      `수신: ${qNew.recipient} 담당자님`,
      `발신: ${companyProfile.name} ${companyProfile.contact} (${companyProfile.phone})`,
      "",
      `안녕하십니까, ${companyProfile.name} ${companyProfile.contact}입니다.`,
      `요청 주신 사항에 대해 전체 6종 관리 서류의 영향도를 판별하여, 변경이 필요한 ${revisedList.length}종 서류만 선별 개정하고 무관한 ${keptList.length}종은 원안을 유지하여 회신드립니다.`,
      "",
      `1. 변경 핵심 내역`,
    ];

    if (itemOld.qty !== itemNew.qty) {
      lines.push(` - 계약 수량 (${idx + 1}번 품목): ${num(itemOld.qty)}${itemOld.unit} → ${num(itemNew.qty)}${itemNew.unit} (${itemNew.qty > itemOld.qty ? "+" : ""}${num(itemNew.qty - itemOld.qty)}${itemOld.unit})`);
    }
    if (itemOld.unit_price !== itemNew.unit_price) {
      lines.push(` - 품목 단가: ${won(itemOld.unit_price)} → ${won(itemNew.unit_price)}`);
    }
    if ((baseCase.doc_chain.purchase_order.due_date || "-") !== (poNew.due_date || "-")) {
      lines.push(` - 납품 기한: ${baseCase.doc_chain.purchase_order.due_date} → ${poNew.due_date} (검수 예정일: ${diNew.delivery_date})`);
    }
    const oldLoc = baseCase.delivery_location || baseCase.doc_chain.delivery_inspection?.delivery_location || "-";
    const newLoc = afterCase.delivery_location || diNew.delivery_location || "-";
    if (oldLoc !== newLoc) {
      lines.push(` - 납품·설치 장소: ${oldLoc} → ${newLoc}`);
    }
    if ((baseCase.pm_name || "-") !== (afterCase.pm_name || "-")) {
      lines.push(` - 총괄책임자(PM): ${baseCase.pm_name} → ${afterCase.pm_name}`);
    }
    if ((proposal.delivery_shortage || 0) > 0 && selected.has("delivery_inspection")) {
      const deliv = diNew.items[idx]?.delivered_qty ?? 0;
      lines.push(` - 납품 검수 알림: 발주 ${num(itemNew.qty)} 대비 실납품 ${num(deliv)} 확인 (${num(proposal.delivery_shortage)}${itemNew.unit} 부족 → '수량불일치(보류)' 판정)`);
      lines.push(` - 후속 조치: 확인 수량 우선 검수 후 부족분 ${num(proposal.delivery_shortage)}${itemNew.unit}는 3영업일 내 추가 직송 예정입니다.`);
    }

    lines.push("");
    lines.push("2. 서류별 선별 개정 현황");
    lines.push(` - 개정(수정) 서류 (${revisedList.length}종): ${revisedList.length ? revisedList.join(", ") : "없음"}`);
    lines.push(` - 원안 유지 서류 (${keptList.length}종): ${keptList.length ? keptList.join(", ") : "없음"}`);

    lines.push("");
    if (deltaTotal !== 0) {
      lines.push("3. 금액 변동 요약 (부가세 10% 포함)");
      lines.push(` - 변경 전 총액: ${won(qOld.grand_total)} (공급가액 ${won(qOld.total_supply)} + VAT ${won(qOld.vat)})`);
      lines.push(` - 변경 후 총액: ${won(qNew.grand_total)} (공급가액 ${won(qNew.total_supply)} + VAT ${won(qNew.vat)})`);
      lines.push(` - 총액 증감 차액: ${deltaTotal >= 0 ? "+" : ""}${won(deltaTotal)}`);
    } else {
      lines.push(`3. 금액 변동 요약: 계약 총액 변동 없음 (기존 ${won(qOld.grand_total)} 원안 유지)`);
    }

    lines.push("");
    lines.push(`개정 반영된 서류 및 기관 제출용 .hwpx 파일을 첨부드리오니 확인 후 회신 부탁드립니다.`);
    lines.push(`감사합니다.`);
    lines.push("");
    lines.push(`--`);
    lines.push(`${companyProfile.name} | 대표 ${companyProfile.ceo} | 사업자번호 ${companyProfile.biz_no}`);
    lines.push(`${companyProfile.addr} | 입금계좌: ${companyProfile.bank}`);
    return lines.join("\n");
  }

  function renderImpactMatrix(impactRows, selectedDocIds, proposal) {
    const selected = new Set(selectedDocIds);
    el("impactMatrixBox").innerHTML = `
      <table class="meta-table impact-matrix">
        <thead>
          <tr>
            <th style="width: 7%; text-align: center;">선택</th>
            <th style="width: 11%; text-align: center;">영향 판정</th>
            <th style="width: 34%;">관리 서류 (6종 레지스트리)</th>
            <th style="width: 34%;">AI 영향 분석 근거</th>
            <th style="width: 14%; text-align: center;">버전 변화</th>
          </tr>
        </thead>
        <tbody>
          ${impactRows
            .map((row) => {
              const checked = selected.has(row.id);
              const nextRev = checked ? row.currentRev + 1 : row.currentRev;
              return `
                <tr class="${checked ? "impacted" : "untouched"}">
                  <td class="center"><input type="checkbox" class="impact-check" data-doc-id="${esc(row.id)}" ${checked ? "checked" : ""} /></td>
                  <td class="center"><span class="status-tag ${checked ? "fail" : "pass"}">${checked ? "수정 필요" : "유지"}</span></td>
                  <td><strong>${esc(row.name)}</strong></td>
                  <td>${esc(row.reason)}</td>
                  <td class="center mono">${checked ? `Rev.${row.currentRev} → <strong>Rev.${nextRev}</strong>` : `Rev.${row.currentRev} 유지`}</td>
                </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;

    el("impactMatrixBox").querySelectorAll(".impact-check").forEach((cb) => {
      cb.addEventListener("change", () => {
        if (!pendingProposal) return;
        const checkedIds = Array.from(el("impactMatrixBox").querySelectorAll(".impact-check:checked")).map(
          (node) => node.dataset.docId
        );
        pendingProposal.selectedDocIds = checkedIds;
        pendingProposal.afterCase = buildProposedCaseSelective(activeCase, proposal, checkedIds);
        renderImpactMatrix(impactRows, checkedIds, proposal);
        renderChangeDiffAndReply(activeCase, pendingProposal.afterCase, proposal, checkedIds);
      });
    });
  }

  function renderChangeDiffAndReply(baseCase, afterCase, proposal, selectedDocIds) {
    const selected = selectedDocIds || [];
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
    const totalDelta = qNew.grand_total - qOld.grand_total;
    const delivOld = diOld.items[idx]?.delivered_qty ?? itOld.qty;
    const delivNew = diNew.items[idx]?.delivered_qty ?? itNew.qty;
    const dueChanged = (poOld.due_date || "-") !== (poNew.due_date || "-");
    const oldLoc = baseCase.delivery_location || diOld.delivery_location || "-";
    const newLoc = afterCase.delivery_location || diNew.delivery_location || "-";
    const locChanged = oldLoc !== newLoc;
    const pmOld = baseCase.pm_name || "이준호";
    const pmNew = afterCase.pm_name || "이준호";
    const pmChanged = pmOld !== pmNew;
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
        field: "납품 기한 (발주서 · 계획서)",
        before: poOld.due_date || "-",
        after: poNew.due_date || "-",
        delta: dueChanged ? "일정 변경 반영" : "변동 없음",
        cls: dueChanged ? "changed" : "",
      },
      {
        field: "납품 · 설치장소",
        before: oldLoc,
        after: newLoc,
        delta: locChanged ? "장소 변경 반영" : "변동 없음",
        cls: locChanged ? "changed" : "",
      },
      {
        field: "총괄책임자 (PM)",
        before: pmOld,
        after: pmNew,
        delta: pmChanged ? "인력 교체 반영" : "변동 없음",
        cls: pmChanged ? "changed" : "",
      },
      {
        field: "실납품 수량 / 3-Way 판정",
        before: `${num(delivOld)}${itOld.unit} (${statusOld})`,
        after: `${num(delivNew)}${itNew.unit} (${statusNew})`,
        delta: delivNew < (diNew.items[idx]?.ordered_qty ?? itNew.qty) ? `${num((diNew.items[idx]?.ordered_qty ?? itNew.qty) - delivNew)}${itNew.unit} 부족(보류)` : "전량 일치",
        cls: delivNew < (diNew.items[idx]?.ordered_qty ?? itNew.qty) ? "deficit" : "",
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
            <th style="width: 31%;">대조 항목</th>
            <th style="width: 23%;">변경 전</th>
            <th style="width: 23%;">변경 후 (선택 반영)</th>
            <th style="width: 23%;">증감 · 판정</th>
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

    el("replyDraftBox").textContent = buildReplyEmailDraft(baseCase, afterCase, proposal, selected);
    el("applyChangeBtn").disabled = selected.length === 0;
    el("applyChangeBtn").textContent =
      selected.length === 0 ? "선택된 서류 없음" : `선택된 ${selected.length}개 서류만 개정 반영`;
    el("copyReplyBtn").disabled = false;
    el("changeStatusLine").style.color = "var(--navy)";
    el("changeStatusLine").textContent = `[영향 판별 완료 · ${proposal.used_live_llm ? "BAZE LLM" : "규칙·문맥 분석"}] ${proposal.reason_summary} → 6종 중 ${selected.length}종 개정 대상 (${6 - selected.length}종은 Rev.1 유지)`;
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
    status.textContent = "변경요청 내용 파싱 및 6종 서류 영향도(Impact Analysis) 분석 중...";

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

    const impactRows = computeImpactMatrix(activeCase, proposal);
    const selectedDocIds = impactRows.filter((r) => r.impacted).map((r) => r.id);
    const afterCase = buildProposedCaseSelective(activeCase, proposal, selectedDocIds);
    pendingProposal = { proposal, impactRows, selectedDocIds, afterCase };

    renderImpactMatrix(impactRows, selectedDocIds, proposal);
    renderChangeDiffAndReply(activeCase, afterCase, proposal, selectedDocIds);
  }

  async function loadPresetHwpxIntoWorkbench(templateFile, downloadSuffix) {
    if (!activeCase) return;
    const status = el("templateStatusLine");
    status.style.color = "var(--navy)";
    status.textContent = `기관 양식(${templateFile}) 구조 스캔 중...`;
    try {
      const resp = await fetch(`templates/${templateFile}?v=${ASSET_VER}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      await openFormWorkbenchFromBuffer(buf, `${activeCase.id}_${downloadSuffix}.hwpx`);
    } catch (err) {
      status.style.color = "var(--fail)";
      status.textContent = `[오류] 양식 로드 실패: ${err.message}`;
    }
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

    // Registered Company Knowledge Base inputs (live binding + localStorage persistence)
    [
      "profName",
      "profBizNo",
      "profCeo",
      "profContact",
      "profAddr",
      "profPhone",
      "profCerts",
      "profBank",
      "profEstRev",
      "profCapability",
      "profStaff",
      "profTrackRecord",
    ].forEach((id) => {
      el(id)?.addEventListener("input", () => {
        readProfileInputs();
        if (activeCase) {
          applyProfileToCase(activeCase);
          renderSheet(activeCase);
          refreshOpenWorkbenchIfVisible();
          if (pendingProposal) {
            applyProfileToCase(pendingProposal.afterCase);
            el("replyDraftBox").textContent = buildReplyEmailDraft(
              activeCase,
              pendingProposal.afterCase,
              pendingProposal.proposal,
              pendingProposal.selectedDocIds
            );
          }
        }
      });
    });

    el("resetProfileBtn")?.addEventListener("click", () => {
      companyProfile = { ...DEFAULT_PROFILE };
      syncProfileInputs();
      saveProfile();
      if (activeCase) {
        activeCase.pm_name = parseStaffRows(companyProfile.staff_text)[0]?.name || "이준호";
        applyProfileToCase(activeCase);
        renderSheet(activeCase);
        refreshOpenWorkbenchIfVisible();
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
      refreshOpenWorkbenchIfVisible();
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
      triggerDownloadBlob(blob, `${activeCase.id}_Rev${activeCase.revision || 1}_managed6.json`);
    });

    // Preset Institutional HWPX Form Workbench Buttons
    el("presetFormQuoteBtn")?.addEventListener("click", () => {
      const revs = activeCase ? ensureDocRevisions(activeCase) : { quotation: 1 };
      loadPresetHwpxIntoWorkbench("standard_quote_submit_template.hwpx", `Rev${revs.quotation}_견적제출양식`);
    });
    el("presetFormStaffBtn")?.addEventListener("click", () => {
      const revs = activeCase ? ensureDocRevisions(activeCase) : { form_company_staff: 1 };
      loadPresetHwpxIntoWorkbench("agency_company_staff_template.hwpx", `Rev${revs.form_company_staff}_업체일반현황_인력표`);
    });
    el("presetFormPlanBtn")?.addEventListener("click", () => {
      const revs = activeCase ? ensureDocRevisions(activeCase) : { form_project_plan: 1 };
      loadPresetHwpxIntoWorkbench("agency_project_plan_template.hwpx", `Rev${revs.form_project_plan}_사업수행계획서`);
    });

    // User Custom HWPX Template Upload & Structural Slot Analysis
    const cti = el("customTemplateInput");
    el("uploadCustomTemplateBtn")?.addEventListener("click", () => cti?.click());
    cti?.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const buf = await f.arrayBuffer();
      await openFormWorkbenchFromBuffer(buf, `filled_${f.name}`);
      cti.value = "";
    });

    el("downloadAnalyzedHwpxBtn")?.addEventListener("click", async () => {
      if (!activeFormBuffer || !activeFormPlan) return;
      const status = el("templateStatusLine");
      try {
        const res = await window.HwpBrowserParser.applySlotPlanToHwpx(
          activeFormBuffer,
          activeFormPlan.slots
        );
        triggerDownloadBlob(res.blob, activeFormFilename);
        status.style.color = "var(--navy)";
        status.textContent = `[다운로드 완료] '${activeFormFilename}' 저장 완료 (${res.filledCount}개 항목/빈 칸 기입 반영)`;
      } catch (err) {
        status.style.color = "var(--fail)";
        status.textContent = `[오류] HWPX 저장 실패: ${err.message}`;
      }
    });

    el("closeWorkbenchBtn")?.addEventListener("click", () => {
      el("formWorkbenchPreview")?.classList.add("hidden");
    });

    el("downloadErpCsvBtn")?.addEventListener("click", () => {
      if (activeCase) exportErpCsv(activeCase);
    });

    // Step 04 Scenario Presets (4 selective scenarios) & Impact Analysis
    document.querySelectorAll(".scenario-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!activeCase) return;
        const first = activeCase.doc_chain.quotation.items[0];
        const due = activeCase.doc_chain.purchase_order.due_date || "2026-12-20";
        const sc = btn.dataset.scenario;
        if (sc === "qty_due") {
          el("changeRequestInput").value =
            `담당자님, ${activeCase.doc_chain.quotation.project_name} 건에서 1번 품목(${first.name}) 납품 수량을 100개에서 120개로 변경하고, 납기는 기존(${due}) 대비 7일 연장해 주세요. 견적·발주·납품·품의·수행계획서 반영 후 회신 부탁드립니다.`;
        } else if (sc === "due_location") {
          el("changeRequestInput").value =
            `발주기관 연구실 요청입니다. 시험실 공사 일정으로 납기를 기존(${due}) 대비 10일 연장해 주시고, 납품장소는 기존 위치에서 '제2연구동 1층 계측기 반입구'로 변경 부탁드립니다. 계약 수량·단가(총액) 및 참여인력은 변동 없습니다.`;
        } else if (sc === "pm_change") {
          const oldPm = activeCase.pm_name || "이준호";
          const nextPm = oldPm === "박서연" ? "이준호" : "박서연";
          el("changeRequestInput").value =
            `발주처 협의에 따라 본 과업의 총괄책임자(PM)를 기존 ${oldPm} 수석에서 ${nextPm} 책임연구원으로 교체하고자 합니다. 견적 금액·수량·납기 일정에는 변동이 없으니 인력현황표와 사업수행계획서만 개정해 주세요.`;
        } else if (sc === "short_delivery") {
          el("changeRequestInput").value =
            `현장 물류 출고 확인 결과 금일 1번 품목(${first.name})이 1개 부족 납품될 예정입니다. 견적·발주 수량은 유지하고 납품검수조서만 보류 처리 및 잔여분 재납품 일정 회신 요청드립니다.`;
        }
        analyzeChangeRequestText();
      });
    });

    el("analyzeChangeBtn")?.addEventListener("click", analyzeChangeRequestText);

    el("applyChangeBtn")?.addEventListener("click", () => {
      if (!pendingProposal || !pendingProposal.afterCase) return;
      const count = (pendingProposal.selectedDocIds || []).length;
      activeCase = deepClone(pendingProposal.afterCase);
      renderAll();
      refreshOpenWorkbenchIfVisible();
      el("applyChangeBtn").disabled = true;
      el("revertRevBtn").disabled = false;
      el("changeStatusLine").style.color = "var(--navy)";
      el("changeStatusLine").textContent =
        `[선별 반영 완료] 선택된 ${count}종 서류만 개정되고 나머지 ${6 - count}종은 Rev.1을 유지했습니다. Step 03 탭 버전과 기관 양식(.hwpx)을 확인하세요.`;
    });

    el("revertRevBtn")?.addEventListener("click", () => {
      if (!baselineCase) return;
      activeCase = deepClone(baselineCase);
      recalcCaseTotals(activeCase);
      resetChangeRequestPanel();
      renderAll();
      refreshOpenWorkbenchIfVisible();
      el("changeStatusLine").textContent = "[복원] 관리 대상 6종 서류 모두 최초 기안 상태(Rev.1)로 되돌렸습니다.";
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
