(function () {
  const ASSET_VER = "20261126h";
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
    { id: "quotation", name: "표준 견적서", kind: "기본 거래 서식" },
    { id: "purchase_order", name: "발주서 · 작업지시서", kind: "기본 거래 서식" },
    { id: "delivery_inspection", name: "거래명세 · 납품검수조서", kind: "기본 거래 서식" },
    { id: "expense_approval", name: "지출결의 · 내부 품의서", kind: "기본 거래 서식" },
    { id: "form_company_staff", name: "업체 일반현황 · 참여인력표 (.hwpx)", kind: "기관 제출 양식" },
    { id: "form_project_plan", name: "사업수행계획서 요약 (.hwpx)", kind: "기관 제출 양식" },
  ];

  const CASE_SELECT_LABELS = {
    kriss_gpu_workstation_spec: "[출연연] 한국표준과학연구원(KRISS) — GPU 워크스테이션 구매규격서 (.hwp)",
    dapa_uav_bid: "[방위사업청] 해안정찰용무인항공기 국내구매 입찰공고 (.hwpx)",
    dapa_tactical_relay_bid: "[방위사업청] 전술이동중계기 국내구매 입찰공고(재공고) (.hwpx)",
    dapa_sme_priority_items: "[방위사업청] 중소기업자 우선선정 품목지정 공고 (.hwpx)",
    dapa_defense_innov_sme: "[방위사업청] 제5기 방산혁신기업 선정기업 공고 (.hwp)",
  };

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

  function setStatus(nodeId, text, isError = false) {
    const node = el(nodeId);
    if (!node) return;
    node.textContent = text || "";
    node.classList.toggle("is-error", Boolean(isError));
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
      // Ignore storage failures in strict browser privacy modes
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
      el("easyProfilePreview").textContent = `${companyProfile.name} · ${companyProfile.biz_no} · 대표자 ${companyProfile.ceo}`;
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
      el("easyProfilePreview").textContent = `${companyProfile.name} · ${companyProfile.biz_no} · 대표자 ${companyProfile.ceo}`;
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
        btn.textContent = "복사됨";
        setTimeout(() => {
          btn.textContent = defaultLabel;
        }, 1600);
      }
    } catch (_) {
      if (btn) {
        btn.textContent = "직접 복사 필요";
        setTimeout(() => {
          btn.textContent = defaultLabel;
        }, 1600);
      }
    }
  }

  /* ---------- 1단계: 공고 기본 제원 및 검토 유의사항 표 ---------- */
  function populateCaseSelect() {
    const sel = el("easyCaseSelect");
    if (!sel) return;
    sel.innerHTML = "";
    cases.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = CASE_SELECT_LABELS[c.id] || `${c.short_title} (${c.parse_info?.filename || "문서"})`;
      sel.appendChild(opt);
    });
    if (activeCase && !cases.some((c) => c.id === activeCase.id)) {
      const upOpt = document.createElement("option");
      upOpt.value = activeCase.id;
      upOpt.textContent = `[업로드 문서] ${activeCase.short_title}`;
      sel.appendChild(upOpt);
    }
    if (activeCase) sel.value = activeCase.id;
  }

  function renderStep1Summary(c) {
    const s = c.source_summary || {};
    const p = c.parse_info || {};
    const q = c.doc_chain.quotation;
    const po = c.doc_chain.purchase_order;
    const agencyClean = String(s.issuing_agency || "미기재").replace(/\(.*사용자 제공.*\)/g, "").trim() || "한국표준과학연구원(KRISS)";
    const attList = (s.mandatory_attachments || []).slice(0, 4);
    const schedules = (s.key_schedules || []).slice(0, 4);
    const risks = (s.risk_alerts || []).slice(0, 4);

    el("easySummaryCards").innerHTML = `
      <h3 class="sub-heading">공고 기본 제원 및 준비 현황</h3>
      <div class="table-wrap">
        <table class="kv-table">
          <tbody>
            <tr>
              <th>발주 · 공고기관</th>
              <td><span class="state-tag real">원문 추출</span> &nbsp;${esc(agencyClean)}</td>
            </tr>
            <tr>
              <th>공고 · 규격명</th>
              <td><strong>${esc(s.document_title || q.project_name)}</strong> (${esc(s.project_category || "공공조달")})</td>
            </tr>
            <tr>
              <th>원문 파일 구조</th>
              <td class="break-any">${esc(p.filename || "-")} · ${esc(p.format_type || "-")} · ${num(p.paragraph_count || 0)}문단 · ${num(p.table_count || 0)}표 · ${num(p.char_count || 0)}자</td>
            </tr>
            <tr>
              <th>규모 · 대상 품목</th>
              <td>${esc(s.budget_or_scale || won(q.grand_total))}</td>
            </tr>
            <tr>
              <th>주요 일정 · 보증</th>
              <td>${schedules.length ? `<ul class="flat-list">${schedules.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>` : "원문 일정 세부 확인 필요"}</td>
            </tr>
            <tr>
              <th>제출서류 · 사내 준비물</th>
              <td>
                <ul class="flat-list">
                  ${attList.length ? attList.map((a) => `<li>${esc(a)}</li>`).join("") : "<li>공고 첨부 지정양식 및 견적서 일체</li>"}
                  <li><strong>사내 준비물:</strong> 기업 기본자료(${esc(companyProfile.name)}), 참여인력(${esc(c.pm_name || "이준호")} 외), 수행실적, 대표 직인</li>
                </ul>
              </td>
            </tr>
            <tr>
              <th>시연 기준 작성값</th>
              <td><span class="state-tag demo">시연 가정치</span> &nbsp;예시 견적총액 ${won(q.grand_total)} (VAT 포함) · 작업지시 납기 ${esc(po.due_date || "-")} · 배정 PM ${esc(c.pm_name || "이준호")}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 class="sub-heading">원문 검토 유의사항</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 110px;">구분</th>
              <th style="width: 240px;">검토 항목</th>
              <th>세부 확인 내용</th>
            </tr>
          </thead>
          <tbody>
            ${
              risks.length
                ? risks
                    .map(
                      (r) => `
              <tr>
                <td><span class="state-tag ${r.level === "high" ? "warn" : ""}">${r.level === "high" ? "중요 확인" : "일반 확인"}</span></td>
                <td><strong>${esc(r.title)}</strong></td>
                <td>${esc(r.detail)}</td>
              </tr>`
                    )
                    .join("")
                : `<tr><td><span class="state-tag">일반 확인</span></td><td><strong>기본 검토</strong></td><td>마감 기한, 정품 규격 및 증빙 서류 요건을 제출 전 최종 확인하십시오.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;
  }

  /* ---------- 2단계: 한글 양식 자동 입력 및 기본 4종 서식 ---------- */
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
      PLAN_TRACK: trackRows.map((t) => `${t.org}: ${t.project} (${t.period}, ${t.amount})`).join(" / "),
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

  function renderSourceTag(src) {
    if (src === "기업자료") return `<span class="src-dot src-company">기업 정보</span>`;
    if (src === "공고·서식 연동") return `<span class="src-dot src-notice">공고 · 계약</span>`;
    if (src === "AI 초안") return `<span class="src-dot src-rule">규칙 초안</span>`;
    return `<span class="src-dot src-manual">직접 입력</span>`;
  }

  function renderEasySlotTable() {
    if (!activeFormPlan) return;
    const filledCount = activeFormPlan.slots.filter((s) => String(s.value || "").trim() !== "").length;
    const hcStat = activeFormPlan.humanChecks || {};
    const manualCount = (hcStat.checkboxCellCount || 0) + (hcStat.hasSignatureSeal ? 1 : 0);
    el("easyFormTitle").innerHTML = `
      <div class="form-stat">
        <span class="form-stat-k">자동 입력</span>
        <span class="form-stat-v"><span class="count-up">${filledCount}</span><small> / ${activeFormPlan.slots.length}칸</small></span>
      </div>
      <div class="form-stat">
        <span class="form-stat-k">담당자 직접 확인</span>
        <span class="form-stat-v"><span class="count-up">${manualCount}</span><small>칸</small></span>
      </div>
      <div class="form-stat form-stat-file">
        <span class="form-stat-k">${esc(activeFormPlan.formType)}</span>
        <span class="form-stat-file-name break-any" translate="no">${esc(activeFormFilename)}</span>
      </div>`;

    const notice = el("easyHumanSafetyNotice");
    const hc = activeFormPlan.humanChecks || {};
    if ((hc.checkboxCellCount || 0) > 0 || hc.hasSignatureSeal) {
      notice.innerHTML =
        `<strong>수동 확인 안내:</strong> 양식 내 선택·법적 서약 체크란([ ] 표기 ${hc.checkboxCellCount || 0}건)과 대표자 서명·날인란은 허위 기재 방지를 위해 자동 입력에서 제외했습니다. 파일 다운로드 후 담당자가 직접 확인·표기하십시오.`;
      notice.classList.remove("hidden");
    } else {
      notice.classList.add("hidden");
    }

    el("easySlotTableWrap").innerHTML = `
      <table class="data-table field-table">
        <thead>
          <tr>
            <th style="width: 30%;">항목 · 양식 위치</th>
            <th style="width: 18%;">출처</th>
            <th style="width: 52%;">입력값 (직접 수정 가능)</th>
          </tr>
        </thead>
        <tbody>
          ${activeFormPlan.slots
            .map(
              (s, i) => `
            <tr>
              <td><strong>${esc(s.label)}</strong><span class="slot-loc">${esc(s.location)}</span></td>
              <td>${renderSourceTag(s.source)}</td>
              <td><input type="text" class="slot-input easy-slot-input" data-idx="${i}" value="${esc(s.value)}" placeholder="필요 시 직접 입력" /></td>
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
    if (animateFieldsNext) {
      animateFieldsNext = false;
      playFieldFill();
    }
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
      setStatus("easyFormStatus", "입력값을 검토한 뒤 한글 파일(.hwpx) 또는 CSV로 내려받으십시오.");
    } catch (err) {
      el("easyFormTitle").textContent = "양식 분석 중 오류가 발생했습니다.";
      setStatus("easyFormStatus", err.message, true);
    }
  }

  async function loadPresetForm(templateFile, suffix, formKey) {
    if (!activeCase) return;
    el("easyFormTitle").textContent = "한글 양식 구조를 분석하고 있습니다.";
    try {
      const resp = await fetch(`templates/${templateFile}?v=${ASSET_VER}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      await loadFormBuffer(buf, `${activeCase.id}_${suffix}.hwpx`, formKey);
    } catch (err) {
      setStatus("easyFormStatus", `양식 불러오기 실패: ${err.message}`, true);
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
    renderDocPicker();
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
          <div>
            <h3>표 준 견 적 서</h3>
            <div class="a4-meta">문서번호 ${esc(q.doc_no)} | 견적일 ${esc(q.quote_date)}</div>
          </div>
          <div class="a4-meta">공급자: <strong>${esc(companyProfile.name)}</strong> · 대표자 ${esc(companyProfile.ceo)}</div>
        </div>
        <div class="table-wrap">
          <table class="kv-table">
            <tbody>
              <tr><th>수신처</th><td>${esc(q.recipient)}</td></tr>
              <tr><th>건명</th><td><strong>${esc(q.project_name)}</strong></td></tr>
              <tr><th>총 합계 (VAT 포함)</th><td><strong>${won(q.grand_total)}</strong> (공급가액 ${won(q.total_supply)} + 부가세 ${won(q.vat)})</td></tr>
            </tbody>
          </table>
        </div>
        <div class="table-wrap" style="margin-bottom:0;">
          <table class="data-table">
            <thead><tr><th class="center">번호</th><th>품명</th><th>규격</th><th class="num">수량</th><th class="num">단가(원)</th><th class="num">공급가액(원)</th></tr></thead>
            <tbody>
              ${q.items.map((it, idx) => `<tr><td class="center">${idx + 1}</td><td>${esc(it.name)}</td><td>${esc(it.spec)}</td><td class="num">${num(it.qty)} ${esc(it.unit)}</td><td class="num">${num(it.unit_price)}</td><td class="num"><strong>${num(it.supply_amount)}</strong></td></tr>`).join("")}
            </tbody>
          </table>
        </div>`;
    } else if (activeB4Doc === "purchase_order") {
      const po = chain.purchase_order;
      container.innerHTML = `
        <div class="a4-head">
          <div>
            <h3>발 주 서 · 작 업 지 시 서</h3>
            <div class="a4-meta">관리번호 ${esc(po.doc_no)} | 납기일 <strong>${esc(po.due_date)}</strong></div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="kv-table">
            <tbody>
              <tr><th>납품 장소</th><td>${esc(activeCase.delivery_location || chain.delivery_inspection?.delivery_location || "-")}</td></tr>
              <tr><th>총괄책임자(PM)</th><td><strong>${esc(activeCase.pm_name || "이준호")}</strong></td></tr>
            </tbody>
          </table>
        </div>
        <div class="table-wrap" style="margin-bottom:0;">
          <table class="data-table">
            <thead><tr><th class="center">번호</th><th>품목명</th><th>작업 규격</th><th class="num">수량</th><th>품질 기준</th></tr></thead>
            <tbody>
              ${po.items.map((it, idx) => `<tr><td class="center">${idx + 1}</td><td>${esc(it.name)}</td><td>${esc(it.spec_material)}</td><td class="num"><strong>${num(it.qty)}</strong></td><td>${esc(it.qc_standard)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
        <p class="a4-note"><strong>작업 지시:</strong> ${esc(po.instructions)}</p>`;
    } else if (activeB4Doc === "delivery_inspection") {
      const di = chain.delivery_inspection;
      container.innerHTML = `
        <div class="a4-head">
          <div>
            <h3>거 래 명 세 · 납 품 검 수 조 서</h3>
            <div class="a4-meta">검수번호 ${esc(di.doc_no)} | 검수예정일 ${esc(di.delivery_date)}</div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="kv-table">
            <tbody>
              <tr><th>납품 장소</th><td>${esc(di.delivery_location)}</td></tr>
              <tr><th>검수 기관</th><td>${esc(di.inspector_org)}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="table-wrap" style="margin-bottom:0;">
          <table class="data-table">
            <thead><tr><th class="center">번호</th><th>품명</th><th class="num">발주수량</th><th class="num">납품수량</th><th class="num">합격수량</th><th class="center">판정</th></tr></thead>
            <tbody>
              ${di.items.map((it, idx) => `<tr><td class="center">${idx + 1}</td><td>${esc(it.name)}</td><td class="num">${num(it.ordered_qty)}</td><td class="num">${num(it.delivered_qty)}</td><td class="num">${num(it.passed_qty)}</td><td class="center"><strong>${esc(it.result)}</strong></td></tr>`).join("")}
            </tbody>
          </table>
        </div>`;
    } else {
      const ap = chain.expense_approval;
      container.innerHTML = `
        <div class="a4-head">
          <div>
            <h3>지 출 결 의 · 내 부 품 의 서</h3>
            <div class="a4-meta">품의번호 ${esc(ap.doc_no)} | 기안자 ${esc(ap.drafter)}</div>
          </div>
        </div>
        <div class="table-wrap" style="margin-bottom:0;">
          <table class="kv-table">
            <tbody>
              <tr><th>품의 제목</th><td><strong>${esc(ap.title)}</strong></td></tr>
              <tr><th>요청 총액 (VAT 포함)</th><td><strong>${won(ap.grand_total)}</strong> (공급가액 ${won(ap.total_supply)} + 부가세 ${won(ap.vat)})</td></tr>
              <tr><th>사업 목적</th><td>${esc(ap.purpose_and_effect)}</td></tr>
            </tbody>
          </table>
        </div>`;
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
    const outName = `${c.id}_Rev${revs.quotation || 1}_erp_import.csv`;
    triggerDownloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), outName);
    setStatus("easyFormStatus", `저장 완료: ${outName}`);
  }

  /* ---------- 3단계: 변경 요청 분석 및 선별 개정 ---------- */
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
      quotation: qtyChanged ? `수량 변경(${oldQty}→${prop.new_qty})에 따른 금액 재산정 필요` : "수량·단가 변동 없음",
      purchase_order: impacted.purchase_order ? "작업 수량 · 납기 · 납품장소 반영 필요" : "작업 수량 · 납기 · 장소 변동 없음",
      delivery_inspection: impacted.delivery_inspection ? "검수 기준 수량 · 검수일 · 장소 현행화 필요" : "검수 기준 및 납품 장소 변동 없음",
      expense_approval: qtyChanged ? "지출 총액 변동으로 내부 품의 재상신 필요" : "총액 변동 없음 (재결재 불필요)",
      form_company_staff: pmChanged ? `총괄책임자(${oldPm} → ${prop.new_pm}) 인력표 수정 필요` : "투입 인력 변동 없음",
      form_project_plan: impacted.form_project_plan ? "수행계획서 내 책임자·일정·예산 요약 수정 필요" : "사업 수행 내용 변동 없음",
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
      `수신: ${qNew.recipient} 담당자님`,
      `발신: ${companyProfile.name} ${companyProfile.contact} (${companyProfile.phone})`,
      "",
      `안녕하십니까, ${companyProfile.name} ${companyProfile.contact}입니다.`,
      `요청 주신 변경 사항을 검토해 개정 대상 서류(${revised.length}종)에 반영하고, 변동이 없는 서류(${kept.length}종)는 기존 원안을 유지하여 회신드립니다.`,
      "",
      `1. 주요 변경 내역`,
      `- 수량(1번 품목): ${num(qOld.items[0].qty)}${qOld.items[0].unit} → ${num(qNew.items[0].qty)}${qNew.items[0].unit}`,
      `- 납품 기한: ${base.doc_chain.purchase_order.due_date} → ${after.doc_chain.purchase_order.due_date}`,
      `- 납품 장소: ${base.delivery_location || "-"} → ${after.delivery_location || "-"}`,
      `- 총괄책임자(PM): ${base.pm_name || "이준호"} → ${after.pm_name || "이준호"}`,
      `- 총 합계금액(VAT 포함): ${won(qOld.grand_total)} → ${won(qNew.grand_total)}`,
      "",
      `2. 서류별 처리 현황`,
      `- 개정 첨부 서류 (${revised.length}종): ${revised.join(", ") || "없음"}`,
      `- 원안 유지 서류 (${kept.length}종): ${kept.join(", ") || "없음"}`,
      "",
      `첨부된 개정 파일을 확인해 주시기 바랍니다. 감사합니다.`,
    ].join("\n");
  }

  function renderIdleImpactGrid(c) {
    const revs = ensureRevs(c);
    el("easyImpactGrid").innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th class="center" style="width: 56px;">적용</th>
            <th style="width: 220px;">관리 서식명</th>
            <th style="width: 120px;">분류</th>
            <th class="center" style="width: 96px;">판정</th>
            <th>판정 근거</th>
            <th class="center" style="width: 110px;">현재 버전</th>
          </tr>
        </thead>
        <tbody>
          ${DOC_REGISTRY.map(
            (d) => `
            <tr>
              <td class="center"><input type="checkbox" disabled /></td>
              <td><strong>${esc(d.name)}</strong></td>
              <td>${esc(d.kind)}</td>
              <td class="center"><span class="state-tag keep">대기</span></td>
              <td style="color: var(--text-sub);">변경 요청을 입력하고 '변경 대상 분석'을 실행하십시오.</td>
              <td class="center"><span class="rev-tag">Rev.${revs[d.id] || 1}</span></td>
            </tr>`
          ).join("")}
        </tbody>
      </table>`;
  }

  function setApplyButtonState(enabled, selectedCount) {
    const btn = el("easyApplyChangeBtn");
    if (!btn) return;
    btn.disabled = !enabled;
    btn.classList.toggle("btn-action-ready", Boolean(enabled));
    btn.textContent = enabled ? `선택 서식 ${selectedCount}종 개정 적용` : "선택 서식 개정 적용";
    renderImpactBoard();
  }

  function renderPendingImpact() {
    if (!pendingProposal || !activeCase) return;
    const { impactRows, selectedIds, proposal } = pendingProposal;
    const sel = new Set(selectedIds);
    const after = applySelectiveProposal(activeCase, proposal, selectedIds);
    pendingProposal.afterCase = after;

    el("easyImpactGrid").innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th class="center" style="width: 56px;">적용</th>
            <th style="width: 220px;">관리 서식명</th>
            <th style="width: 120px;">분류</th>
            <th class="center" style="width: 96px;">판정</th>
            <th>판정 근거</th>
            <th class="center" style="width: 130px;">버전 변경</th>
          </tr>
        </thead>
        <tbody>
          ${impactRows
            .map((row) => {
              const isEdit = sel.has(row.id);
              return `
              <tr class="${isEdit ? "row-target" : ""}">
                <td class="center"><input type="checkbox" class="easy-imp-cb" data-id="${esc(row.id)}" ${isEdit ? "checked" : ""} /></td>
                <td><strong>${esc(row.name)}</strong></td>
                <td>${esc(row.kind)}</td>
                <td class="center"><span class="state-tag ${isEdit ? "target" : "keep"}">${isEdit ? "수정 대상" : "유지"}</span></td>
                <td>${esc(row.reason)}</td>
                <td class="center">${isEdit ? `<strong>Rev.${row.currentRev} → Rev.${row.currentRev + 1}</strong>` : `Rev.${row.currentRev} 유지`}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;

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
      ["총 합계(VAT 포함)", won(qOld.grand_total), won(qNew.grand_total)],
    ];

    el("easyDiffBox").innerHTML = `
      <div class="table-wrap" style="margin-bottom:0;">
        <table class="data-table">
          <thead><tr><th>비교 항목</th><th>변경 전</th><th>변경 후</th></tr></thead>
          <tbody>
            ${diffRows
              .map(
                ([k, b, a]) =>
                  `<tr class="${b !== a ? "row-target" : ""}"><td><strong>${esc(k)}</strong></td><td>${esc(b)}</td><td><strong>${esc(a)}</strong></td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`;

    el("easyReplyBox").textContent = buildEasyReplyText(activeCase, after, selectedIds);
    setApplyButtonState(selectedIds.length > 0, selectedIds.length);
    el("easyCopyReplyBtn").disabled = false;
    setStatus("easyChangeStatus", `분석 완료: 6종 중 ${selectedIds.length}종 수정 대상, ${6 - selectedIds.length}종 원안 유지`);
    renderFlowStatus();
  }

  function runChangeAnalysis() {
    if (!activeCase) return;
    const txt = (el("easyChangeInput").value || "").trim();
    if (!txt) {
      setStatus("easyChangeStatus", "변경 요청 내용을 입력하거나 예시 시나리오를 선택하십시오.", true);
      return;
    }
    scanNext = true;
    const prop = parseChangeText(txt, activeCase);
    const impactRows = computeEasyImpact(activeCase, prop);
    const selectedIds = impactRows.filter((r) => r.impacted).map((r) => r.id);
    pendingProposal = { proposal: prop, impactRows, selectedIds };
    renderPendingImpact();
  }

  /* ---------- 4단계: 최종 점검표 및 표준 프롬프트 ---------- */
  function getChecklistItems(c) {
    const q = c.doc_chain.quotation;
    const po = c.doc_chain.purchase_order;
    return [
      { id: "c1", title: "1. 견적 · 발주 · 품의 금액 및 부가세(10%) 산식 검증", detail: `총 합계 ${won(q.grand_total)} (공급가액 ${won(q.total_supply)} + 부가세 ${won(q.vat)})` },
      { id: "c2", title: "2. 납기일 · 납품장소 · 총괄책임자(PM) 일치 여부 확인", detail: `납기 ${po.due_date || "-"} · 장소 ${c.delivery_location || "-"} · PM ${c.pm_name || "이준호"}` },
      { id: "c3", title: "3. 계좌 · 사업자번호 · 원가 등 민감정보 보호 점검", detail: `사업자번호(${companyProfile.biz_no}), 계좌(${companyProfile.bank}) 확인 및 외부 입력 시 마스킹 준수` },
      { id: "c4", title: "4. 양식 내 법적 서약 체크란([ ] 예/아니오) 담당자 직접 기입", detail: "이해충돌 · 수의계약 제한 · 보훈/여성기업 등 법적 확인 항목은 담당자가 사실 확인 후 직접 표기" },
      { id: "c5", title: "5. 대표자 직인 날인 및 제출 파일(.hwpx) 열람 최종 확인", detail: `대표자 '${companyProfile.ceo}' 날인 및 생성된 한글 파일 서식 검토` },
    ];
  }

  function buildEasyPromptText(c, key) {
    const q = c.doc_chain.quotation;
    const po = c.doc_chain.purchase_order;
    const s = c.source_summary || {};
    const warn = "[보안 안내] 원가, 단가, 주민등록번호 등 영업비밀 및 개인정보는 사내 보안 LLM에서 실행하거나 비식별 처리 후 입력하십시오.\n\n";

    if (key === "step2_draft") {
      return (
        warn +
        `등록된 기업 정보와 요청 양식의 빈칸 항목을 대조해 각 항목의 초안을 표로 작성하십시오.\n` +
        `기업 정보에 없는 금액이나 경력은 임의로 작성하지 말고 '[담당자 확인]'으로 표기하십시오.\n\n` +
        `[기준 기업] ${companyProfile.name} / 대표자 ${companyProfile.ceo} / PM ${c.pm_name || "이준호"} / 연락처 ${companyProfile.phone}\n` +
        `[대상 사업] ${s.document_title || q.project_name}`
      );
    }
    if (key === "step3_change") {
      return (
        warn +
        `기존 계약 조건과 거래처 변경 요청 원문을 비교해 아래 3항목을 정리하십시오.\n` +
        `1) 항목별 변경 전·후 비교표 (금액 증감 포함)\n` +
        `2) 관리 서류 6종 중 개정 대상 서류와 원안 유지 서류 구분\n` +
        `3) 거래처 담당자 수신용 공식 회신 문안\n\n` +
        `[기존 조건] ${q.project_name} | 1번 품목 ${num(q.items[0].qty)}개 | 총액 ${won(q.grand_total)} | 납기 ${po.due_date || "-"} | PM ${c.pm_name || "이준호"}\n` +
        `[변경 요청 원문] (수신 메일 또는 메모 입력)`
      );
    }
    return (
      warn +
      `공공기관 공고문을 분석해 아래 3항목으로 정리하십시오.\n` +
      `1) 사업 개요 (발주기관, 사업 규모, 납기)\n` +
      `2) 필수 제출서류 목록 및 사내 사전 준비 정보\n` +
      `3) 참가자격 제한 및 지체상금 등 검토 유의사항\n\n` +
      `[공고명] ${s.document_title || q.project_name} (${s.issuing_agency || "발주기관"})\n` +
      `[공고 원문] (추출 텍스트 입력)`
    );
  }

  function renderStep4Easy(c) {
    const items = getChecklistItems(c);
    el("easyChecklistBox").innerHTML = items
      .map((it) => {
        const done = Boolean(checkedItems[it.id]);
        return `
        <label class="check-row ${done ? "checked" : ""}">
          <input type="checkbox" data-cid="${esc(it.id)}" ${done ? "checked" : ""} />
          <div>
            <div class="check-row-title">${esc(it.title)}</div>
            <div class="check-row-detail">${esc(it.detail)}</div>
          </div>
        </label>`;
      })
      .join("");

    const syncProg = () => {
      const doneCount = items.filter((it) => checkedItems[it.id]).length;
      const pct = Math.round((doneCount / items.length) * 100);
      el("easyProgressFill").style.width = `${pct}%`;
      el("easyProgressFill").classList.toggle("done", doneCount === items.length);
      el("easyProgressText").textContent = `${doneCount} / ${items.length}건 완료`;
      renderFlowStatus();
    };
    syncProg();

    el("easyChecklistBox").querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        checkedItems[cb.dataset.cid] = cb.checked;
        cb.closest(".check-row")?.classList.toggle("checked", cb.checked);
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
    renderFlowStatus();
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

    populateCaseSelect();
    if (el("easyScenarioSelect")) el("easyScenarioSelect").value = "";
    el("easyChangeInput").value = "";
    setApplyButtonState(false, 0);
    el("easyCopyReplyBtn").disabled = true;
    el("easyCopyReplyBtn").textContent = "회신 문안 복사";
    setStatus("easyChangeStatus", "");
    el("easyDiffBox").innerHTML = `<div class="notice-box">변경 대상 분석을 실행하면 항목별 변경 내역과 금액 증감이 표로 표시됩니다.</div>`;
    el("easyReplyBox").textContent = "변경 대상 분석을 실행하면 개정 서류와 유지 서류가 구분된 회신 문안이 생성됩니다.";

    renderStep1Summary(activeCase);
    renderIdleImpactGrid(activeCase);
    renderRevBadges(activeCase);
    renderEasyBasic4Sheet();
    renderStep4Easy(activeCase);
  }

  function applyScenarioPreset(sc) {
    if (!activeCase || !sc) return;
    const first = activeCase.doc_chain.quotation.items[0];
    const due = activeCase.doc_chain.purchase_order.due_date || "2026-12-20";
    if (sc === "pm_change") {
      const oldPm = activeCase.pm_name || "이준호";
      const nextPm = oldPm === "박서연" ? "이준호" : "박서연";
      el("easyChangeInput").value =
        `발주처 요청으로 총괄책임자(PM)를 기존 ${oldPm} 수석에서 ${nextPm} 책임연구원으로 교체 요청합니다. 견적 금액과 수량은 변동 없습니다.`;
    } else if (sc === "qty_due") {
      // Scale the item's real quantity (1 SET -> 2 SET, 100개 -> 120개) instead of assuming 100 -> 120.
      const oldQty = Math.max(1, parseInt(first.qty, 10) || 1);
      const newQty = oldQty >= 5 ? Math.round(oldQty * 1.2) : oldQty + 1;
      const unit = ["개", "EA", "SET"].includes(first.unit) ? first.unit : "개";
      const qtyText = (n) => `${n}${unit}`;
      el("easyChangeInput").value =
        `담당자님, 1번 품목(${first.name}) 수량을 ${qtyText(oldQty)}에서 ${qtyText(newQty)}로 변경하고 납기는 기존(${due}) 대비 7일 연장 요청드립니다.`;
    } else if (sc === "due_location") {
      el("easyChangeInput").value =
        `납기를 기존(${due}) 대비 10일 연장하고 납품장소는 '제2연구동 1층 계측기 반입구'로 변경 요청드립니다. 금액과 참여인력은 변동 없습니다.`;
    }
    runChangeAnalysis();
  }

  /* ---------- 단계 안내 흐름: 단계 레일, 서류 개정 현황, 해시 이동 ---------- */
  const STEP_COUNT = 4;
  const BASIC4_IDS = ["quotation", "purchase_order", "delivery_inspection", "expense_approval"];
  let currentStep = 1;
  const visitedSteps = new Set();

  function stepFromHash() {
    const m = /^#step([1-4])(?:Card)?$/.exec(window.location.hash || "");
    return m ? Number(m[1]) : null;
  }

  function goToStep(n) {
    if (window.location.hash === `#step${n}`) showStep(n, { scroll: true });
    else window.location.hash = `step${n}`;
  }

  function showStep(n, opts = {}) {
    if (!(n >= 1 && n <= STEP_COUNT)) n = 1;
    const fromIntro = leaveIntro();
    currentStep = n;
    const shellEl = document.querySelector(".app-shell");
    if (shellEl) shellEl.dataset.step = String(n);
    visitedSteps.add(n);
    document.querySelectorAll(".step-panel").forEach((p) => {
      p.classList.toggle("is-current", Number(p.dataset.step) === n);
    });
    document.querySelectorAll(".step-item").forEach((li) => {
      const k = Number(li.dataset.step);
      li.classList.toggle("is-current", k === n);
      const a = li.querySelector(".step-link");
      if (!a) return;
      if (k === n) a.setAttribute("aria-current", "step");
      else a.removeAttribute("aria-current");
    });
    const stepTitle = el(`step${n}Title`)?.textContent?.trim();
    if (stepTitle) document.title = `${n}단계 ${stepTitle} | 공공조달 문서 작성 및 변경 관리`;
    renderFlowStatus();
    if (fromIntro) {
      window.scrollTo(0, 0);
      reveal([".flow-rail", ".flow-main"], { opacity: 0, y: 10, duration: 0.35, stagger: 0.08 });
      return;
    }
    if (opts.scroll) {
      const main = el("flowMain");
      if (!main) return;
      const wide = window.matchMedia("(min-width: 1200px)").matches;
      const railH = wide ? 0 : document.querySelector(".flow-rail")?.offsetHeight || 0;
      const top = main.getBoundingClientRect().top;
      if (top < railH || top > window.innerHeight * 0.4) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: Math.max(0, window.scrollY + top - railH - 12), behavior: reduce ? "auto" : "smooth" });
      }
    }
  }

  function revisedDocs(c) {
    const revs = ensureRevs(c);
    return DOC_REGISTRY.filter((d) => revs[d.id] > 1);
  }

  function renderDocBoard(c) {
    const list = el("docBoardList");
    if (!list || !c) return;
    const revs = ensureRevs(c);
    list.innerHTML = DOC_REGISTRY.map((d) => {
      const upd = revs[d.id] > 1;
      return `
        <li>
          <button type="button" class="doc-board-row ${upd ? "updated" : ""}" data-doc="${esc(d.id)}">
            <span class="doc-board-name">${esc(d.name)}</span>
            <span class="rev-tag ${upd ? "updated" : ""}">Rev.${revs[d.id]}</span>
          </button>
        </li>`;
    }).join("");
    const n = revisedDocs(c).length;
    el("docBoardCount").textContent = n ? `개정 ${n}종 · 유지 ${DOC_REGISTRY.length - n}종` : `${DOC_REGISTRY.length}종 모두 Rev.1`;
    el("docBoard")?.classList.toggle("has-updates", n > 0);
  }

  function renderFlowStatus() {
    const c = activeCase;
    if (!c) return;
    const setState = (n, text, done) => {
      const node = el(`stepState${n}`);
      if (node) node.textContent = text;
      document.querySelector(`.step-item[data-step="${n}"]`)?.classList.toggle("is-done", Boolean(done));
    };
    setState(1, "공고 분석 완료", true);
    setState(2, visitedSteps.has(2) ? "서식 확인함" : "확인 전", visitedSteps.has(2));
    const revised = revisedDocs(c).length;
    if (revised) setState(3, `${revised}종 개정 반영`, true);
    else if (pendingProposal) setState(3, `분석됨 · ${pendingProposal.selectedIds.length}종 선택`, false);
    else setState(3, "요청 대기", false);
    const items = getChecklistItems(c);
    const doneCount = items.filter((it) => checkedItems[it.id]).length;
    setState(4, `점검 ${doneCount} / ${items.length}`, doneCount === items.length);
    renderDocBoard(c);
    renderDocPicker();
    renderImpactBoard();
  }

  function openDocInStep2(id) {
    if (BASIC4_IDS.includes(id)) {
      el("easyFormBasic4Btn")?.click();
      document.querySelector(`.b4-tab[data-doc="${id}"]`)?.click();
    } else if (id === "form_company_staff") {
      el("easyFormStaffBtn")?.click();
    } else if (id === "form_project_plan") {
      el("easyFormPlanBtn")?.click();
    }
    goToStep(2);
  }

  /* ---------- 첫 화면: 공고 파일을 끌어다 놓으면 3단계를 실제로 실행 ---------- */
  const gsapLib = window.gsap || null;
  if (gsapLib) {
    const plugins = [window.Flip, window.SplitText, window.ScrambleTextPlugin, window.CustomEase].filter(Boolean);
    if (plugins.length) gsapLib.registerPlugin(...plugins);
  }
  // One signature ease for every movement: fast start, long soft landing.
  const EASE = gsapLib && window.CustomEase ? (window.CustomEase.create("dsc", "0.22, 1, 0.36, 1"), "dsc") : "power2.out";
  const prefersReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animOK = () => Boolean(gsapLib) && !prefersReduced();
  const pause = (ms) => new Promise((r) => setTimeout(r, prefersReduced() ? 0 : ms));

  // GSAP ticks on requestAnimationFrame. If frames stall (background tab, slow projector PC),
  // force every tween to its end state on a timer so content is never left half-faded.
  function settle(tween, extraMs = 250) {
    if (!tween) return tween;
    const ms = (tween.totalDuration ? tween.totalDuration() : 0.5) * 1000 + extraMs;
    setTimeout(() => {
      if (tween.progress() < 1) tween.progress(1);
    }, ms);
    return tween;
  }

  function reveal(targets, vars) {
    if (!animOK()) return null;
    return settle(gsapLib.from(targets, { ease: EASE, clearProps: "opacity,transform", ...vars }));
  }
  let introRunning = false;
  let dataReady = Promise.resolve();

  function isIntroHash() {
    const h = window.location.hash;
    return !h || h === "#start";
  }

  function showIntro() {
    const shell = document.querySelector(".app-shell");
    const stage = el("introStage");
    if (!shell || !stage) return;
    shell.classList.add("intro-on");
    stage.hidden = false;
    document.title = "공고 파일 넣기 | 공공조달 문서 작성 및 변경 관리";
    reveal(stage.querySelectorAll(".intro-head > *, .drop-zone, .sample-tray"), {
      opacity: 0, y: 12, duration: 0.45, stagger: 0.06,
    });
  }

  function leaveIntro() {
    const shell = document.querySelector(".app-shell");
    if (!shell || !shell.classList.contains("intro-on")) return false;
    shell.classList.remove("intro-on");
    el("introStage").hidden = true;
    return true;
  }

  function setRunStage(n, state, detail) {
    const li = document.querySelector(`.run-stage[data-stage="${n}"]`);
    if (!li) return;
    li.classList.remove("is-active", "is-done", "is-error");
    if (state) li.classList.add(`is-${state}`);
    if (detail != null) el(`runDetail${n}`).textContent = detail;
  }

  function liveQtyCheck(c) {
    const q = c.doc_chain.quotation.items || [];
    const po = c.doc_chain.purchase_order.items || [];
    const di = c.doc_chain.delivery_inspection.items || [];
    if (!q.length || q.length !== po.length || q.length !== di.length) return false;
    return q.every((it, i) => {
      const ordered = Number(di[i].ordered_qty ?? di[i].delivered_qty);
      return Number(it.qty) === Number(po[i].qty) && Number(it.qty) === ordered;
    });
  }

  function flyIntoDropZone(srcBtn) {
    const from = srcBtn?.querySelector(".file-glyph");
    const to = el("dropGlyph");
    if (!from || !to || !window.Flip) return;
    const r = from.getBoundingClientRect();
    const clone = from.cloneNode(true);
    Object.assign(clone.style, {
      position: "fixed", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      margin: "0", zIndex: "60", pointerEvents: "none",
    });
    document.body.appendChild(clone);
    gsapLib.set(to, { opacity: 0 });
    settle(
      window.Flip.fit(clone, to, {
        duration: 0.55, ease: "power3.inOut", scale: true,
        onComplete: () => {
          clone.remove();
          gsapLib.set(to, { opacity: 1 });
        },
      })
    );
  }

  function renderIntroResult(precomputed) {
    const c = activeCase;
    const dc = c.doc_chain;
    const revs = ensureRevs(c);
    const loc = dc.delivery_inspection.delivery_location || c.delivery_location || "-";
    const cards = [
      { id: "quotation", name: "표준 견적서", k: "견적 총액", v: won(dc.quotation.grand_total) },
      { id: "purchase_order", name: "발주서 · 작업지시서", k: "납기", v: dc.purchase_order.due_date || "-" },
      { id: "delivery_inspection", name: "거래명세 · 납품검수조서", k: `검수 품목 ${dc.delivery_inspection.items.length}건`, v: loc },
      { id: "expense_approval", name: "지출결의 · 내부 품의서", k: "품의 금액", v: won(dc.expense_approval.grand_total) },
    ];
    el("resultCards").innerHTML = cards
      .map(
        (cd) => `
        <button type="button" class="result-card" data-doc="${esc(cd.id)}">
          <span class="result-card-top">
            <span class="result-card-name">${esc(cd.name)}</span>
            <span class="rev-tag">Rev.${revs[cd.id]}</span>
          </span>
          <span class="result-card-k">${esc(cd.k)}</span>
          <span class="result-card-v">${esc(cd.v)}</span>
        </button>`
      )
      .join("");
    el("resultNote").textContent = precomputed
      ? "견적 단가는 시연용 예시값입니다. 실제 제출 전에 기업 단가와 원문 조건으로 바꾸십시오. 서식을 누르면 내용을 볼 수 있습니다."
      : "공개 샘플이 아닌 파일은 AI 추출 없이 규칙으로만 정리합니다. 모든 항목을 원문과 대조하십시오.";
    const box = el("introResult");
    box.hidden = false;
    reveal(box.querySelectorAll(".result-title, .result-card, .result-note, .result-actions"), {
      opacity: 0, y: 14, duration: 0.4, stagger: 0.07,
    });
  }

  async function runIntroFile(file, srcBtn) {
    if (introRunning || !file) return;
    el("dropError").textContent = "";
    if (!/\.(hwp|hwpx)$/i.test(file.name)) {
      el("dropError").textContent = "한글 파일(.hwp, .hwpx)만 읽을 수 있습니다. 파일 형식을 확인하십시오.";
      return;
    }
    introRunning = true;
    const zone = el("dropZone");
    zone.classList.add("is-busy");
    zone.setAttribute("aria-busy", "true");

    const ext = /\.hwpx$/i.test(file.name) ? "HWPX" : "HWP";
    const glyph = el("dropGlyph");
    glyph.dataset.ext = ext;
    glyph.querySelector("span").textContent = ext;
    if (animOK()) {
      if (srcBtn) flyIntoDropZone(srcBtn);
      else settle(gsapLib.fromTo(glyph, { scale: 0.88 }, { scale: 1, duration: 0.4, ease: "back.out(2)", clearProps: "transform" }));
    }

    const run = el("introRun");
    run.hidden = false;
    el("introResult").hidden = true;
    el("runFileName").textContent = file.name;
    el("runSource").textContent = "";
    [1, 2, 3].forEach((n) => setRunStage(n, null, "대기"));
    document.querySelector('.run-stage[data-stage="2"]')?.classList.remove("is-ai");
    reveal(run, { opacity: 0, y: 10, duration: 0.3 });
    run.scrollIntoView({ block: "nearest", behavior: prefersReduced() ? "auto" : "smooth" });

    try {
      await dataReady;
      setRunStage(1, "active", "본문과 표를 읽는 중…");
      const parsed = await window.HwpBrowserParser.parseHwpFile(file);
      await pause(450);
      const fmt = /HWPX/i.test(parsed.format_type || "") ? "HWPX" : "HWP 5.0";
      setRunStage(1, "done", `${fmt} · ${num(parsed.paragraph_count)}문단 · 표 ${num(parsed.table_count)}개`);

      setRunStage(2, "active", "거래조건을 정리하는 중…");
      const known = cases.find((c) => c.parse_info?.filename === file.name);
      let caseObj;
      if (known) {
        caseObj = known;
      } else {
        const structured = window.HwpBrowserParser.buildFallbackChainFromParsed(parsed);
        caseObj = {
          id: "uploaded_notice",
          short_title: file.name,
          parse_info: parsed,
          source_summary: structured.source_summary,
          doc_chain: structured.doc_chain,
        };
      }
      const who = document.querySelector('.run-stage[data-stage="2"] .run-who');
      if (who) who.textContent = known ? "AI" : "규칙";
      selectEasyCase(caseObj);
      refreshActiveEasyForm();
      await pause(450);
      const summary = activeCase.source_summary || {};
      const dueDate = activeCase.doc_chain.purchase_order.due_date || "-";
      setRunStage(
        2,
        "done",
        `공고번호 ${summary.notice_number || "원문 미기재"} · 납기 ${dueDate} · 품목 ${activeCase.doc_chain.quotation.items.length}건`
      );
      if (known) document.querySelector('.run-stage[data-stage="2"]')?.classList.add("is-ai");
      el("runSource").textContent = known
        ? "공개 샘플: 사전 추출 결과 (BAZE gpt-6.1-terra)"
        : "규칙 기반 추출 (LLM 미사용)";

      setRunStage(3, "active", "금액과 수량을 검산하는 중…");
      await pause(450);
      const q = activeCase.doc_chain.quotation;
      const qtyOk = liveQtyCheck(activeCase);
      setRunStage(
        3,
        qtyOk ? "done" : "error",
        `공급가액 ${won(q.total_supply)} + 부가세 ${won(q.vat)} = ${won(q.grand_total)} · 견적·발주·검수 수량 ${qtyOk ? "일치" : "불일치, 원문 확인 필요"}`
      );
      renderIntroResult(Boolean(known));
    } catch (err) {
      const active = document.querySelector(".run-stage.is-active");
      const n = active ? Number(active.dataset.stage) : 1;
      setRunStage(n, "error", `읽지 못했습니다: ${err.message}. 다른 파일로 다시 시도하십시오.`);
    } finally {
      introRunning = false;
      zone.classList.remove("is-busy");
      zone.removeAttribute("aria-busy");
    }
  }

  async function runSampleFile(filename, btn) {
    if (introRunning) return;
    try {
      const resp = await fetch(`samples/${encodeURIComponent(filename)}?v=${ASSET_VER}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      await runIntroFile(new File([blob], filename), btn);
    } catch (err) {
      el("dropError").textContent = `샘플을 불러오지 못했습니다: ${err.message}. 새로고침 후 다시 시도하십시오.`;
    }
  }

  function bindIntroEvents() {
    const stage = el("introStage");
    const zone = el("dropZone");
    const input = el("introFileInput");
    if (!stage || !zone) return;

    zone.addEventListener("click", (e) => {
      if (e.target !== input) input?.click();
    });
    zone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input?.click();
      }
    });
    input?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) runIntroFile(f, null);
      input.value = "";
    });

    let depth = 0;
    stage.addEventListener("dragenter", (e) => {
      e.preventDefault();
      depth += 1;
      zone.classList.add("is-over");
    });
    stage.addEventListener("dragleave", () => {
      depth = Math.max(0, depth - 1);
      if (!depth) zone.classList.remove("is-over");
    });
    stage.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    });
    stage.addEventListener("drop", (e) => {
      e.preventDefault();
      depth = 0;
      zone.classList.remove("is-over");
      const sample = e.dataTransfer?.getData("text/x-sample-file");
      if (sample) {
        const btn = [...document.querySelectorAll(".sample-file")].find((b) => b.dataset.file === sample);
        runSampleFile(sample, btn);
        return;
      }
      const f = e.dataTransfer?.files?.[0];
      if (f) runIntroFile(f, null);
    });
    // A file dropped next to the program must not make the browser navigate away from the demo.
    ["dragover", "drop"].forEach((type) =>
      window.addEventListener(type, (e) => {
        if (!stage.contains(e.target) && e.dataTransfer?.types?.includes("Files")) e.preventDefault();
      })
    );

    const tray = el("sampleTray");
    tray?.addEventListener("dragstart", (e) => {
      const b = e.target.closest(".sample-file");
      if (!b || !e.dataTransfer) return;
      e.dataTransfer.setData("text/x-sample-file", b.dataset.file);
      e.dataTransfer.effectAllowed = "copy";
    });
    tray?.addEventListener("click", (e) => {
      const b = e.target.closest(".sample-file");
      if (b) runSampleFile(b.dataset.file, b);
    });

    el("resultCards")?.addEventListener("click", (e) => {
      const card = e.target.closest(".result-card");
      if (card) openDocInStep2(card.dataset.doc);
    });
    el("introAgainBtn")?.addEventListener("click", () => {
      el("introRun").hidden = true;
      el("dropError").textContent = "";
      window.scrollTo({ top: 0, behavior: prefersReduced() ? "auto" : "smooth" });
      zone.focus({ preventScroll: true });
    });
  }

  /* ---------- 2단계 서식 선택 타일, 3단계 개정 판정 보드 ---------- */
  const PICKER_TILES = [
    { key: "kimm", group: "기관 제출 양식", name: "수의계약 확인서", sub: "한국기계연구원 · .hwpx", btn: "easyFormKimmBtn" },
    { key: "staff", group: "기관 제출 양식", name: "업체 일반현황 · 인력표", sub: ".hwpx", btn: "easyFormStaffBtn", revId: "form_company_staff" },
    { key: "plan", group: "기관 제출 양식", name: "사업수행계획서 요약", sub: ".hwpx", btn: "easyFormPlanBtn", revId: "form_project_plan" },
    { key: "custom", group: "기관 제출 양식", name: "외부 양식 불러오기…", sub: "다른 기관 .hwpx", btn: "easyCustomFormBtn", ghost: true },
    { key: "quotation", group: "거래 서식 4종", name: "표준 견적서", sub: "견적 총액", b4: true, revId: "quotation" },
    { key: "purchase_order", group: "거래 서식 4종", name: "발주 · 작업지시서", sub: "납기", b4: true, revId: "purchase_order" },
    { key: "delivery_inspection", group: "거래 서식 4종", name: "거래명세 · 검수조서", sub: "검수 품목", b4: true, revId: "delivery_inspection" },
    { key: "expense_approval", group: "거래 서식 4종", name: "지출결의 · 품의서", sub: "품의 금액", b4: true, revId: "expense_approval" },
  ];

  function pickerValue(tile, c) {
    if (!c || !tile.b4) return tile.sub;
    const dc = c.doc_chain;
    if (tile.key === "quotation") return won(dc.quotation.grand_total);
    if (tile.key === "purchase_order") return `납기 ${dc.purchase_order.due_date || "-"}`;
    if (tile.key === "delivery_inspection") return `검수 품목 ${dc.delivery_inspection.items.length}건`;
    if (tile.key === "expense_approval") return won(dc.expense_approval.grand_total);
    return tile.sub;
  }

  const pickerSeen = {};

  function renderDocPicker() {
    const box = el("docPicker");
    if (!box || !activeCase) return;
    const revs = ensureRevs(activeCase);
    const isActive = (t) => (t.b4 ? activeFormKey === "basic4" && activeB4Doc === t.key : activeFormKey === t.key);
    const groups = [...new Set(PICKER_TILES.map((t) => t.group))];
    box.innerHTML = groups
      .map(
        (g) => `
        <div class="picker-group">
          <p class="picker-label">${esc(g)}</p>
          <div class="picker-row">
            ${PICKER_TILES.filter((t) => t.group === g)
              .map((t) => {
                const rev = t.revId ? revs[t.revId] : null;
                const on = isActive(t);
                return `
                <button type="button" class="pick-tile ${on ? "is-active" : ""} ${t.ghost ? "is-ghost" : ""}" data-pick="${esc(t.key)}" aria-pressed="${on}">
                  <span class="pick-top">
                    <span class="pick-name">${esc(t.name)}</span>
                    ${rev ? `<span class="rev-tag ${rev > 1 ? "updated" : ""}">Rev.${rev}</span>` : ""}
                  </span>
                  <span class="pick-sub" data-key="${esc(t.key)}">${esc(pickerValue(t, activeCase))}</span>
                </button>`;
              })
              .join("")}
          </div>
        </div>`
      )
      .join("");
    if (currentStep !== 2 || document.querySelector(".app-shell")?.classList.contains("intro-on")) return;
    box.querySelectorAll(".pick-sub[data-key]").forEach((node) => {
      const key = node.dataset.key;
      const now = node.textContent;
      const before = pickerSeen[key];
      pickerSeen[key] = now;
      if (before && before !== now && /\d/.test(now)) rollNumber(node, now, before, 0.7);
    });
  }

  function pickDoc(key) {
    const tile = PICKER_TILES.find((t) => t.key === key);
    if (!tile) return;
    if (tile.b4) {
      if (activeFormKey !== "basic4") el("easyFormBasic4Btn")?.click();
      document.querySelector(`.b4-tab[data-doc="${tile.key}"]`)?.click();
      playSheetIn();
    } else {
      if (!tile.ghost) animateFieldsNext = true;
      el(tile.btn)?.click();
    }
    renderDocPicker();
  }

  function impactState() {
    if (!activeCase) return "idle";
    const applyBtn = el("easyApplyChangeBtn");
    if (pendingProposal && applyBtn && !applyBtn.disabled) return "pending";
    if (revisedDocs(activeCase).length) return "applied";
    return "idle";
  }

  function renderImpactBoard() {
    const board = el("impactBoard");
    if (!board || !activeCase) return;
    const revs = ensureRevs(activeCase);
    const state = impactState();
    const total = DOC_REGISTRY.length;
    const rows = pendingProposal?.impactRows || [];
    const reasonOf = (id) => rows.find((r) => r.id === id)?.reason || "";
    let head = "";
    let tiles = "";

    if (state === "pending") {
      const sel = new Set(pendingProposal.selectedIds);
      head = `
        <p class="verdict"><span class="verdict-num count-up">${sel.size}</span><span class="verdict-text">${total}종 중 ${sel.size}종만 개정합니다</span></p>
        <p class="verdict-sub">나머지 ${total - sel.size}종은 그대로 둡니다. 서류를 눌러 개정 대상을 바꿀 수 있습니다.</p>`;
      tiles = [...rows]
        .sort((a, b) => Number(sel.has(b.id)) - Number(sel.has(a.id)))
        .map((r) => {
          const on = sel.has(r.id);
          return `
          <button type="button" class="rev-tile ${on ? "is-target" : "is-keep"}" data-id="${esc(r.id)}" role="checkbox" aria-checked="${on}">
            <span class="rev-tile-top">
              <span class="rev-tile-name">${esc(r.name)}</span>
              <span class="rev-change">${on ? `Rev.${r.currentRev} → Rev.${r.currentRev + 1}` : `Rev.${r.currentRev} 유지`}</span>
            </span>
            <span class="rev-tile-kind">${esc(r.kind)}</span>
            <span class="rev-tile-reason">${esc(r.reason)}</span>
          </button>`;
        })
        .join("");
    } else {
      const changed = DOC_REGISTRY.filter((d) => revs[d.id] > 1);
      head =
        state === "applied"
          ? `<p class="verdict"><span class="verdict-num count-up">${changed.length}</span><span class="verdict-text">${total}종 중 ${changed.length}종을 개정했습니다</span></p>
             <p class="verdict-sub">개정본만 다시 제출하면 됩니다. 나머지 ${total - changed.length}종은 기존 버전 그대로입니다.</p>`
          : `<p class="verdict verdict-idle"><span class="verdict-text">변경 요청을 넣으면 6종 중 바꿀 서류만 골라냅니다</span></p>
             <p class="verdict-sub">위 예시 요청을 누르거나 받은 메일을 붙여 넣으십시오.</p>`;
      const ordered = state === "applied" ? [...DOC_REGISTRY].sort((a, b) => Number(revs[b.id] > 1) - Number(revs[a.id] > 1)) : DOC_REGISTRY;
      tiles = ordered.map((d) => {
        const upd = revs[d.id] > 1;
        const reason = state === "applied" ? (upd ? reasonOf(d.id) : "변동 없음") : "";
        return `
          <div class="rev-tile ${upd ? "is-done" : state === "applied" ? "is-keep" : "is-idle"}">
            <span class="rev-tile-top">
              <span class="rev-tile-name">${esc(d.name)}</span>
              <span class="rev-tag ${upd ? "updated" : ""}">Rev.${revs[d.id]}</span>
            </span>
            <span class="rev-tile-kind">${esc(d.kind)}</span>
            ${reason ? `<span class="rev-tile-reason">${esc(reason)}</span>` : ""}
          </div>`;
      }).join("");
    }
    board.dataset.state = state;
    board.innerHTML = `<div class="verdict-wrap">${head}</div><div class="rev-grid">${tiles}</div>`;
    if (scanNext && state === "pending") {
      scanNext = false;
      // Several renders happen in the same tick; animate the final DOM once they settle.
      setTimeout(playImpactScan, 0);
    }

    document.querySelectorAll(".ex-btn").forEach((b) => {
      b.setAttribute("aria-pressed", String(el("easyScenarioSelect")?.value === b.dataset.sc));
    });
  }

  /* ---------- "it worked" motion: show the work that just happened ---------- */
  let scanNext = false;
  let animateFieldsNext = false;

  // Odometer-style roll: each digit column slides from its old digit to the new one.
  function rollNumber(node, toText, fromText = "", dur = 0.6) {
    if (!node) return null;
    const finalText = String(toText);
    if (!animOK()) {
      node.textContent = finalText;
      return null;
    }
    const from = String(fromText).replace(/\D/g, "");
    const digitsTo = finalText.replace(/\D/g, "").length;
    const padded = from.padStart(digitsTo, "0").slice(-digitsTo);
    let di = 0;
    node.setAttribute("aria-label", finalText);
    node.innerHTML = [...finalText]
      .map((ch) => {
        if (!/\d/.test(ch)) return `<span class="odo-static" aria-hidden="true">${esc(ch)}</span>`;
        const start = Number(padded[di] || 0);
        di += 1;
        const strip = Array.from({ length: 10 }, (_, k) => `<span>${k}</span>`).join("");
        return `<span class="odo-col" aria-hidden="true"><span class="odo-strip" data-from="${start}" data-to="${ch}">${strip}</span></span>`;
      })
      .join("");
    const strips = [...node.querySelectorAll(".odo-strip")];
    strips.forEach((st) => gsapLib.set(st, { yPercent: -Number(st.dataset.from) * 10 }));
    const tl = gsapLib.timeline({
      onComplete: () => {
        node.textContent = finalText;
        node.removeAttribute("aria-label");
      },
    });
    strips.forEach((st, i) => {
      tl.to(st, { yPercent: -Number(st.dataset.to) * 10, duration: dur, ease: EASE }, (strips.length - 1 - i) * 0.04);
    });
    return settle(tl);
  }

  function countUp(node, to, dur = 0.5) {
    return rollNumber(node, to, "0", dur);
  }

  function playImpactScan() {
    const board = el("impactBoard");
    if (!board || board.dataset.state !== "pending" || !animOK()) return;
    const grid = board.querySelector(".rev-grid");
    const sortedTiles = [...board.querySelectorAll(".rev-tile")];
    const regIndex = (t) => DOC_REGISTRY.findIndex((d) => d.id === t.dataset.id);
    const scanTiles = [...sortedTiles].sort((a, b) => regIndex(a) - regIndex(b));
    const wrap = board.querySelector(".verdict-wrap");
    const card = el("step3Card");
    const analyzeBtn = el("easyAnalyzeChangeBtn");
    const verdictHtml = wrap ? wrap.innerHTML : "";
    const verdictNum = board.querySelector(".verdict-num")?.textContent || "0";

    // Read the documents in their natural order; the result order comes after.
    scanTiles.forEach((t) => grid?.appendChild(t));
    scanTiles.forEach((t) => t.classList.add("scan-pending"));
    if (wrap) wrap.innerHTML = `<p class="verdict-scan"><span class="scan-bar" aria-hidden="true"></span>서류 ${scanTiles.length}종을 하나씩 대조하는 중…</p>`;
    card?.classList.add("scan-lock");
    analyzeBtn?.classList.add("is-busy");

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      scanTiles.forEach((t) => t.classList.remove("scan-pending", "scan-now"));
      // Changed documents slide to the top of the grid.
      if (grid && window.Flip) {
        const state = window.Flip.getState(sortedTiles);
        sortedTiles.forEach((t) => grid.appendChild(t));
        settle(window.Flip.from(state, { duration: 0.5, ease: EASE, absolute: false }));
      } else {
        sortedTiles.forEach((t) => grid?.appendChild(t));
      }
      card?.classList.remove("scan-lock");
      analyzeBtn?.classList.remove("is-busy");
      if (!wrap) return;
      wrap.innerHTML = verdictHtml;
      countUp(wrap.querySelector(".verdict-num"), verdictNum, 0.5);
      const textEl = wrap.querySelector(".verdict-text");
      if (textEl && window.SplitText) {
        const split = new window.SplitText(textEl, { type: "chars" });
        settle(
          gsapLib.from(split.chars, {
            opacity: 0, duration: 0.01, stagger: 0.035, ease: "none",
            onComplete: () => split.revert(),
          }),
          200
        );
      }
      reveal(wrap.querySelectorAll(".verdict-sub"), { opacity: 0, y: 4, duration: 0.3, delay: 0.35 });
    };

    const step = 0.13;
    const tl = gsapLib.timeline({ onComplete: finish });
    scanTiles.forEach((t, i) => {
      const at = i * step;
      const label = t.querySelector(".rev-change");
      const finalLabel = label?.textContent || "";
      tl.call(() => t.classList.add("scan-now"), null, at);
      tl.call(() => t.classList.remove("scan-now", "scan-pending"), null, at + 0.1);
      if (label && window.ScrambleTextPlugin) {
        tl.call(() => (label.textContent = ""), null, at);
        tl.to(
          label,
          { duration: 0.32, scrambleText: { text: finalLabel, chars: "0123456789REV.→", speed: 0.9 }, ease: "none" },
          at + 0.1
        );
        tl.call(() => (label.textContent = finalLabel), null, at + 0.44);
      }
      tl.fromTo(t, { scale: 0.97 }, { scale: 1, duration: 0.22, ease: EASE, clearProps: "transform" }, at + 0.1);
    });
    tl.to({}, { duration: 0.18 });
    settle(tl, 300);
    setTimeout(finish, (tl.totalDuration() + 0.6) * 1000);
  }

  function playApplyRoll() {
    const board = el("impactBoard");
    if (!board || board.dataset.state !== "applied" || !animOK()) return;
    const tiles = [...board.querySelectorAll(".rev-tile.is-done")];
    tiles.forEach((t, i) => {
      const tag = t.querySelector(".rev-tag");
      if (!tag) return;
      const finalText = tag.textContent;
      const m = /Rev\.(\d+)/.exec(finalText);
      const oldText = m ? `Rev.${Math.max(1, Number(m[1]) - 1)}` : finalText;
      tag.classList.remove("updated");
      tag.textContent = oldText;
      setTimeout(() => {
        tag.classList.add("updated");
        rollNumber(tag, finalText, oldText, 0.45);
        settle(gsapLib.fromTo(t, { scale: 0.97 }, { scale: 1, duration: 0.3, ease: EASE, clearProps: "transform" }));
      }, 150 + i * 180);
    });
    countUp(board.querySelector(".verdict-num"), tiles.length, 0.45);
  }

  function playFieldFill() {
    if (!animOK()) return;
    const rows = el("easySlotTableWrap")?.querySelectorAll("tbody tr");
    if (rows?.length) reveal(rows, { opacity: 0, y: 6, duration: 0.22, stagger: 0.035 });
    el("easyFormTitle")?.querySelectorAll(".count-up").forEach((n) => countUp(n, n.textContent, 0.55));
  }

  function playSheetIn() {
    reveal(el("easyA4Sheet"), { opacity: 0, y: 10, duration: 0.3 });
  }

  function bindRedesignEvents() {
    el("easyApplyChangeBtn")?.addEventListener("click", () => setTimeout(playApplyRoll, 0));
    el("docPicker")?.addEventListener("click", (e) => {
      const t = e.target.closest(".pick-tile");
      if (t) pickDoc(t.dataset.pick);
    });
    document.querySelectorAll(".ex-btn").forEach((b) =>
      b.addEventListener("click", () => {
        const sel = el("easyScenarioSelect");
        if (!sel) return;
        sel.value = b.dataset.sc;
        sel.dispatchEvent(new Event("change"));
      })
    );
    el("impactBoard")?.addEventListener("click", (e) => {
      const tile = e.target.closest(".rev-tile[role='checkbox']");
      if (!tile) return;
      const cb = el("easyImpactGrid")?.querySelector(`.easy-imp-cb[data-id="${tile.dataset.id}"]`);
      if (!cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event("change"));
    });
  }

  function bindFlowEvents() {
    window.addEventListener("hashchange", () => {
      const n = stepFromHash();
      if (n) showStep(n, { scroll: true });
      else if (isIntroHash()) showIntro();
    });
    el("docBoardList")?.addEventListener("click", (e) => {
      const row = e.target.closest(".doc-board-row");
      if (row) openDocInStep2(row.dataset.doc);
    });
    el("docBoardToggle")?.addEventListener("click", () => {
      const board = el("docBoard");
      const open = !board.classList.contains("open");
      board.classList.toggle("open", open);
      el("docBoardToggle").setAttribute("aria-expanded", String(open));
    });
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

    el("easyCaseSelect")?.addEventListener("change", (e) => {
      const found = cases.find((c) => c.id === e.target.value);
      if (found) {
        setStatus("easyNoticeStatus", "");
        selectEasyCase(found);
        refreshActiveEasyForm();
      }
    });

    const ni = el("easyNoticeInput");
    el("easyNoticeUploadBtn")?.addEventListener("click", () => ni?.click());
    ni?.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f || !window.HwpBrowserParser) return;
      setStatus("easyNoticeStatus", `문서 분석 중: ${f.name}`);
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
        setStatus("easyNoticeStatus", `분석 완료: ${f.name} (${parsed.paragraph_count}문단, ${parsed.table_count}표 추출)`);
        refreshActiveEasyForm();
      } catch (err) {
        setStatus("easyNoticeStatus", `분석 오류: ${err.message}`, true);
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
      await loadFormBuffer(await f.arrayBuffer(), `filled_${f.name}`, "custom");
      cfi.value = "";
    });

    el("easyDownloadHwpxBtn")?.addEventListener("click", async () => {
      if (!activeFormBuffer || !activeFormPlan) return;
      const btn = el("easyDownloadHwpxBtn");
      btn.disabled = true;
      btn.classList.add("is-busy");
      btn.setAttribute("aria-busy", "true");
      setStatus("easyFormStatus", "한글 파일 생성 중…");
      try {
        const res = await window.HwpBrowserParser.applySlotPlanToHwpx(activeFormBuffer, activeFormPlan.slots);
        triggerDownloadBlob(res.blob, activeFormFilename);
        setStatus("easyFormStatus", `저장 완료: ${activeFormFilename} (반영 ${res.filledCount}건)`);
      } catch (err) {
        setStatus("easyFormStatus", `저장하지 못했습니다: ${err.message}. 양식을 다시 불러온 뒤 시도하십시오.`, true);
      } finally {
        btn.disabled = false;
        btn.classList.remove("is-busy");
        btn.removeAttribute("aria-busy");
      }
    });

    el("easyDownloadCsvBtn")?.addEventListener("click", () => {
      if (activeCase) exportCsvForErp(activeCase);
    });

    el("easyScenarioSelect")?.addEventListener("change", (e) => {
      if (e.target.value) applyScenarioPreset(e.target.value);
    });

    el("easyAnalyzeChangeBtn")?.addEventListener("click", runChangeAnalysis);

    el("easyApplyChangeBtn")?.addEventListener("click", () => {
      if (!pendingProposal || !pendingProposal.afterCase) return;
      const n = pendingProposal.selectedIds.length;
      activeCase = deepClone(pendingProposal.afterCase);
      renderStep1Summary(activeCase);
      renderRevBadges(activeCase);
      renderEasyBasic4Sheet();
      renderStep4Easy(activeCase);
      refreshActiveEasyForm();
      setApplyButtonState(false, 0);
      setStatus("easyChangeStatus", `개정 반영 완료: 선택 서식 ${n}종이 Rev.2로 갱신되었습니다.`);
    });

    let undoSnapshot = null;
    const undoBtn = el("easyUndoRevertBtn");
    const hideUndo = () => {
      undoSnapshot = null;
      undoBtn?.classList.add("hidden");
    };

    el("easyRevertBtn")?.addEventListener("click", () => {
      if (!baselineCase) return;
      undoSnapshot = activeCase ? deepClone(activeCase) : null;
      selectEasyCase(baselineCase);
      refreshActiveEasyForm();
      setStatus("easyChangeStatus", "초기 상태(Rev.1)로 복원했습니다. 실수였다면 '복원 취소'를 누르십시오.");
      if (undoSnapshot) undoBtn?.classList.remove("hidden");
    });

    undoBtn?.addEventListener("click", () => {
      if (!undoSnapshot) return;
      activeCase = undoSnapshot;
      hideUndo();
      renderStep1Summary(activeCase);
      renderRevBadges(activeCase);
      renderEasyBasic4Sheet();
      renderStep4Easy(activeCase);
      refreshActiveEasyForm();
      setStatus("easyChangeStatus", "복원을 취소했습니다. 개정 상태를 되돌렸습니다.");
    });

    ["easyAnalyzeChangeBtn", "easyApplyChangeBtn", "easyScenarioSelect", "easyCaseSelect"].forEach((id) =>
      el(id)?.addEventListener(id.endsWith("Select") ? "change" : "click", hideUndo)
    );

    el("easyChangeInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        runChangeAnalysis();
      }
    });

    el("easyCopyReplyBtn")?.addEventListener("click", () =>
      copyTextWithFeedback(el("easyReplyBox")?.textContent || "", el("easyCopyReplyBtn"), "회신 문안 복사")
    );

    el("easyCopyChecklistBtn")?.addEventListener("click", () => {
      if (!activeCase) return;
      const lines = getChecklistItems(activeCase).map(
        (it) => `[${checkedItems[it.id] ? "x" : " "}] ${it.title}\n    - ${it.detail}`
      );
      copyTextWithFeedback(lines.join("\n"), el("easyCopyChecklistBtn"), "점검 목록 복사");
    });

    document.querySelectorAll(".easy-ptab").forEach((b) => {
      b.addEventListener("click", () => {
        activePromptKey = b.dataset.prompt || "step1_prep";
        if (activeCase) renderStep4Easy(activeCase);
      });
    });

    el("easyCopyPromptBtn")?.addEventListener("click", () =>
      copyTextWithFeedback(el("easyPromptBox")?.textContent || "", el("easyCopyPromptBtn"), "프롬프트 복사")
    );
  }

  async function init() {
    document.querySelector(".app-shell")?.classList.add("flow-on");
    const startStep = stepFromHash();
    if (startStep) showStep(startStep);
    else if (isIntroHash()) showIntro();
    else showStep(1);
    loadProfile();
    bindEvents();
    bindFlowEvents();
    bindIntroEvents();
    bindRedesignEvents();
    let markReady;
    dataReady = new Promise((r) => (markReady = r));
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
      el("easySummaryCards").innerHTML = `<div class="notice-box warn">데이터를 불러오지 못했습니다: ${esc(err.message)}</div>`;
    }
    markReady();
  }

  init();
})();
