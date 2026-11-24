/**
 * Client-side Korean HWP 5.0 (OLE2/CFB + zlib + HWPTAG_PARA_TEXT) & HWPX (OWPML ZIP+XML) parser.
 * Relies on global JSZip, CFB, and pako loaded via CDN in index.html.
 */
(function (global) {
  const HWP_16BYTE_CTRLS = new Set([
    1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
  ]);
  const HWPTAG_PARA_TEXT = 67;
  const HWPTAG_TABLE = 77;

  function toHex(bytes, len = 8) {
    return Array.from(bytes.slice(0, len))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function decodeUtf16Le(bytes) {
    try {
      return new TextDecoder("utf-16le").decode(bytes);
    } catch {
      let out = "";
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
      }
      return out;
    }
  }

  function decodeHwpParaText(recBytes) {
    const view = new DataView(recBytes.buffer, recBytes.byteOffset, recBytes.byteLength);
    let idx = 0;
    let out = "";
    while (idx + 2 <= recBytes.byteLength) {
      const code = view.getUint16(idx, true);
      if (HWP_16BYTE_CTRLS.has(code)) {
        idx += 16;
      } else if (code === 10 || code === 13) {
        out += "\n";
        idx += 2;
      } else if (code === 9) {
        out += "\t";
        idx += 2;
      } else if (code === 24 || code === 30 || code === 31) {
        out += " ";
        idx += 2;
      } else if (code < 32) {
        idx += 2;
      } else {
        out += String.fromCharCode(code);
        idx += 2;
      }
    }
    return out;
  }

  function parseHwpOle2Browser(uint8, filename) {
    if (!global.CFB || !global.pako) {
      throw new Error("CFB or pako library is not loaded.");
    }
    const cfb = global.CFB.read(uint8, { type: "array" });
    const paths = (cfb.FullPaths || []).slice();
    const fhEntry = global.CFB.find(cfb, "/FileHeader") || global.CFB.find(cfb, "FileHeader");
    if (!fhEntry || !fhEntry.content) {
      throw new Error("FileHeader stream not found in HWP file.");
    }
    const fhBytes = new Uint8Array(fhEntry.content);
    const fhView = new DataView(fhBytes.buffer, fhBytes.byteOffset, fhBytes.byteLength);
    const verRaw = fhView.getUint32(32, true);
    const hwpVersion = `${(verRaw >>> 24) & 0xff}.${(verRaw >>> 16) & 0xff}.${(verRaw >>> 8) & 0xff}.${verRaw & 0xff}`;
    const flags = fhView.getUint32(36, true);
    const compressed = Boolean(flags & 0x01);
    const encrypted = Boolean(flags & 0x02);
    if (encrypted) {
      throw new Error("암호화(DRM)가 걸린 HWP 문서는 브라우저에서 열람할 수 없습니다.");
    }

    const sectionEntries = [];
    for (let i = 0; i < (cfb.FileIndex || []).length; i++) {
      const entry = cfb.FileIndex[i];
      if (!entry || !entry.name) continue;
      if (/^Section\d+$/i.test(entry.name) && entry.content) {
        const idx = parseInt(entry.name.replace(/\D+/g, ""), 10);
        sectionEntries.push({ idx, entry });
      }
    }
    sectionEntries.sort((a, b) => a.idx - b.idx);

    const paragraphs = [];
    let tableCount = 0;

    for (const { entry } of sectionEntries) {
      const rawSec = new Uint8Array(entry.content);
      let secBytes = rawSec;
      if (compressed) {
        try {
          secBytes = global.pako.inflateRaw(rawSec);
        } catch {
          secBytes = global.pako.inflate(rawSec);
        }
      }
      const view = new DataView(secBytes.buffer, secBytes.byteOffset, secBytes.byteLength);
      let pos = 0;
      while (pos + 4 <= secBytes.byteLength) {
        const hdr = view.getUint32(pos, true);
        pos += 4;
        const tagId = hdr & 0x3ff;
        let recSize = (hdr >>> 20) & 0xfff;
        if (recSize === 0xfff) {
          if (pos + 4 > secBytes.byteLength) break;
          recSize = view.getUint32(pos, true);
          pos += 4;
        }
        if (pos + recSize > secBytes.byteLength) break;
        const rec = secBytes.subarray(pos, pos + recSize);
        pos += recSize;

        if (tagId === HWPTAG_TABLE) {
          tableCount += 1;
        } else if (tagId === HWPTAG_PARA_TEXT) {
          const decoded = decodeHwpParaText(rec);
          for (const line of decoded.split(/\r?\n/)) {
            const cleaned = line.replace(/[ \t]+/g, " ").trim();
            if (cleaned) paragraphs.push(cleaned);
          }
        }
      }
    }

    const prvEntry = global.CFB.find(cfb, "/PrvText") || global.CFB.find(cfb, "PrvText");
    const previewText =
      prvEntry && prvEntry.content ? decodeUtf16Le(new Uint8Array(prvEntry.content)).trim() : "";

    const extractedText = paragraphs.join("\n") || previewText;
    return {
      filename,
      file_size: uint8.byteLength,
      format_type: "HWP 5.0 Binary (OLE2/CFB)",
      magic_hex: toHex(uint8),
      hwp_version: hwpVersion,
      section_count: sectionEntries.length,
      table_count: tableCount,
      paragraph_count: paragraphs.length,
      char_count: extractedText.length,
      streams_preview: paths.filter(Boolean).slice(0, 12),
      extracted_text: extractedText,
      tables: [],
    };
  }

  function localName(node) {
    return node.localName || (node.nodeName ? node.nodeName.split(":").pop() : "");
  }

  function tElementText(tEl) {
    let out = "";
    for (const child of tEl.childNodes) {
      if (child.nodeType === 3) {
        out += child.nodeValue || "";
      } else if (child.nodeType === 1) {
        const ln = localName(child);
        if (ln === "fwSpace" || ln === "nbSpace" || ln === "tab") out += " ";
        else if (ln === "lineBreak") out += "\n";
        else if (ln === "hyphen") out += "-";
        else out += child.textContent || "";
      }
    }
    return out;
  }

  function extractHwpxTable(tblEl) {
    const rows = [];
    for (const child of tblEl.children) {
      if (localName(child) === "tr") {
        const row = [];
        for (const tc of child.children) {
          if (localName(tc) === "tc") {
            const parts = [];
            const tNodes = tc.getElementsByTagName("*");
            for (const el of tNodes) {
              if (localName(el) === "t") {
                const txt = tElementText(el).trim();
                if (txt) parts.push(txt);
              }
            }
            row.push(parts.join(" ").replace(/\s+/g, " ").trim());
          }
        }
        if (row.some((c) => c.length > 0)) rows.push(row);
      }
    }
    return rows;
  }

  function formatMdTable(rows) {
    if (!rows.length) return "";
    const maxCols = Math.max(...rows.map((r) => r.length));
    const norm = rows.map((r) => [...r, ...Array(maxCols - r.length).fill("")]);
    const head = "| " + norm[0].map((c) => c.replace(/\|/g, "/")).join(" | ") + " |";
    const sep = "| " + Array(maxCols).fill("---").join(" | ") + " |";
    const body = norm
      .slice(1)
      .map((r) => "| " + r.map((c) => c.replace(/\|/g, "/")).join(" | ") + " |");
    return [head, sep, ...body].join("\n");
  }

  async function parseHwpxZipBrowser(uint8, filename) {
    if (!global.JSZip) {
      throw new Error("JSZip library is not loaded.");
    }
    const zip = await global.JSZip.loadAsync(uint8);
    const allNames = Object.keys(zip.files);
    const sectionFiles = allNames
      .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)[0], 10);
        const nb = parseInt(b.match(/\d+/)[0], 10);
        return na - nb;
      });

    const blocks = [];
    const tables = [];
    const domParser = new DOMParser();

    for (const secFile of sectionFiles) {
      const xmlStr = await zip.files[secFile].async("string");
      const doc = domParser.parseFromString(xmlStr, "application/xml");
      const root = doc.documentElement;
      for (const pEl of root.children) {
        if (localName(pEl) !== "p") continue;
        let inlineParts = [];
        for (const run of pEl.children) {
          if (localName(run) !== "run") continue;
          for (const node of run.children) {
            const ln = localName(node);
            if (ln === "t") {
              const txt = tElementText(node);
              if (txt) inlineParts.push(txt);
            } else if (ln === "tbl") {
              if (inlineParts.length) {
                const t = inlineParts.join("").replace(/\s+/g, " ").trim();
                if (t) blocks.push(t);
                inlineParts = [];
              }
              const tbl = extractHwpxTable(node);
              if (tbl.length) {
                tables.push(tbl);
                blocks.push(formatMdTable(tbl));
              }
            } else {
              for (const sub of node.getElementsByTagName("*")) {
                if (localName(sub) === "t") {
                  const txt = tElementText(sub);
                  if (txt) inlineParts.push(txt);
                }
              }
            }
          }
        }
        if (inlineParts.length) {
          const t = inlineParts.join("").replace(/\s+/g, " ").trim();
          if (t) blocks.push(t);
        }
      }
    }

    const extractedText = blocks.join("\n");
    return {
      filename,
      file_size: uint8.byteLength,
      format_type: "HWPX (KS X 6101 OWPML ZIP+XML)",
      magic_hex: toHex(uint8),
      hwp_version: "OWPML",
      section_count: sectionFiles.length,
      table_count: tables.length,
      paragraph_count: blocks.length,
      char_count: extractedText.length,
      streams_preview: allNames.slice(0, 12),
      extracted_text: extractedText,
      tables: tables.slice(0, 4),
    };
  }

  async function parseHwpFile(file) {
    const buf = await file.arrayBuffer();
    const uint8 = new Uint8Array(buf);
    const magic = toHex(uint8, 8);
    if (magic === "d0cf11e0a1b11ae1") {
      return parseHwpOle2Browser(uint8, file.name);
    }
    if (magic.startsWith("504b0304")) {
      return await parseHwpxZipBrowser(uint8, file.name);
    }
    throw new Error(`지원하지 않는 파일 포맷입니다 (magic=${magic}). .hwp 또는 .hwpx 파일을 업로드하세요.`);
  }

  /**
   * Smart client-side fallback extractor when user uploads a custom HWP without a live LLM proxy/key.
   */
  function buildFallbackChainFromParsed(parsed) {
    const lines = (parsed.extracted_text || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("| ---"));
    const title = lines.find((l) => l.length > 4 && !l.startsWith("|")) || parsed.filename;
    const noticeMatch = parsed.extracted_text.match(/(?:공고번호|공고\s*제)[^\n|]{2,35}/);
    const noticeNo = noticeMatch ? noticeMatch[0].trim() : "DOC-2026-UPLOAD";
    const agencyMatch = parsed.extracted_text.match(/(방위사업청|충남대학교|대전광역시|중소벤처기업부|국방기술진흥연구소|한국[^\s,|]{2,12}연구원)/);
    const agency = agencyMatch ? agencyMatch[1] : "공공·방산 발주기관";
    const budgetMatch = parsed.extracted_text.match(/(?:사업예산|예산|금액)\s*[:：]?\s*([^\n|]{2,30})/);
    const budget = budgetMatch ? budgetMatch[1].trim() : "원문 기준 단가 산정";

    const items = [
      {
        name: `${title.slice(0, 28)} 대응 정밀가공 시제품`,
        spec: "원문 규격 준수 (KS/국방규격)",
        unit: "SET",
        qty: 2,
        unit_price: 8500000,
      },
      {
        name: "기술규격 검토 및 시험성적서 작성 패키지",
        spec: "품질보증·환경시험 리포트 포함",
        unit: "식",
        qty: 1,
        unit_price: 3500000,
      },
      {
        name: "납품 포장 및 현장 설치·시운전 지원",
        spec: "대전·충청권 방문 기술지원",
        unit: "식",
        qty: 1,
        unit_price: 1800000,
      },
    ];
    let totalSupply = 0;
    items.forEach((it) => {
      it.supply_amount = it.qty * it.unit_price;
      totalSupply += it.supply_amount;
    });
    const vat = Math.round(totalSupply * 0.1);
    const grandTotal = totalSupply + vat;

    const today = new Date().toISOString().slice(0, 10);
    return {
      source_summary: {
        document_title: title.slice(0, 90),
        issuing_agency: agency,
        notice_number: noticeNo,
        project_category: "업로드 문서 자동 분석",
        budget_or_scale: budget,
        key_schedules: lines.filter((l) => /202\d|\d+월|\d+일|기한|마감/.test(l)).slice(0, 3),
        eligibility_summary: "업로드된 HWP/HWPX 문서에서 핵심 과업, 일정, 요구서류 키워드를 자동 추출했습니다.",
        mandatory_attachments: ["사업자등록증 및 인감증명서", "표준 견적서 및 산출내역서", "원문 요구 서약서/확인서"],
        risk_alerts: [
          {
            level: "high",
            title: "원문 세부 규격·제출마감 재확인 필요",
            detail: `총 ${parsed.paragraph_count}개 문단(${parsed.table_count}개 표)이 브라우저에서 직접 파싱되었습니다. 기한 및 날인 요건을 확인하세요.`,
          },
          {
            level: "medium",
            title: "단가·수량 3-Way 정합성 자동 바인딩",
            detail: "아래 4종 문서의 품목·수량·부가세(10%)는 단일 JSON 원천에서 자동 연동되었습니다.",
          },
        ],
      },
      doc_chain: {
        quotation: {
          doc_no: "Q-2026-UPL1",
          quote_date: today,
          recipient: `${agency} 계약담당자 귀하`,
          supplier: "(주)대덕정밀기계 (대전 대덕구 문평동 / 대표 김대전)",
          project_name: title.slice(0, 70),
          valid_until: "견적일로부터 30일",
          items,
          total_supply: totalSupply,
          vat,
          grand_total: grandTotal,
          notes: "브라우저 HWP/HWPX 실시간 파싱 기반 자동 생성 견적서",
        },
        purchase_order: {
          doc_no: "PO-2026-UPL1",
          order_date: today,
          due_date: "2026-12-20",
          linked_notice_no: noticeNo,
          vendor_or_dept: "생산기술팀 / 정밀가공파트",
          items: items.map((it) => ({
            name: it.name,
            spec_material: it.spec,
            qty: it.qty,
            assignee: "생산1팀",
            qc_standard: "공차 ±0.02mm / 육안·치수 전수검사",
          })),
          instructions: "공고 원문 요구사항에 맞춰 원자재 수급 및 공정 착수 지시",
        },
        delivery_inspection: {
          doc_no: "DI-2026-UPL1",
          delivery_date: "2026-12-18",
          delivery_location: `${agency} 지정 납품장소`,
          inspector_org: `${agency} 검수담당관`,
          items: items.map((it) => ({
            name: it.name,
            spec: it.spec,
            ordered_qty: it.qty,
            delivered_qty: it.qty,
            passed_qty: it.qty,
            result: "적합",
          })),
          inspector_note: "발주 수량 대비 전량 납품 및 규격 적합 확인 완료",
        },
        expense_approval: {
          doc_no: "AP-2026-UPL1",
          draft_date: today,
          department: "기술영업·생산관리팀",
          drafter: "대리 이행정",
          approval_line: ["담당", "기술연구소장", "대표이사"],
          title: `[품의] ${title.slice(0, 50)} 대응 및 자재·가공 집행 건`,
          purpose_and_effect: `업로드된 공고(${noticeNo}) 대응을 위한 원가 산정 및 외주/생산 집행 품의로, 수작업 이기 오류를 제거하고 신속한 입찰 대응을 도모함.`,
          account_subject: "외주가공비 및 시제품 제작비",
          total_supply: totalSupply,
          vat,
          grand_total: grandTotal,
          attachments: ["표준 견적서(Q-2026-UPL1)", "발주·작업지시서(PO-2026-UPL1)", "원문 공고 첨부 서약서"],
        },
      },
    };
  }

  function xmlEscape(val) {
    return String(val ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function collectElementText(el) {
    const parts = [];
    for (const node of el.getElementsByTagName("*")) {
      if (localName(node) === "t") {
        parts.push(node.textContent || "");
      }
    }
    return parts.join("").replace(/\s+/g, " ").trim();
  }

  function setFirstCellText(tcEl, value) {
    for (const node of tcEl.getElementsByTagName("*")) {
      if (localName(node) === "t") {
        node.textContent = value;
        return true;
      }
    }
    for (const node of tcEl.getElementsByTagName("*")) {
      if (localName(node) === "run") {
        const ns = node.namespaceURI || "http://www.hancom.co.kr/hwpml/2011/paragraph";
        const tEl = tcEl.ownerDocument.createElementNS(ns, "hp:t");
        tEl.textContent = value;
        node.appendChild(tEl);
        return true;
      }
    }
    return false;
  }

  /**
   * Fills {{PLACEHOLDER}} tokens AND smartly populates blank adjacent table cells
   * in an HWPX (KS X 6101) archive without leaving the browser.
   */
  async function fillHwpxTemplate(arrayBuffer, placeholderMap, labelValueMap) {
    if (!global.JSZip) {
      throw new Error("JSZip 라이브러리가 로드되지 않았습니다.");
    }
    const uint8 = new Uint8Array(arrayBuffer);
    if (!toHex(uint8, 4).startsWith("504b0304")) {
      throw new Error("지정 양식 채우기는 .hwpx(OWPML XML) 포맷만 지원합니다.");
    }

    const inZip = await global.JSZip.loadAsync(uint8);
    const outZip = new global.JSZip();
    const filledFields = [];

    const rules = [
      [/^(상호|법인명|업체명|공급자|회사명)/, "COMPANY_NAME"],
      [/^(사업자등록번호|사업자번호)/, "BIZ_NO"],
      [/^(대표자|대표이사|성명)/, "CEO_NAME"],
      [/^(주소|소재지|본사주소|공장주소)/, "COMPANY_ADDR"],
      [/^(담당자)/, "CONTACT_NAME"],
      [/^(연락처|전화|휴대전화)/, "CONTACT_PHONE"],
      [/^(보유인증|인증)/, "CERTIFICATIONS"],
      [/^(계좌|입금계좌)/, "BANK_ACCOUNT"],
      [/^(발주기관|공고기관|수신처)/, "ISSUING_AGENCY"],
      [/^(공고번호|관리번호)/, "NOTICE_NO"],
      [/^(건명|사업명|품의제목|용역명)/, "PROJECT_NAME"],
      [/^(납기|납품기한|계약기한)/, "DUE_DATE"],
      [/^(합계금액|총합계금액|총액|견적금액|품의요청총액)/, "GRAND_TOTAL"],
      [/^(공급가액)/, "TOTAL_SUPPLY"],
      [/^(부가세|부가가치세|세액)/, "VAT_AMOUNT"],
    ];

    const names = Object.keys(inZip.files);
    const sortedNames = [
      ...names.filter((n) => n === "mimetype"),
      ...names.filter((n) => n !== "mimetype"),
    ];

    const domParser = new DOMParser();
    const serializer = new XMLSerializer();

    for (const entryName of sortedNames) {
      const zipEntry = inZip.files[entryName];
      if (zipEntry.dir) continue;

      if (/^Contents\/section\d+\.xml$/i.test(entryName)) {
        let xmlStr = await zipEntry.async("string");
        let placeholderHits = 0;

        for (const [k, v] of Object.entries(placeholderMap || {})) {
          const token = `{{${k}}}`;
          if (xmlStr.includes(token)) {
            xmlStr = xmlStr.split(token).join(xmlEscape(v));
            placeholderHits += 1;
            filledFields.push(k);
          }
        }

        // Fallback smart label -> blank adjacent cell fill for arbitrary external HWPX templates
        if (labelValueMap && Object.keys(labelValueMap).length > 0) {
          const doc = domParser.parseFromString(xmlStr, "application/xml");
          const hasParseErr = doc.getElementsByTagName("parsererror").length > 0;
          if (!hasParseErr) {
            let domChanged = false;
            const trEls = Array.from(doc.getElementsByTagName("*")).filter(
              (el) => localName(el) === "tr"
            );
            for (const tr of trEls) {
              const cells = Array.from(tr.children).filter((c) => localName(c) === "tc");
              for (let i = 0; i < cells.length - 1; i += 1) {
                const labelTxt = collectElementText(cells[i]).replace(/[\s:：()（）]/g, "");
                const nextTxt = collectElementText(cells[i + 1]);
                if (!labelTxt) continue;
                const isNextBlank =
                  nextTxt === "" || nextTxt === "-" || nextTxt === "()" || /^\(?\s*\)?$/.test(nextTxt);
                if (!isNextBlank) continue;
                for (const [rePattern, mapKey] of rules) {
                  if (rePattern.test(labelTxt) && labelValueMap[mapKey]) {
                    if (setFirstCellText(cells[i + 1], String(labelValueMap[mapKey]))) {
                      domChanged = true;
                      filledFields.push(`${labelTxt}->${mapKey}`);
                    }
                    break;
                  }
                }
              }
            }
            if (domChanged) {
              xmlStr = serializer.serializeToString(doc);
            }
          }
        }

        outZip.file(entryName, xmlStr, { compression: "DEFLATE" });
      } else if (entryName === "Preview/PrvText.txt") {
        let txt = await zipEntry.async("string");
        for (const [k, v] of Object.entries(placeholderMap || {})) {
          txt = txt.split(`{{${k}}}`).join(String(v ?? ""));
        }
        outZip.file(entryName, txt, { compression: "DEFLATE" });
      } else if (entryName === "mimetype") {
        const buf = await zipEntry.async("uint8array");
        outZip.file(entryName, buf, { compression: "STORE" });
      } else {
        const buf = await zipEntry.async("uint8array");
        outZip.file(entryName, buf, { compression: "DEFLATE" });
      }
    }

    const blob = await outZip.generateAsync({
      type: "blob",
      mimeType: "application/hwp+zip",
    });

    return {
      blob,
      filledCount: filledFields.length,
      filledFields: Array.from(new Set(filledFields)),
    };
  }

  global.HwpBrowserParser = {
    parseHwpFile,
    buildFallbackChainFromParsed,
    fillHwpxTemplate,
  };
})(window);
