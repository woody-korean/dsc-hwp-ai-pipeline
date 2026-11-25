(function () {
  const ASSET_VER = "20261125b";
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
    { id: "quotation", name: "1. 표준 견적서", kind: "핵심 기본 서류" },
    { id: "purchase_order", name: "2. 발주서 · 작업지시서", kind: "핵심 기본 서류" },
    { id: "delivery_inspection", name: "3. 거래명세 · 납품검수조서", kind: "핵심 기본 서류" },
    { id: "expense_approval", name: "4. 지출결의 · 내부품의서", kind: "핵심 기본 서류" },
    { id: "form_company_staff", name: "5. 업체 일반현황 · 참여인력표 (.hwpx)", kind: "기관 제출 양식" },
    { id: "form_project_plan", name: "6. 사업수행계획서 요약 (.hwpx)", kind: "기관 제출 양식" },
  ];

  let cases = [];
  let activeCase = null;
  let baselineCase = null;
  let pendingProposal = null;
  let companyProfile = { ...DEFAULT_PROFILE };

  let activeFormKey = "kimm";
  let activeFormBuffer = null;
  let activeFormFilename = "";
  let activeFormPlan = null;
  let activeB4Doc = "quotation";
  let activePromptKey = "step1_prep";
  let checkedItems = {};

  const el = (id) => document.getElementById(id);

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function num(n) {
    return Number(n || 0).toLocaleString("ko-KR");
  }

  function won(n) {
    return num(n) + "원";
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

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

  function ensureRevs(c) {
    c.doc_revisions = { ...defaultRevisions(), ...(c.doc_revisions || {}) };
    return c.doc_revisions;
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
      // Ignore storage failures in restricted modes
    }
  }

  function syncProfileInputs() {
    const map = {
      eProfName: "name",
      eProfBizNo: "biz_no",
      eProfCeo: "ceo",
      eProfContact: "contact",
      eProfPhone: "phone",
      eProfAddr: "addr",
      eProfStaff: "staff_text",
      eProfTrack: "track_record_text",
    };
    Object.entries(map).forEach(([id, key]) => {
      const node = el(id);
      if (node) node.value = companyProfile[key] || "";
    });
    if (el("easyProfilePreview")) {
      el("easyProfilePreview").textContent = `${companyProfile.name} · 대표 ${companyProfile.ceo} · 클릭해 수정`;
    }
  }

  function readProfileInputs() {
    companyProfile = {
      ...companyProfile,
      name: (el("eProfName")?.value || "").trim() || DEFAULT_PROFILE.name,
      biz_no: (el("eProfBizNo")?.value || "").trim() || DEFAULT_PROFILE.biz_no,
      ceo: (el("eProfCeo")?.value || "").trim() || DEFAULT_PROFILE.ceo,
      contact: (el("eProfContact")?.value || "").trim() || DEFAULT_PROFILE.contact,
      phone: (el("eProfPhone")?.value || "").trim() || DEFAULT_PROFILE.phone,
      addr: (el("eProfAddr")?.value || "").trim() || DEFAULT_PROFILE.addr,
      staff_text: (el("eProfStaff")?.value || "").trim() || DEFAULT_PROFILE.staff_text,
      track_record_text: (el("eProfTrack")?.value || "").trim() || DEFAULT_PROFILE.track_record_text,
    };
    if (el("easyProfilePreview")) {
      el("easyProfilePreview").textContent = `${companyProfile.name} · 대표 ${companyProfile.ceo} · 클릭해 수정`;
    }
    saveProfile();
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

  function recalcTotals(c) {
    applyProfileToCase(c);
    ensureRevs(c);
    const q = c.doc_chain.quotation;
    const ap = c.doc_chain.expense_approval;
    let totalSupply = 0;
    q.items.forEach((it) => {
      it.qty = Math.max(1, parseInt(it.qty, 10) || 1);
      it.unit_price = Math.max(0, parseInt(it.unit_price, 10) || 0);
      it.supply_amount = it.qty * it.unit_price;
      totalSupply += it.supply_amount;
    });
    q.total_supply = totalSupply;
    q.vat = Math.round(totalSupply * 0.1);
    q.grand_total = totalSupply + q.vat;
    ap.total_supply = totalSupply;
    ap.vat = q.vat;
    ap.grand_total = q.grand_total;
  }

  function triggerDownloadBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function copyTextWithFeedback(txt, btn, defaultLabel) {
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      if (btn) {
        btn.textContent = "복사 완료!";
        setTimeout(() => {
          btn.textContent = defaultLabel;
        }, 1600);
      }
    } catch (_) {
      if (btn) btn.textContent = "직접 드래그해 복사하세요";
    }
  }

  /* ---------- STEP 1: Plain-Korean Notice Summary ---------- */
  function renderStep1Summary(c) {
    const s = c.source_summary || {};
    const q = c.doc_chain.quotation;
    const po = c.doc_chain.purchase_order;
    const agencyClean = String(s.issuing_agency || "공고 기관").replace(/\(.*사용자 제공.*\)/g, "").trim() || "한국표준과학연구원(KRISS)";
    const attList = (s.mandatory_attachments || []).slice(0, 3);
    const risks = (s.risk_alerts || []).slice(0, 3);

    el("easySummaryCards").innerHTML = `
      <div class="info-mini-card">
        <h3>📌 어떤 사업인가요?</h3>
        <ul>
          <li><strong>어디서 냈나요?</strong> ${esc(agencyClean)}</li>
          <li><strong>사업 이름:</strong> ${esc(s.document_title || q.project_name)}</li>
          <li><strong>예산 · 품목 규모:</strong> ${esc(s.budget_or_scale || won(q.grand_total))}</li>
          <li><strong>납품 목표일:</strong> ${esc(po.due_date || "-")}</li>
        </ul>
      </div>
      <div class="info-mini-card">
        <h3>📋 무엇을 내고 뭘 챙겨야 하나요?</h3>
        <ul>
          ${attList.length ? attList.map((a) => `<li>${esc(a)}</li>`).join("") : "<li>공고 첨부 지정양식 및 견적서 일체</li>"}
          <li><strong>사내 준비물:</strong> 사업자·인력현황(${esc(c.pm_name || "이준호")} 외), 수행실적, 대표 직인</li>
        </ul>
      </div>
      <div class="info-mini-card warn">
        <h3>⚠️ 놓치면 안 되는 주의사항!</h3>
        <ul>
          ${risks.length ? risks.map((r) => `<li><strong>${esc(r.title)}:</strong> ${esc(r.detail)}</li>`).join("") : "<li>입찰 마감일과 정품·규격 증빙 요건을 반드시 확인하세요.</li>"}
        </ul>
      </div>
    `;
  }

  /* ---------- STEP 2: Universal HWPX Filler & Basic 4 Docs ---------- */
  function buildFormContext(c) {
    const revs = ensureRevs(c);
    const q = c.doc_chain.quotation;
    const po = c.doc_chain.purchase_order;
    const di = c.doc_chain.delivery_inspection;
    const s = c.source_summary || {};
    const staffRows = getEffectiveStaffRows(c);
    const trackRows = parseTrackRows(companyProfile.track_record_text);
    const pmDisplay = c.pm_name || staffRows[0]?.name || companyProfile.ceo;
    const delivLoc = c.delivery_location || di.delivery_location || "발주기관 지정 장소";
    const itemSummary = (q.items || []).slice(0, 3).map((it) => `${it.name}(${num(it.qty)}${it.unit})`).join(", ");

    const placeholders = {
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
      REVISION_TAG: `Rev.${revs.quotation || 1}`,
      DOC_DATE: q.quote_date || "2026-11-23",
      DUE_DATE: po.due_date || di.delivery_date || "-",
      DELIVERY_LOCATION: delivLoc,
      PM_NAME: `${pmDisplay} (총괄책임자 · ${companyProfile.name})`,
      TOTAL_SUPPLY: won(q.total_supply),
      VAT_AMOUNT: won(q.vat),
      GRAND_TOTAL: won(q.grand_total),
      CHANGE_NOTE: c.last_change_summary || q.notes || "초기 견적·발주 기준 적합",
    };
    for (let i = 0; i < 4; i += 1) {
      const it = q.items[i];
      placeholders[`ITEM${i + 1}_NAME`] = it ? it.name : "";
      placeholders[`ITEM${i + 1}_SPEC`] = it ? it.spec : "";
      placeholders[`ITEM${i + 1}_UNIT`] = it ? it.unit : "";
      placeholders[`ITEM${i + 1}_QTY`] = it ? num(it.qty) : "";
      placeholders[`ITEM${i + 1}_PRICE`] = it ? num(it.unit_price) : "";
      placeholders[`ITEM${i + 1}_AMOUNT`] = it ? num(it.supply_amount) : "";
    }

    const kv = {
      ...placeholders,
      PM_NAME: `${pmDisplay} (${staffRows[0]?.title || "수석연구원"} / ${companyProfile.name})`,
      DELIVERY_LOCATION: delivLoc,
      PLAN_GOAL: `${s.issuing_agency || ""} '${s.document_title || q.project_name}' 요구 규격을 100% 충족하고 납기 내 안전 검수를 완료함.`,
      PLAN_SCOPE: `총괄책임자(PM) ${pmDisplay} 책임 하에 ${itemSummary} 제작·공급 및 시험성적서 제출 (총 제안액 ${won(q.grand_total)}).`,
      PLAN_SCHEDULE: `작업지시(${po.order_date}) → 정밀가공·검사 → 현장 납품(${delivLoc} / 납기 ${po.due_date}) → 검수 완료(${di.delivery_date}).`,
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

  function friendlySourcePill(src) {
    if (src === "기업자료") return `<span class="src-pill company">우리 회사 정보</span>`;
    if (src === "공고·서식 연동") return `<span class="src-pill notice">공고 · 계약 내용</span>`;
    if (src === "AI 초안") return `<span class="src-pill notice">AI 자동 초안</span>`;
    return `<span class="src-pill manual">직접 입력 필요</span>`;
  }

  function renderEasySlotTable() {
    if (!activeFormPlan) return;
    const filledCount = activeFormPlan.slots.filter((s) => String(s.value || "").trim() !== "").length;
    el("easyFormTitle").textContent =
      `[${activeFormPlan.formType}] · 빈칸 ${activeFormPlan.slots.length}곳 중 ${filledCount}곳 자동 입력 완료!`;

    const notice = el("easyHumanSafetyNotice");
    const hc = activeFormPlan.humanChecks || {};
    if ((hc.checkboxCellCount || 0) > 0 || hc.hasSignatureSeal) {
      notice.innerHTML =
        `🛡️ <strong>안전 보호 작동 중:</strong> 이 양식 안의 법적 체크칸(<strong>[ ] 예 / 아니오</strong> ${hc.checkboxCellCount || 0}곳)과 <strong>도장·서명란</strong>은 법적 허위기재 실수를 막기 위해 AI가 일부러 비워두었습니다. 직원이 내용을 확인한 뒤 직접 체크·날인해 주세요.`;
      notice.classList.remove("hidden");
    } else {
      notice.classList.add("hidden");
    }

    el("easySlotTableWrap").innerHTML = `
      <table class="easy-slot-table">
        <thead>
          <tr>
            <th style="width: 28%;">한글 양식 내 빈칸 항목</th>
            <th style="width: 18%;">어디서 가져왔나요?</th>
            <th style="width: 54%;">자동 입력된 내용 (클릭해 바로 수정 가능)</th>
          </tr>
        </thead>
        <tbody>
          ${activeFormPlan.slots
            .map(
              (s, i) => `
            <tr>
              <td><strong>${esc(s.label)}</strong><div style="font-size:11px;color:#64748b;">${esc(s.location)}</div></td>
              <td>${friendlySourcePill(s.source)}</td>
              <td><input type="text" class="easy-slot-input" data-idx="${i}" value="${esc(s.value)}" placeholder="필요 시 직접 입력" /></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;

    el("easySlotTableWrap").querySelectorAll(".easy-slot-input").forEach((inp) => {
      inp.addEventListener("input", (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (activeFormPlan && activeFormPlan.slots[idx]) {
          activeFormPlan.slots[idx].value = e.target.value;
        }
      });
    });
  }

  async function loadFormBuffer(buf, outFilename, formKey) {
    if (!activeCase || !window.HwpBrowserParser) return;
    activeFormKey = formKey;
    el("easyHwpxPanel").classList.remove("hidden");
    el("easyBasic4Panel").classList.add("hidden");
    updateFormTabHighlight();

    try {
      const plan = await window.HwpBrowserParser.analyzeHwpxForm(buf, buildFormContext(activeCase));
      activeFormBuffer = buf;
      activeFormFilename = outFilename;
      activeFormPlan = plan;
      renderEasySlotTable();
      el("easyFormStatus").textContent = "검토 후 왼쪽 파란 버튼을 누르면 바로 한글 파일(.hwpx)로 저장됩니다.";
    } catch (err) {
      el("easyFormTitle").textContent = "양식을 읽는 중 오류가 발생했습니다.";
      el("easyFormStatus").textContent = err.message;
    }
  }

  async function loadPresetForm(templateFile, suffix, formKey) {
    if (!activeCase) return;
    el("easyFormTitle").textContent = "한글 양식의 빈칸 위치를 AI가 찾고 있습니다...";
    try {
      const resp = await fetch(`templates/${templateFile}?v=${ASSET_VER}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      await loadFormBuffer(buf, `${activeCase.id}_${suffix}.hwpx`, formKey);
    } catch (err) {
      el("easyFormStatus").textContent = `불러오기 실패: ${err.message}`;
    }
  }

  async function refreshActiveEasyForm() {
    if (!activeFormBuffer || !activeCase || activeFormKey === "basic4") return;
    activeFormPlan = await window.HwpBrowserParser.analyzeHwpxForm(activeFormBuffer, buildFormContext(activeCase));
    renderEasySlotTable();
  }

  function updateFormTabHighlight() {
    el("easyFormKimmBtn")?.classList.toggle("active", activeFormKey === "kimm");
    el("easyFormStaffBtn")?.classList.toggle("active", activeFormKey === "staff");
    el("easyFormPlanBtn")?.classList.toggle("active", activeFormKey === "plan");
    el("easyFormBasic4Btn")?.classList.toggle("active", activeFormKey === "basic4");
  }

  function renderEasyBasic4Sheet() {
    if (!activeCase) return;
    const chain = activeCase.doc_chain;
    const container = el("easyA4Sheet");
    if (!container) return;

    document.querySelectorAll(".b4-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.doc === activeB4Doc);
    });

    if (activeB4Doc === "quotation") {
      const q = chain.quotation;
      container.innerHTML = `
        <div class="a4-head">
          <div><h3>표 준 견 적 서</h3><div style="font-size:12.5px;color:#475569;">문서번호 ${esc(q.doc_no)} | 견적일 ${esc(q.quote_date)}</div></div>
          <div style="font-size:12.5px;text-align:right;">공급자: <strong>${esc(companyProfile.name)}</strong><br/>대표 ${esc(companyProfile.ceo)}</div>
        </div>
        <table class="a4-table">
          <tr><th style="width:18%;">받는 곳</th><td>${esc(q.recipient)}</td><th style="width:18%;">건 명</th><td><strong>${esc(q.project_name)}</strong></td></tr>
          <tr><th>총 합계 (VAT포함)</th><td colspan="3" style="font-size:15px;"><strong>${won(q.grand_total)}</strong> (공급가액 ${won(q.total_supply)} + 부가세 ${won(q.vat)})</td></tr>
        </table>
        <table class="a4-table">
          <thead><tr><th>No</th><th>품명</th><th>규격</th><th>수량</th><th>단가(원)</th><th>공급가액(원)</th></tr></thead>
          <tbody>
            ${q.items.map((it, idx) => `<tr><td class="center">${idx + 1}</td><td>${esc(it.name)}</td><td>${esc(it.spec)}</td><td class="num">${num(it.qty)} ${esc(it.unit)}</td><td class="num">${num(it.unit_price)}</td><td class="num"><strong>${num(it.supply_amount)}</strong></td></tr>`).join("")}
          </tbody>
        </table>`;
    } else if (activeB4Doc === "purchase_order") {
      const po = chain.purchase_order;
      container.innerHTML = `
        <div class="a4-head">
          <div><h3>발 주 서 · 작 업 지 시 서</h3><div style="font-size:12.5px;color:#475569;">관리번호 ${esc(po.doc_no)} | 납기일 <strong>${esc(po.due_date)}</strong></div></div>
        </div>
        <table class="a4-table">
          <tr><th style="width:20%;">납품 장소</th><td>${esc(activeCase.delivery_location || chain.delivery_inspection?.delivery_location || "-")}</td><th style="width:20%;">총괄책임자(PM)</th><td><strong>${esc(activeCase.pm_name || "이준호")}</strong></td></tr>
        </table>
        <table class="a4-table">
          <thead><tr><th>No</th><th>품목명</th><th>작업 규격</th><th>수량</th><th>품질 기준</th></tr></thead>
          <tbody>
            ${po.items.map((it, idx) => `<tr><td class="center">${idx + 1}</td><td>${esc(it.name)}</td><td>${esc(it.spec_material)}</td><td class="num"><strong>${num(it.qty)}</strong></td><td>${esc(it.qc_standard)}</td></tr>`).join("")}
          </tbody>
        </table>
        <p style="font-size:12.5px;margin:0;"><strong>작업 지시:</strong> ${esc(po.instructions)}</p>`;
    } else if (activeB4Doc === "delivery_inspection") {
      const di = chain.delivery_inspection;
      container.innerHTML = `
        <div class="a4-head">
          <div><h3>거 래 명 세 · 납 품 검 수 조 서</h3><div style="font-size:12.5px;color:#475569;">검수번호 ${esc(di.doc_no)} | 검수예정일 ${esc(di.delivery_date)}</div></div>
        </div>
        <table class="a4-table">
          <tr><th style="width:20%;">납품 장소</th><td>${esc(di.delivery_location)}</td><th style="width:20%;">검수 기관</th><td>${esc(di.inspector_org)}</td></tr>
        </table>
        <table class="a4-table">
          <thead><tr><th>No</th><th>품명</th><th>발주수량</th><th>납품수량</th><th>합격수량</th><th>판정</th></tr></thead>
          <tbody>
            ${di.items.map((it, idx) => `<tr><td class="center">${idx + 1}</td><td>${esc(it.name)}</td><td class="num">${num(it.ordered_qty)}</td><td class="num">${num(it.delivered_qty)}</td><td class="num">${num(it.passed_qty)}</td><td class="center"><strong>${esc(it.result)}</strong></td></tr>`).join("")}
          </tbody>
        </table>`;
    } else {
      const ap = chain.expense_approval;
      container.innerHTML = `
        <div class="a4-head">
          <div><h3>지 출 결 의 · 내 부 품 의 서</h3><div style="font-size:12.5px;color:#475569;">품의번호 ${esc(ap.doc_no)} | 기안자 ${esc(ap.drafter)}</div></div>
        </div>
        <table class="a4-table">
          <tr><th style="width:22%;">품의 제목</th><td><strong>${esc(ap.title)}</strong></td></tr>
          <tr><th>요청 총액 (VAT포함)</th><td><strong>${won(ap.grand_total)}</strong> (공급가액 ${won(ap.total_supply)} + VAT ${won(ap.vat)})</td></tr>
          <tr><th>사업 목적</th><td>${esc(ap.purpose_and_effect)}</td></tr>
        </table>`;
    }
  }

  function exportCsvForErp(c) {
    const revs = ensureRevs(c);
    const q = c.doc_chain.quotation;
    const po = c.doc_chain.purchase_order;
    const s = c.source_summary || {};
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = ["버전", "발주기관", "공급자", "총괄책임자", "납품장소", "납기일", "품명", "규격", "수량", "단가", "공급가액", "총합계(VAT포함)"];
    const rows = q.items.map((it) =>
      [
        `Rev.${revs.quotation || 1}`,
        s.issuing_agency || "",
        companyProfile.name,
        c.pm_name || "이준호",
        c.delivery_location || c.doc_chain.delivery_inspection?.delivery_location || "",
        po.due_date || "",
        it.name,
        it.spec,
        it.qty,
        it.unit_price,
        it.supply_amount,
        q.grand_total,
      ].map(cell).join(",")
    );
    const csv = "\uFEFF" + [headers.map(cell).join(","), ...rows].join("\r\n");
    const outName = `${c.id}_Rev${revs.quotation || 1}_엑셀ERP용.csv`;
    triggerDownloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), outName);
    el("easyFormStatus").textContent = `✅ '${outName}' 엑셀·ERP용 파일이 저장되었습니다!`;
  }

  /* ---------- STEP 3: Change Analysis & 6-Card Selective Revision ---------- */
  function shiftDate(dateStr, days) {
    const m = String(dateStr || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(2026, 11, 20);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function parseChangeText(text, base) {
    const q = base.doc_chain.quotation;
    const po = base.doc_chain.purchase_order;
    const di = base.doc_chain.delivery_inspection;
    const first = q.items[0];
    const oldDue = po.due_date || "2026-12-20";
    const oldLoc = base.delivery_location || di.delivery_location || "발주기관 지정 장소";
    const oldPm = base.pm_name || parseStaffRows(companyProfile.staff_text)[0]?.name || "이준호";

    let newQty = first.qty;
    let newDue = oldDue;
    let newLoc = oldLoc;
    let newPm = oldPm;
    const tags = [];

    const rangeQty = text.match(/(\d[\d,]*)\s*(?:개|EA|SET)?\s*(?:에서|->|→)\s*(\d[\d,]*)\s*(?:개|EA|SET)?/);
    const expQty = text.match(/수량[^\d\n]{0,12}(?:을|를|은|는)?\s*(\d[\d,]*)\s*(?:개|EA|SET)?\s*(?:으로|로|까지)/);
    if (rangeQty) {
      newQty = Math.max(1, parseInt(rangeQty[2].replace(/,/g, ""), 10) || first.qty);
      tags.push(`1번 수량 ${first.qty}→${newQty}`);
    } else if (expQty) {
      newQty = Math.max(1, parseInt(expQty[1].replace(/,/g, ""), 10) || first.qty);
      tags.push(`수량 ${first.qty}→${newQty}`);
    }

    const daysMatch = text.match(/(\d+)\s*일\s*(연장|연기|순연|단축|앞당)/);
    const allDates = Array.from(text.matchAll(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/g)).map(
      (m) => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
    );
    const explicitDate = allDates.find((d) => d !== oldDue);
    if (daysMatch) {
      const nDays = parseInt(daysMatch[1], 10) || 0;
      const sign = /단축|앞당/.test(daysMatch[2]) ? -1 : 1;
      newDue = shiftDate(allDates[0] || oldDue, sign * nDays);
      tags.push(`납기 ${sign > 0 ? `+${nDays}` : `-${nDays}`}일(${newDue})`);
    } else if (explicitDate) {
      newDue = explicitDate;
      tags.push(`납기 ${newDue}`);
    }

    const quotedLoc = text.match(/(?:납품\s*장소|납품처|설치\s*장소)[^\n.;]{0,45}?['"‘“]([^'"’”\n]{2,45})['"’”]\s*(?:으로|로)?\s*(?:변경|이전|수정)/);
    const plainLoc = text.match(/(?:납품\s*장소|납품처|설치\s*장소)(?:을|를|은|는)?\s*(?:[^\n.,]+에서\s+)?([^\n.,'"()]{2,34}?)\s*(?:으로|로)\s*(?:변경|이전|수정)/);
    if (quotedLoc) {
      newLoc = quotedLoc[1].trim();
      tags.push(`납품장소('${newLoc}')`);
    } else if (plainLoc) {
      newLoc = plainLoc[1].trim();
      tags.push(`납품장소('${newLoc}')`);
    }

    const pmArrow = text.match(/(?:총괄\s*책임자|연구\s*책임자|PM)(?:\([A-Za-z]+\))?(?:[을를은는])?\s*(?:기존\s+)?([가-힣]{2,4})(?:\s*(?:수석연구원|책임연구원|선임연구원|연구원|수석|책임|팀장|님))?\s*(?:에서|->|→)\s*([가-힣]{2,4})(?:\s*(?:수석연구원|책임연구원|선임연구원|연구원|수석|책임|팀장|님))?(?:으로|로)?/);
    const pmSimple = text.match(/(?:총괄\s*책임자|연구\s*책임자|PM)(?:\([A-Za-z]+\))?(?:[을를은는])?\s*([가-힣]{2,4})(?:\s*(?:수석연구원|책임연구원|선임연구원|연구원|수석|책임|팀장|님))?\s*(?:으로|로)\s*(?:교체|변경)/);
    if (pmArrow) {
      newPm = pmArrow[2].trim();
      tags.push(`PM ${oldPm}→${newPm}`);
    } else if (pmSimple) {
      newPm = pmSimple[1].trim();
      tags.push(`PM →${newPm}`);
    }

    return {
      new_qty: newQty,
      new_due_date: newDue,
      new_location: newLoc,
      new_pm: newPm,
      reason_summary: tags.length ? tags.join(" · ") : "변경 내역 분석",
    };
  }

  function computeEasyImpact(base, prop) {
    const revs = ensureRevs(base);
    const q = base.doc_chain.quotation;
    const po = base.doc_chain.purchase_order;
    const di = base.doc_chain.delivery_inspection;
    const oldQty = q.items[0].qty;
    const oldDue = po.due_date || "-";
    const oldLoc = base.delivery_location || di.delivery_location || "-";
    const oldPm = base.pm_name || "이준호";

    const qtyChanged = prop.new_qty !== oldQty;
    const dueChanged = prop.new_due_date !== oldDue;
    const locChanged = Boolean(prop.new_location && prop.new_location !== oldLoc);
    const pmChanged = Boolean(prop.new_pm && prop.new_pm !== oldPm);

    const impacted = {
      quotation: qtyChanged,
      purchase_order: qtyChanged || dueChanged || locChanged,
      delivery_inspection: qtyChanged || dueChanged || locChanged,
      expense_approval: qtyChanged,
      form_company_staff: pmChanged,
      form_project_plan: pmChanged || dueChanged || locChanged || qtyChanged,
    };

    const reasons = {
      quotation: qtyChanged ? `수량이 ${oldQty}→${prop.new_qty}로 바뀌어 금액 재계산 필요` : "돈·수량 변동이 없어 고치지 않습니다",
      purchase_order: impacted.purchase_order ? "현장 납품 수량 · 납기 · 장소 변경 반영 필요" : "작업 수량 · 납기 · 장소 변동 없음",
      delivery_inspection: impacted.delivery_inspection ? "납품 시 검수할 기준 수량 · 날짜 · 장소 업데이트" : "검수 기준과 납품 장소 변동 없음",
      expense_approval: qtyChanged ? "지출 총액이 바뀌어 내부 품의서 다시 올림" : "지출 금액이 그대로라 재결재 불필요",
      form_company_staff: pmChanged ? `총괄책임자 ${oldPm} → ${prop.new_pm} 교체 반영 필요` : "투입 인력 변동 없음",
      form_project_plan: impacted.form_project_plan ? "수행 계획 내 담당자·일정·예산 요약 업데이트" : "사업 수행 내용 변동 없음",
    };

    return DOC_REGISTRY.map((d) => ({
      ...d,
      impacted: Boolean(impacted[d.id]),
      reason: reasons[d.id],
      currentRev: revs[d.id] || 1,
    }));
  }

  function applySelectiveProposal(base, prop, selectedIds) {
    const next = deepClone(base);
    const sel = new Set(selectedIds);
    const revs = ensureRevs(next);
    const q = next.doc_chain.quotation;
    const po = next.doc_chain.purchase_order;
    const di = next.doc_chain.delivery_inspection;
    const ap = next.doc_chain.expense_approval;
    const stripRev = (no) => String(no || "DOC-2026").replace(/-Rev\d+$/i, "");

    if (sel.has("quotation") && q.items[0]) {
      q.items[0].qty = prop.new_qty;
      q.items[0].supply_amount = q.items[0].qty * q.items[0].unit_price;
      const sum = q.items.reduce((a, it) => a + it.qty * it.unit_price, 0);
      q.total_supply = sum;
      q.vat = Math.round(sum * 0.1);
      q.grand_total = sum + q.vat;
      revs.quotation += 1;
      q.doc_no = `${stripRev(q.doc_no)}-Rev${revs.quotation}`;
    }
    if (sel.has("purchase_order")) {
      if (po.items[0]) po.items[0].qty = prop.new_qty;
      po.due_date = prop.new_due_date;
      revs.purchase_order += 1;
      po.doc_no = `${stripRev(po.doc_no)}-Rev${revs.purchase_order}`;
    }
    if (sel.has("delivery_inspection")) {
      if (di.items[0]) {
        di.items[0].ordered_qty = prop.new_qty;
        di.items[0].delivered_qty = prop.new_qty;
        di.items[0].passed_qty = prop.new_qty;
      }
      di.delivery_date = shiftDate(prop.new_due_date, -2);
      di.delivery_location = prop.new_location;
      next.delivery_location = prop.new_location;
      revs.delivery_inspection += 1;
      di.doc_no = `${stripRev(di.doc_no)}-Rev${revs.delivery_inspection}`;
    }
    if (sel.has("expense_approval")) {
      ap.total_supply = q.total_supply;
      ap.vat = q.vat;
      ap.grand_total = q.grand_total;
      revs.expense_approval += 1;
      ap.doc_no = `${stripRev(ap.doc_no)}-Rev${revs.expense_approval}`;
    }
    if (sel.has("form_company_staff")) {
      next.pm_name = prop.new_pm;
      revs.form_company_staff += 1;
    }
    if (sel.has("form_project_plan")) {
      next.pm_name = prop.new_pm;
      next.delivery_location = prop.new_location;
      revs.form_project_plan += 1;
    }
    next.last_change_summary = prop.reason_summary;
    return next;
  }

  function buildEasyReplyText(base, after, selectedIds) {
    const sel = new Set(selectedIds);
    const qOld = base.doc_chain.quotation;
    const qNew = after.doc_chain.quotation;
    const revised = DOC_REGISTRY.filter((d) => sel.has(d.id)).map((d) => d.name);
    const kept = DOC_REGISTRY.filter((d) => !sel.has(d.id)).map((d) => d.name);

    return [
      `제목: [변경 확인] ${qNew.project_name} 변경 요청 반영 회신`,
      `받는 분: ${qNew.recipient} 담당자님`,
      `보내는 곳: ${companyProfile.name} ${companyProfile.contact} (${companyProfile.phone})`,
      "",
      `안녕하세요, ${companyProfile.name} ${companyProfile.contact}입니다.`,
      `말씀하신 변경 요청을 확인해 아래처럼 바뀐 서류(${revised.length}종)만 정확히 고쳐서 다시 보내드립니다.`,
      "",
      `[이번에 바뀐 내용]`,
      `- 수량(1번 품목): ${num(qOld.items[0].qty)}${qOld.items[0].unit} → ${num(qNew.items[0].qty)}${qNew.items[0].unit}`,
      `- 납품 기한: ${base.doc_chain.purchase_order.due_date} → ${after.doc_chain.purchase_order.due_date}`,
      `- 납품 장소: ${base.delivery_location || "-"} → ${after.delivery_location || "-"}`,
      `- 총괄책임자(PM): ${base.pm_name || "이준호"} → ${after.pm_name || "이준호"}`,
      `- 총 합계금액(부가세 포함): ${won(qOld.grand_total)} → ${won(qNew.grand_total)}`,
      "",
      `[서류 처리 안내]`,
      `• 새로 고쳐서 첨부한 서류 (${revised.length}종): ${revised.join(", ") || "없음"}`,
      `• 변동 없어 기존 그대로 쓰는 서류 (${kept.length}종): ${kept.join(", ") || "없음"}`,
      "",
      `첨부된 수정 파일(.hwpx) 확인 후 회신 부탁드립니다. 감사합니다.`,
    ].join("\n");
  }

  function renderIdleImpactGrid(c) {
    const revs = ensureRevs(c);
    el("easyImpactGrid").innerHTML = DOC_REGISTRY.map(
      (d) => `
      <div class="doc-impact-card keep-safe" style="cursor: default;">
        <div class="impact-card-top">
          <span class="impact-badge">대기 중</span>
          <span class="impact-rev">Rev.${revs[d.id] || 1}</span>
        </div>
        <div class="impact-doc-name">${esc(d.name)}</div>
        <div class="impact-reason">위 시연 버튼을 누르면 이 서류를 고쳐야 할지 자동 판정합니다.</div>
      </div>`
    ).join("");
  }

  function renderPendingImpact() {
    if (!pendingProposal || !activeCase) return;
    const { impactRows, selectedIds, proposal } = pendingProposal;
    const sel = new Set(selectedIds);
    const after = applySelectiveProposal(activeCase, proposal, selectedIds);
    pendingProposal.afterCase = after;

    el("easyImpactGrid").innerHTML = impactRows
      .map((row) => {
        const isEdit = sel.has(row.id);
        return `
        <label class="doc-impact-card ${isEdit ? "needs-edit" : "keep-safe"}">
          <div class="impact-card-top">
            <span class="impact-badge">${isEdit ? "✏️ 수정 필요" : "🔒 고칠 필요 없음"}</span>
            <input type="checkbox" class="easy-imp-cb" data-id="${esc(row.id)}" ${isEdit ? "checked" : ""} />
          </div>
          <div class="impact-doc-name">${esc(row.name)}</div>
          <div class="impact-reason">${esc(row.reason)}</div>
          <div class="impact-rev">${isEdit ? `Rev.${row.currentRev} → Rev.${row.currentRev + 1}로 수정` : `Rev.${row.currentRev} 그대로 유지`}</div>
        </label>`;
      })
      .join("");

    el("easyImpactGrid").querySelectorAll(".easy-imp-cb").forEach((cb) => {
      cb.addEventListener("change", () => {
        pendingProposal.selectedIds = Array.from(
          el("easyImpactGrid").querySelectorAll(".easy-imp-cb:checked")
        ).map((n) => n.dataset.id);
        renderPendingImpact();
      });
    });

    const qOld = activeCase.doc_chain.quotation;
    const qNew = after.doc_chain.quotation;
    const diffRows = [
      ["총괄책임자(PM)", activeCase.pm_name || "이준호", after.pm_name || "이준호"],
      ["1번 품목 수량", `${num(qOld.items[0].qty)}${qOld.items[0].unit}`, `${num(qNew.items[0].qty)}${qNew.items[0].unit}`],
      ["납품 기한", activeCase.doc_chain.purchase_order.due_date || "-", after.doc_chain.purchase_order.due_date || "-"],
      ["납품 장소", activeCase.delivery_location || "-", after.delivery_location || "-"],
      ["총 합계(VAT포함)", won(qOld.grand_total), won(qNew.grand_total)],
    ];

    el("easyDiffBox").innerHTML = `
      <table class="diff-mini-table">
        <thead><tr><th>항목</th><th>바뀌기 전</th><th>바뀐 후</th></tr></thead>
        <tbody>
          ${diffRows.map(([k, b, a]) => `<tr class="${b !== a ? "is-changed" : ""}"><td><strong>${esc(k)}</strong></td><td>${esc(b)}</td><td><strong>${esc(a)}</strong></td></tr>`).join("")}
        </tbody>
      </table>`;

    el("easyReplyBox").textContent = buildEasyReplyText(activeCase, after, selectedIds);
    el("easyApplyChangeBtn").disabled = selectedIds.length === 0;
    el("easyApplyChangeBtn").textContent = selectedIds.length
      ? `✅ 선택된 ${selectedIds.length}개 서류만 수정 반영하기`
      : "수정할 서류가 없습니다";
    el("easyCopyReplyBtn").disabled = false;
    el("easyChangeStatus").textContent = `분석 완료: 6종 중 ${selectedIds.length}종만 고치고, ${6 - selectedIds.length}종은 건드리지 않습니다.`;
  }

  function runChangeAnalysis() {
    if (!activeCase) return;
    const txt = (el("easyChangeInput").value || "").trim();
    if (!txt) {
      el("easyChangeStatus").textContent = "수정 요청 내용을 입력하거나 위 시연 카드를 눌러주세요.";
      return;
    }
    const prop = parseChangeText(txt, activeCase);
    const impactRows = computeEasyImpact(activeCase, prop);
    const selectedIds = impactRows.filter((r) => r.impacted).map((r) => r.id);
    pendingProposal = { proposal: prop, impactRows, selectedIds };
    renderPendingImpact();
  }

  /* ---------- STEP 4: Final Checklist & Easy Prompts ---------- */
  function getChecklistItems(c) {
    const q = c.doc_chain.quotation;
    const po = c.doc_chain.purchase_order;
    return [
      { id: "c1", title: "1. 돈(금액 · 부가세 10%) 계산이 정확한가요?", detail: `총 합계 ${won(q.grand_total)} (공급가액 ${won(q.total_supply)} + 세액 ${won(q.vat)})` },
      { id: "c2", title: "2. 납기일 · 납품장소 · 총괄책임자(PM)가 맞나요?", detail: `납기 ${po.due_date || "-"} · 장소 ${c.delivery_location || "-"} · PM ${c.pm_name || "이준호"}` },
      { id: "c3", title: "3. 계좌번호·주민번호·단가 등 회사 중요정보가 유출되지 않았나요?", detail: `사업자(${companyProfile.biz_no}), 계좌(${companyProfile.bank}) 정합성 및 외부 입력 시 마스킹 확인` },
      { id: "c4", title: "4. 양식 안의 법적 체크칸('[ ] 예 / 아니오')을 직원이 직접 확인했나요?", detail: "이해충돌·수의계약 제한·보훈/장애인 여부 등은 반드시 담당자가 직접 체크(AI 자동 체크 금지)" },
      { id: "c5", title: "5. 대표자 도장(직인) 날인 및 필수 첨부파일을 빠짐없이 챙겼나요?", detail: `대표 '${companyProfile.ceo}' 날인 및 내려받은 한글(.hwpx) 파일 최종 열람 확인` },
    ];
  }

  function buildEasyPromptText(c, key) {
    const q = c.doc_chain.quotation;
    const po = c.doc_chain.purchase_order;
    const s = c.source_summary || {};
    const warn = "[보안 주의] 원가·단가·주민번호 등 영업비밀은 사내 보안 AI를 쓰거나 [별표]로 가리고 입력하세요.\n\n";

    if (key === "step2_draft") {
      return (
        warn +
        `아래 우리 회사 정보와 요청 양식 빈칸 목록을 비교해서, 각 빈칸에 들어갈 초안을 표로 써줘.\n` +
        `단, 회사 정보에 없는 금액이나 경력은 절대 지어내지 말고 '[담당자 확인]'으로 비워둬.\n\n` +
        `[우리 회사] ${companyProfile.name} / 대표 ${companyProfile.ceo} / PM ${c.pm_name || "이준호"} / 연락처 ${companyProfile.phone}\n` +
        `[대상 사업] ${s.document_title || q.project_name}`
      );
    }
    if (key === "step3_change") {
      return (
        warn +
        `기존 계약 조건과 거래처 수정 요청 메일을 비교해 3가지만 정리해 줘.\n` +
        `1) 바뀌기 전 vs 바뀐 후 비교표 (금액 차이 포함)\n` +
        `2) 서류 6종 중 고쳐야 할 서류와 그대로 둘 서류 구분\n` +
        `3) 거래처 담당자에게 바로 보낼 정중한 답장 메일 초안\n\n` +
        `[기존 조건] ${q.project_name} | 1번 품목 ${num(q.items[0].qty)}개 | 총액 ${won(q.grand_total)} | 납기 ${po.due_date || "-"} | PM ${c.pm_name || "이준호"}\n` +
        `[수정 요청] (여기에 이메일이나 카톡 내용을 붙여넣기)`
      );
    }
    return (
      warn +
      `아래 공공기관 공고문을 읽고 실무자가 바로 움직일 수 있게 쉬운 말로 3가지만 정리해 줘.\n` +
      `1) 무슨 사업인지 한 줄 요약 (기관·예산·납기)\n` +
      `2) 제출해야 하는 서류 목록과 사전에 준비할 자료\n` +
      `3) 감점되거나 탈락할 수 있는 주의 조항\n\n` +
      `[공고명] ${s.document_title || q.project_name} (${s.issuing_agency || "발주기관"})\n` +
      `[원문] (공고 내용 붙여넣기)`
    );
  }

  function renderStep4Easy(c) {
    const items = getChecklistItems(c);
    el("easyChecklistBox").innerHTML = items
      .map((it) => {
        const done = Boolean(checkedItems[it.id]);
        return `
        <label class="easy-check-item ${done ? "checked" : ""}">
          <input type="checkbox" data-cid="${esc(it.id)}" ${done ? "checked" : ""} />
          <div><strong>${esc(it.title)}</strong><div style="font-size:12px;color:#475569;margin-top:2px;">${esc(it.detail)}</div></div>
        </label>`;
      })
      .join("");

    const syncProg = () => {
      const doneCount = items.filter((it) => checkedItems[it.id]).length;
      const pct = Math.round((doneCount / items.length) * 100);
      el("easyProgressFill").style.width = `${pct}%`;
      el("easyProgressFill").classList.toggle("done", doneCount === items.length);
      el("easyProgressText").textContent =
        doneCount === items.length ? `🎉 ${doneCount} / ${items.length} 모두 확인 완료!` : `${doneCount} / ${items.length} 확인 완료`;
    };
    syncProg();

    el("easyChecklistBox").querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        checkedItems[cb.dataset.cid] = cb.checked;
        cb.closest(".easy-check-item")?.classList.toggle("checked", cb.checked);
        syncProg();
      });
    });

    document.querySelectorAll(".easy-ptab").forEach((b) => {
      b.classList.toggle("active", b.dataset.prompt === activePromptKey);
    });
    el("easyPromptBox").textContent = buildEasyPromptText(c, activePromptKey);
  }

  function renderRevBadges(c) {
    const revs = ensureRevs(c);
    if (el("easyRevStaff")) {
      el("easyRevStaff").textContent = `Rev.${revs.form_company_staff}`;
      el("easyRevStaff").classList.toggle("updated", revs.form_company_staff > 1);
    }
    if (el("easyRevPlan")) {
      el("easyRevPlan").textContent = `Rev.${revs.form_project_plan}`;
      el("easyRevPlan").classList.toggle("updated", revs.form_project_plan > 1);
    }
    ["quotation", "purchase_order", "delivery_inspection", "expense_approval"].forEach((id) => {
      const b = el(`eTabRev_${id}`);
      if (b) {
        b.textContent = `Rev.${revs[id]}`;
        b.classList.toggle("updated", revs[id] > 1);
      }
    });
    const anyUpd = Object.values(revs).some((v) => v > 1);
    if (el("easyRevertBtn")) el("easyRevertBtn").disabled = !anyUpd;
  }

  function selectEasyCase(c) {
    activeCase = deepClone(c);
    activeCase.doc_revisions = defaultRevisions();
    activeCase.pm_name = parseStaffRows(companyProfile.staff_text)[0]?.name || "이준호";
    activeCase.delivery_location = activeCase.doc_chain?.delivery_inspection?.delivery_location || "발주기관 지정 장소";
    recalcTotals(activeCase);
    baselineCase = deepClone(activeCase);
    pendingProposal = null;
    checkedItems = {};

    document.querySelectorAll(".case-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.caseId === activeCase.id);
    });
    el("easyChangeInput").value = "";
    el("easyApplyChangeBtn").disabled = true;
    el("easyCopyReplyBtn").disabled = true;
    el("easyChangeStatus").textContent = "";
    el("easyDiffBox").innerHTML = `<div class="info-mini-card" style="color: var(--muted);">위 시연 버튼을 눌러 어떤 숫자와 일정이 바뀌는지 비교해 보세요.</div>`;
    el("easyReplyBox").textContent = "변경 분석을 실행하면 수정된 서류와 원안 유지 서류가 정리된 답장 메일이 자동 작성됩니다.";

    renderStep1Summary(activeCase);
    renderIdleImpactGrid(activeCase);
    renderRevBadges(activeCase);
    renderEasyBasic4Sheet();
    renderStep4Easy(activeCase);
  }

  function bindEvents() {
    ["eProfName", "eProfBizNo", "eProfCeo", "eProfContact", "eProfPhone", "eProfAddr", "eProfStaff", "eProfTrack"].forEach(
      (id) => {
        el(id)?.addEventListener("input", () => {
          readProfileInputs();
          if (activeCase) {
            applyProfileToCase(activeCase);
            renderStep1Summary(activeCase);
            renderEasyBasic4Sheet();
            refreshActiveEasyForm();
            renderStep4Easy(activeCase);
          }
        });
      }
    );

    document.querySelectorAll(".case-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const found = cases.find((c) => c.id === btn.dataset.caseId);
        if (found) {
          selectEasyCase(found);
          refreshActiveEasyForm();
        }
      });
    });

    const ni = el("easyNoticeInput");
    el("easyNoticeUploadBtn")?.addEventListener("click", () => ni?.click());
    ni?.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f || !window.HwpBrowserParser) return;
      el("easyNoticeStatus").textContent = `"${f.name}" 한글 문서를 읽고 있습니다...`;
      try {
        const parsed = await window.HwpBrowserParser.parseHwpFile(f);
        const structured = window.HwpBrowserParser.buildFallbackChainFromParsed(parsed);
        selectEasyCase({
          id: "uploaded_notice",
          short_title: f.name,
          parse_info: parsed,
          source_summary: structured.source_summary,
          doc_chain: structured.doc_chain,
        });
        el("easyNoticeStatus").textContent = `✅ "${f.name}" 분석 완료! (${parsed.paragraph_count}문단 · ${parsed.table_count}표 읽기 성공)`;
        refreshActiveEasyForm();
      } catch (err) {
        el("easyNoticeStatus").textContent = `오류: ${err.message}`;
      }
      ni.value = "";
    });

    el("easyFormKimmBtn")?.addEventListener("click", () =>
      loadPresetForm("kimm_sole_source_confirmation_template.hwpx", "수의계약체결제한여부확인서", "kimm")
    );
    el("easyFormStaffBtn")?.addEventListener("click", () =>
      loadPresetForm("agency_company_staff_template.hwpx", "업체일반현황_인력표", "staff")
    );
    el("easyFormPlanBtn")?.addEventListener("click", () =>
      loadPresetForm("agency_project_plan_template.hwpx", "사업수행계획서", "plan")
    );
    el("easyFormBasic4Btn")?.addEventListener("click", () => {
      activeFormKey = "basic4";
      updateFormTabHighlight();
      el("easyHwpxPanel").classList.add("hidden");
      el("easyBasic4Panel").classList.remove("hidden");
      renderEasyBasic4Sheet();
    });

    document.querySelectorAll(".b4-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeB4Doc = btn.dataset.doc;
        renderEasyBasic4Sheet();
      });
    });
    el("easyPrintBtn")?.addEventListener("click", () => window.print());

    const cfi = el("easyCustomFormInput");
    el("easyCustomFormBtn")?.addEventListener("click", () => cfi?.click());
    cfi?.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      await loadFormBuffer(await f.arrayBuffer(), `자동기입_${f.name}`, "custom");
      cfi.value = "";
    });

    el("easyDownloadHwpxBtn")?.addEventListener("click", async () => {
      if (!activeFormBuffer || !activeFormPlan) return;
      try {
        const res = await window.HwpBrowserParser.applySlotPlanToHwpx(activeFormBuffer, activeFormPlan.slots);
        triggerDownloadBlob(res.blob, activeFormFilename);
        el("easyFormStatus").textContent = `🎉 '${activeFormFilename}' 저장 완료! (총 ${res.filledCount}칸 자동 기입됨)`;
      } catch (err) {
        el("easyFormStatus").textContent = `저장 실패: ${err.message}`;
      }
    });

    el("easyDownloadCsvBtn")?.addEventListener("click", () => {
      if (activeCase) exportCsvForErp(activeCase);
    });

    document.querySelectorAll(".easy-sc-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!activeCase) return;
        const sc = btn.dataset.sc;
        const first = activeCase.doc_chain.quotation.items[0];
        const due = activeCase.doc_chain.purchase_order.due_date || "2026-12-20";
        if (sc === "pm_change") {
          const oldPm = activeCase.pm_name || "이준호";
          const nextPm = oldPm === "박서연" ? "이준호" : "박서연";
          el("easyChangeInput").value =
            `발주처 요청으로 총괄책임자(PM)를 기존 ${oldPm} 수석에서 ${nextPm} 책임연구원으로 교체해 주세요. 견적 금액과 수량은 변동 없습니다.`;
        } else if (sc === "qty_due") {
          el("easyChangeInput").value =
            `담당자님, 1번 품목(${first.name}) 수량을 100개에서 120개로 늘리고, 납기는 기존(${due}) 대비 7일 연장해 주세요.`;
        } else {
          el("easyChangeInput").value =
            `납기를 기존(${due}) 대비 10일 연장하고, 납품장소는 '제2연구동 1층 계측기 반입구'로 변경해 주세요. 금액·인력은 변동 없습니다.`;
        }
        runChangeAnalysis();
      });
    });

    el("easyAnalyzeChangeBtn")?.addEventListener("click", runChangeAnalysis);

    el("easyApplyChangeBtn")?.addEventListener("click", () => {
      if (!pendingProposal || !pendingProposal.afterCase) return;
      const n = pendingProposal.selectedIds.length;
      activeCase = deepClone(pendingProposal.afterCase);
      renderRevBadges(activeCase);
      renderEasyBasic4Sheet();
      renderStep4Easy(activeCase);
      refreshActiveEasyForm();
      el("easyApplyChangeBtn").disabled = true;
      el("easyChangeStatus").textContent =
        `✅ ${n}개 서류만 개정(Rev.2) 반영 완료! 위 STEP 2에서 인력표·계획서를 눌러 바뀐 내용을 바로 확인해 보세요.`;
    });

    el("easyRevertBtn")?.addEventListener("click", () => {
      if (!baselineCase) return;
      selectEasyCase(baselineCase);
      refreshActiveEasyForm();
      el("easyChangeStatus").textContent = "↺ 모든 서류를 처음 상태(Rev.1)로 되돌렸습니다.";
    });

    el("easyCopyReplyBtn")?.addEventListener("click", () =>
      copyTextWithFeedback(el("easyReplyBox")?.textContent || "", el("easyCopyReplyBtn"), "📋 답장 메일 복사하기")
    );

    el("easyCopyChecklistBtn")?.addEventListener("click", () => {
      if (!activeCase) return;
      const lines = getChecklistItems(activeCase).map(
        (it) => `[${checkedItems[it.id] ? "v" : " "}] ${it.title}\n   - ${it.detail}`
      );
      copyTextWithFeedback(lines.join("\n"), el("easyCopyChecklistBtn"), "📋 확인표 복사하기");
    });

    document.querySelectorAll(".easy-ptab").forEach((b) => {
      b.addEventListener("click", () => {
        activePromptKey = b.dataset.prompt || "step1_prep";
        if (activeCase) renderStep4Easy(activeCase);
      });
    });

    el("easyCopyPromptBtn")?.addEventListener("click", () =>
      copyTextWithFeedback(el("easyPromptBox")?.textContent || "", el("easyCopyPromptBtn"), "📋 질문지 복사하기")
    );
  }

  async function init() {
    loadProfile();
    bindEvents();
    try {
      const resp = await fetch(`data/precomputed_cases.json?v=${ASSET_VER}`);
      const bundle = await resp.json();
      cases = bundle.cases || [];
      const defaultCase = cases.find((c) => c.id === "kriss_gpu_workstation_spec") || cases[0];
      if (defaultCase) {
        selectEasyCase(defaultCase);
        loadPresetForm("kimm_sole_source_confirmation_template.hwpx", "수의계약체결제한여부확인서", "kimm");
      }
    } catch (err) {
      el("easySummaryCards").innerHTML = `<div class="info-mini-card warn">데이터를 불러오지 못했습니다: ${esc(err.message)}</div>`;
    }
  }

  init();
})();
