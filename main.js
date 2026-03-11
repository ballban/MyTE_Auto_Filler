// ==UserScript==
// @name         myTE Smart Filler (Overtime Fixed v16)
// @namespace    http://tampermonkey.net/
// @version      16.0
// @description  Vibe coded shit to auto-fill myTE work time.
// @author       Jung Dabin
// @match        https://myte.accenture.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  function log(msg) {
    console.log(`[myTE Helper] ${msg}`);
    const logDisplay = document.getElementById("helper-status");
    if (logDisplay) logDisplay.innerText = msg;
  }

  function handleUI() {
    const infoPanel = document.querySelector(".myte-accordion-title");
    const existingPanel = document.getElementById("ballban-helper-v16");

    if (infoPanel && infoPanel.innerText.includes("Information") && !existingPanel) {
      const panel = document.createElement("div");
      panel.id = "ballban-helper-v16";
      panel.style =
        "position:fixed; top:80px; right:30px; z-index: 999999; background:white; border:3px solid #7500c0; padding:15px; border-radius:12px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); width:260px; font-family: sans-serif; font-size:13px;";
      panel.innerHTML = `
                <div style="font-weight:bold; color:#7500c0; margin-bottom:15px; font-size:15px; text-align:center; border-bottom:1px solid #eee; padding-bottom:8px;">myTE Auto-Filler v16</div>
                <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;"><span>Work:</span><span><input type="text" id="in-ws" value="9" style="width:35px; text-align:center;"> - <input type="text" id="in-we" value="12" style="width:35px; text-align:center;"></span></div>
                    <div style="display: flex; align-items: center; justify-content: space-between;"><span>Break:</span><span><input type="text" id="in-bs" value="12" style="width:35px; text-align:center;"> - <input type="text" id="in-be" value="13" style="width:35px; text-align:center;"></span></div>
                    <div style="display: flex; align-items: center; justify-content: space-between;"><span>Work:</span><span><input type="text" id="in-r2s" value="13" style="width:35px; text-align:center;"> - <input type="text" id="in-r2e" value="18" style="width:35px; text-align:center;"></span></div>
                </div>
                <div style="margin-bottom: 10px; padding: 8px; background: #f4f0ff; border-radius: 6px;">
                    <label style="cursor:pointer; display:flex; align-items:center; gap:8px;"><input type="checkbox" id="sync-ot" checked><span style="font-weight:bold; color:#7500c0;">Auto-sync Overtime</span></label>
                </div>
                <button id="btn-start-fill" style="width:100%; background:#7500c0; color:white; border:none; padding:12px; cursor:pointer; border-radius:6px; font-weight:bold;">START FILLING</button>
                <div id="helper-status" style="font-size:11px; color:blue; margin-top:10px; text-align:center;">Ready</div>
            `;
      document.body.appendChild(panel);
      document.getElementById("btn-start-fill").onclick = startProcess;
    } else if (!infoPanel && existingPanel) {
      existingPanel.remove();
    }
  }

  // 获取加班 Map，Key 统一为日期数字 (例如 "02")
  function getOvertimeMap() {
    const otMap = {};
    const rows = Array.from(document.querySelectorAll(".ag-row"));
    const otRow = rows.find((r) =>
      r.querySelector('[col-id="CategoryDescription"]')?.innerText.includes("Daily Overtime"),
    );

    if (!otRow) {
      console.error("Critical: Could not find Daily Overtime row in DOM");
      return otMap;
    }

    // 遍历 Date0 到 Date14
    for (let i = 0; i <= 14; i++) {
      const colId = `Date${i}`;
      const cell = otRow.querySelector(`[col-id="${colId}"]`);
      if (cell) {
        // 仅抓取 aria-hidden="true" 的 span 里的纯数字文本
        const valSpan = cell.querySelector('span[aria-hidden="true"]');
        const val = parseFloat(valSpan?.innerText || "0") || 0;

        // 找到对应的表头来确定这是哪一号 (例如从 "Mon 02" 提取 "02")
        const header = document.querySelector(`.ag-header-cell[col-id="${colId}"]`);
        const dateNumMatch = header?.innerText.match(/\d+/);
        if (dateNumMatch) {
          const dayKey = dateNumMatch[0].padStart(2, "0");
          otMap[dayKey] = val;
        }
      }
    }
    console.log("Parsed Overtime Map:", otMap);
    return otMap;
  }

  function smartSelect(el, targetVal) {
    if (!el) return;
    const valStr = parseInt(targetVal).toString();
    const valPad = valStr.padStart(2, "0");
    for (let opt of el.options) {
      if (opt.value === valStr || opt.value === valPad) {
        el.value = opt.value;
        break;
      }
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function fillCellPrecision(row, colId, hour, minute) {
    const cell = row.querySelector(`[col-id="${colId}"]`);
    if (!cell) return;
    const selects = cell.querySelectorAll("select");
    if (selects.length >= 2) {
      smartSelect(selects[0], hour);
      smartSelect(selects[1], minute);
    }
  }

  async function startProcess() {
    const syncOT = document.getElementById("sync-ot").checked;
    const otMap = syncOT ? getOvertimeMap() : {};

    const baseR2End = parseInt(document.getElementById("in-r2e").value);
    const vals = {
      ws: document.getElementById("in-ws").value,
      we: document.getElementById("in-we").value,
      bs: document.getElementById("in-bs").value,
      be: document.getElementById("in-be").value,
      r2s: document.getElementById("in-r2s").value,
    };

    const workdays = Array.from(
      document.querySelectorAll('#workingHoursPunchClockGrid [col-id="dateTime"]'),
    )
      .map((c) => c.innerText.trim())
      .filter((t) => t.length > 5 && !t.includes("Sat") && !t.includes("Sun"));

    for (const dateTxt of workdays) {
      // 从 "Mon, 03/02" 提取 "02"
      const dayMatch = dateTxt.match(/\d+$/); // 匹配末尾的数字
      const dayKey = dayMatch ? dayMatch[0].padStart(2, "0") : null;
      const overtime = otMap[dayKey] || 0;

      log(`Processing ${dateTxt} | OT: ${overtime}h`);

      let allRows = Array.from(document.querySelectorAll("#workingHoursPunchClockGrid .ag-row"));
      let r1 = allRows.find((r) =>
        r.querySelector('[col-id="dateTime"]')?.innerText.includes(dateTxt),
      );
      if (!r1) continue;

      // 1. 填 Row 1
      await fillCellPrecision(r1, "workStartTime", vals.ws, "0");
      await fillCellPrecision(r1, "workEndTime", vals.we, "0");
      await fillCellPrecision(r1, "mealStartTime", vals.bs, "0");
      await fillCellPrecision(r1, "mealEndTime", vals.be, "0");

      // 2. 检查并点加号
      let nextRow = r1.nextElementSibling;
      let hasR2 =
        nextRow &&
        (!nextRow.querySelector('[col-id="dateTime"]') ||
          nextRow.querySelector('[col-id="dateTime"]').innerText.trim() === "");
      if (!hasR2) {
        const addBtn = r1.querySelector("button.action-button.add");
        if (addBtn) {
          addBtn.click();
          await new Promise((r) => setTimeout(r, 400));
          allRows = Array.from(document.querySelectorAll("#workingHoursPunchClockGrid .ag-row"));
          r1 = allRows.find((r) =>
            r.querySelector('[col-id="dateTime"]')?.innerText.includes(dateTxt),
          );
        }
      }

      // 3. 填 Row 2
      const r2 = r1.nextElementSibling;
      if (r2) {
        const finalHour = baseR2End + Math.floor(overtime);
        const finalMin = Math.round((overtime % 1) * 60);
        await fillCellPrecision(r2, "workStartTime", vals.r2s, "0");
        await fillCellPrecision(r2, "workEndTime", finalHour.toString(), finalMin.toString());
      }
    }

    log("SUCCESS!");
    alert("Done!");
  }

  setInterval(handleUI, 1000);
})();
