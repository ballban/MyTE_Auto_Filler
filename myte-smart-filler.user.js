// ==UserScript==
// @name         myTE Smart Filler
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Vibe coded shit to auto-fill myTE work time with optional overtime synchronization.
// @author       Jung Dabin
// @match        https://myte.accenture.com/*
// @homepageURL  https://github.com/ballban/MyTE_Auto_Filler
// @supportURL   https://github.com/ballban/MyTE_Auto_Filler/issues
// @downloadURL  https://raw.githubusercontent.com/ballban/MyTE_Auto_Filler/main/myte-smart-filler.user.js
// @updateURL    https://raw.githubusercontent.com/ballban/MyTE_Auto_Filler/main/myte-smart-filler.user.js
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  let panelDismissed = false;

  function log(msg) {
    console.log(`[myTE Helper] ${msg}`);
    const logDisplay = document.getElementById("helper-status");
    if (logDisplay) logDisplay.innerText = msg;
  }

  function setRunningNotice(message, variant = "running", autoHideMs = 0) {
    let notice = document.getElementById("helper-running-notice");

    if (!message) {
      if (notice) notice.remove();
      return;
    }

    if (!notice) {
      notice = document.createElement("div");
      notice.id = "helper-running-notice";
      document.body.appendChild(notice);
    }

    const palette = {
      running: { bg: "#1f1f1f", fg: "#ffffff" },
      success: { bg: "#1f7a3d", fg: "#ffffff" },
      error: { bg: "#9b1c1c", fg: "#ffffff" },
    };
    const colors = palette[variant] || palette.running;

    notice.style = `position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:1000000; background:${colors.bg}; color:${colors.fg}; padding:14px 18px; border-radius:10px; font-family:sans-serif; font-size:14px; font-weight:bold; box-shadow:0 12px 28px rgba(0,0,0,0.35); min-width:220px; text-align:center;`;
    notice.innerHTML = `<div id="helper-status">${message}</div>`;

    if (notice._hideTimer) {
      clearTimeout(notice._hideTimer);
      notice._hideTimer = null;
    }
    if (autoHideMs > 0) {
      notice._hideTimer = setTimeout(() => notice.remove(), autoHideMs);
    }
  }

  function handleUI() {
    const infoPanel = document.querySelector(".myte-accordion-title");
    const existingPanel = document.getElementById("ballban-helper");

    if (!infoPanel) {
      if (existingPanel) existingPanel.remove();
      panelDismissed = false;
      return;
    }

    if (infoPanel.innerText.includes("Information") && !existingPanel && !panelDismissed) {
      const panel = document.createElement("div");
      panel.id = "ballban-helper";
      panel.style =
        "position:fixed; top:100px; right:30px; z-index: 999999; background:white; border:3px solid #7500c0; padding:15px; border-radius:12px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); width:200px; font-family: sans-serif; font-size:13px;";
      panel.innerHTML = `
                <button id="btn-close-helper" style="position:absolute; top:8px; right:8px; width:24px; height:24px; border:none; background:transparent; color:#7500c0; font-size:18px; cursor:pointer; line-height:1;" title="Close">&times;</button>
                <div style="font-weight:bold; color:#7500c0; margin-bottom:15px; font-size:15px; text-align:center; border-bottom:1px solid #eee; padding-bottom:8px;">myTE Auto-Filler</div>
                <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;"><span>Work:</span><span><input type="text" id="in-ws" value="9" style="width:35px; text-align:center;"> - <input type="text" id="in-we" value="12" style="width:35px; text-align:center;"></span></div>
                    <div style="display: flex; align-items: center; justify-content: space-between;"><span>Break:</span><span><input type="text" id="in-bs" value="12" style="width:35px; text-align:center;"> - <input type="text" id="in-be" value="13" style="width:35px; text-align:center;"></span></div>
                    <div style="display: flex; align-items: center; justify-content: space-between;"><span>Work:</span><span><input type="text" id="in-r2s" value="13" style="width:35px; text-align:center;"> - <input type="text" id="in-r2e" value="18" style="width:35px; text-align:center;"></span></div>
                </div>
                <div style="margin-bottom: 10px; padding: 8px; background: #f4f0ff; border-radius: 6px;">
                    <label style="cursor:pointer; display:flex; align-items:center; gap:8px;"><input type="checkbox" id="sync-ot" checked><span style="font-weight:bold; color:#7500c0;">Auto-sync Overtime</span></label>
                </div>
                <button id="btn-start-fill" style="width:100%; background:#7500c0; color:white; border:none; padding:12px; cursor:pointer; border-radius:6px; font-weight:bold;">START FILLING</button>
            `;
      document.body.appendChild(panel);
      document.getElementById("btn-start-fill").onclick = startProcess;
      document.getElementById("btn-close-helper").onclick = () => {
        panelDismissed = true;
        panel.remove();
      };
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
    setRunningNotice("myTE Auto-Filler is running...", "running");
    log("Starting auto fill...");

    try {
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

      const workdays = Array.from(document.querySelectorAll("#workingHoursPunchClockGrid .ag-row"))
        .map((row) => {
          const dateCell = row.querySelector('[col-id="dateTime"]');
          if (!dateCell) return null;

          const dateTxt = dateCell.innerText.trim();
          const isSpecialDay =
            dateCell.querySelector(".special-cell") !== null ||
            dateCell.classList.contains("special-cell");

          if (dateTxt.length <= 5 || isSpecialDay) return null;
          return dateTxt;
        })
        .filter(Boolean);

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
      setRunningNotice("Done!", "success", 1800);
    } catch (err) {
      console.error("[myTE Helper] Auto fill failed:", err);
      log("Failed. Check console.");
      setRunningNotice("Failed. Check console.", "error", 2500);
    } finally {
      // Notice is managed by success/error auto-hide.
    }
  }

  setInterval(handleUI, 1000);
})();
