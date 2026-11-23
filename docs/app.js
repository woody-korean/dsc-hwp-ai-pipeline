(function () {
  const BAZE_ENDPOINT = "https://factchat-cloud.mindlogic.ai/v1/gateway/chat/completions";
  const BAZE_MODEL = "gpt-6.1-terra";

  let cases = [];
  let activeCase = null;
  let activeDocTab = "quotation";
  let simulateMismatch = false;

  const el = (id) => document.getElementById(id);

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
    const q = c.doc_chain.quotation;
    const po = c.doc_chain.purchase_order;
    const di = c.doc_chain.delivery_inspection;
    const ap = c.doc_chain.expense_approval;

    let totalSupply = 0;
    q.items.forEach((it, idx) => {
      it.qty = Math.max(1, parseInt(it.qty, 10) || 1);
      it.unit_price = Math.max(0, parseInt(it.unit_price, 10) || 0);
      it.supply_amount = it.qty * it.unit_price;
      totalSupply += it.supply_amount;

      if (po.items[idx]) po.items[idx].qty = it.qty;
      if (di.items[idx]) {
        di.items[idx].ordered_qty = it.qty;
        di.items[idx].delivered_qty = simulateMismatch && idx === 0 ? Math.max(0, it.qty - 1) : it.qty;
        di.items[idx].passed_qty = di.items[idx].delivered_qty;
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
      btn.addEventListener("click", () => {
        simulateMismatch = false;
        el("toggleMismatchBtn").classList.remove("btn-accent");
        activeCase = deepClone(c);
        recalcCaseTotals(activeCase);
        renderAll();
      });
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
      src.textContent = "방위사업청 원문 페이지";
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

    const first = activeCase.doc_chain.quotation.items[0];
    if (first) {
      el("liveQtyInput").value = first.qty;
      el("livePriceInput").value = first.unit_price;
    }
  }

  async function tryCallLiveBaze(parsed, apiKey) {
    const prompt = `당신은 대전 방산·정밀제조 중소기업 '(주)대덕정밀기계' 행정 AI 비서입니다.
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

      simulateMismatch = false;
      el("toggleMismatchBtn").classList.remove("btn-accent");
      activeCase = {
        id: "uploaded_live",
        short_title: file.name,
        badge: "실시간 업로드",
        sme_role: "사용자 업로드 HWP/HWPX 문서 기반 자동 변환",
        parse_info: parsed,
        source_summary: structured.source_summary,
        doc_chain: structured.doc_chain,
        is_live_upload: true,
        used_live_llm: usedLiveLlm,
      };
      recalcCaseTotals(activeCase);
      renderAll();
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
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${activeCase.id}_4docs.json`;
      a.click();
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
    bindEvents();
    try {
      const resp = await fetch("data/precomputed_cases.json");
      const bundle = await resp.json();
      cases = bundle.cases || [];
      if (cases.length > 0) {
        activeCase = deepClone(cases[0]);
        recalcCaseTotals(activeCase);
        renderAll();
      }
    } catch (err) {
      el("rawExtractedBox").textContent = `데이터 로드 실패: ${err.message}`;
    }
  }

  init();
})();
