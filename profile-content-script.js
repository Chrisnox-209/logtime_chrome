// profile-content-script.js
// Injects monthly logtime totals & Flippable Friends card on https://profile.intra.42.fr/

(function () {
  "use strict";

  let outstandingProjectIds = [];

  // ─── Utility ───────────────────────────────────────────────────────────────
  function minutesToHM(mins) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return `${h}h${m.toString().padStart(2, "0")}`;
  }

  /** Parse an "Xh Ym" or HH:MM:SS logtime string into total minutes. */
  function parseLogTime(str) {
    if (!str) return 0;
    const parts = str.split(":");
    if (parts.length === 3) {
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + parseInt(parts[2], 10) / 60;
    }
    return 0;
  }

  const MONTH_MAP = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };

  // ─── 1. Monthly Logtime Totals ───────────────────────────────────────────
  function getProfileUserName() {
    const path = window.location.pathname;
    if (path.startsWith("/users/")) {
      return path.split("/")[2];
    }
    const loginSpan = document.querySelector("span[data-login]");
    if (loginSpan) return loginSpan.getAttribute("data-login");
    return null;
  }

  function injectHeaderStats() {
    chrome.storage.local.get(["monthlyLogtime", "cachedLocations", "activeSession", "username"], function (data) {
      const ownLogin = data.username;
      const currentProfileLogin = getProfileUserName();
      if (!ownLogin || !currentProfileLogin || ownLogin !== currentProfileLogin) return;

      const monthlyLogtime = data.monthlyLogtime || {};
      const locations = data.cachedLocations || [];
      const activeSession = data.activeSession;

      const now = new Date();
      const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const currentMonthLabel = MONTH_NAMES[now.getMonth()];
      const monthMins = monthlyLogtime[currentMonthLabel] || 0;

      // Today's logtime calculation
      const todayStr = now.toDateString();
      let todayMins = 0;
      locations.forEach(loc => {
          if (new Date(loc.begin_at).toDateString() === todayStr) {
              const start = new Date(loc.begin_at);
              const end = loc.end_at ? new Date(loc.end_at) : new Date();
              todayMins += (end - start) / 60000;
          }
      });
      // Add active session if started today
      if (activeSession && new Date(activeSession.begin_at).toDateString() === todayStr) {
          todayMins += (now - new Date(activeSession.begin_at)) / 60000;
      }

      // Find the status pill using its characteristic classes and position
      const statusPill = document.querySelector(".absolute.px-2.py-1.rounded-full.top-2.right-4");
      if (!statusPill || document.getElementById("lt42-header-stats")) return;

      const container = document.createElement("div");
      container.id = "lt42-header-stats";
      // Lower z-index and adjust positioning to inherit stacking context safely
      container.style.cssText = "position:absolute; right:1rem; top:55px; display:flex; flex-direction:column; align-items:flex-end; gap:6px; pointer-events:none; z-index:5;";

      const createPill = (label, value) => {
          const pill = document.createElement("div");
          pill.className = "px-2 py-1 border rounded-full border-neutral-600 bg-ft-gray shadow-sm flex items-center gap-2";
          pill.style.minWidth = "90px";
          pill.style.justifyContent = "space-between";
          pill.innerHTML = `
            <span style="font-size: 8px; font-weight: 800; color: #888; text-transform: uppercase;">${label}</span>
            <span style="font-size: 11px; font-weight: 900; color: #ccc;">${value}</span>
          `;
          return pill;
      };

      container.appendChild(createPill("Today", minutesToHM(todayMins)));
      container.appendChild(createPill("Month", minutesToHM(monthMins)));
      
      statusPill.parentElement.appendChild(container);
    });
  }

  function injectMonthlyTotals() {
    chrome.storage.local.get(["monthlyLogtime", "username"], function (data) {
      const sumsPerMonth = data.monthlyLogtime || {};
      const ownLogin = data.username;
      const currentProfileLogin = getProfileUserName();

      if (!ownLogin || !currentProfileLogin || ownLogin !== currentProfileLogin) {
        return;
      }
      
      const titleDivs = document.querySelectorAll(".font-bold.text-black.uppercase.text-sm");
      let logtimeCard = null;
      titleDivs.forEach(function (el) {
        if (el.textContent.trim().toLowerCase() === "logtime") {
          logtimeCard = el.closest(".bg-white") || el.closest("[class*='bg-white']");
        }
      });
      if (!logtimeCard) return;

      const monthHeaders = logtimeCard.querySelectorAll("th[colspan='7']");
      if (!monthHeaders.length) return;

      monthHeaders.forEach(function (th) {
        const originalText = th.getAttribute("data-original-month") || th.textContent.trim().split(" ")[0];
        if (!th.hasAttribute("data-original-month")) {
          th.setAttribute("data-original-month", originalText);
        }
        const totalMins = sumsPerMonth[originalText] || 0;
        th.innerHTML = `${originalText} <span style="font-weight: 400; font-size: 0.85em; margin-left: 5px; color: #00868a; opacity: 0.8;">(${minutesToHM(totalMins)})</span>`;
      });
    });
  }

  // ─── 2. Friends Card (Flippable) ──────────────────────────────────────────
  function injectFriendsCard() {
    chrome.storage.local.get(["cachedFriends", "friendsList", "monthlyLogtime", "username", "cachedStats", "userAvatar"], function (data) {
      const friendsList = data.friendsList || [];
      const friendsStats = data.cachedFriends || {};
      const ownLogin = data.username;
      const ownStats = data.cachedStats || {};
      const ownAvatar = data.userAvatar || "";
      
      const now = new Date();
      const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const currentMonthLabel = MONTH_NAMES[now.getMonth()];
      const ownLogtimeMins = (data.monthlyLogtime || {})[currentMonthLabel] || 0;
      const ownLogtimeMs = ownLogtimeMins * 60000;

      let ownLevel = 0;
      if (ownStats.cursus_users) {
        const cursus = ownStats.cursus_users.find(cu => cu.cursus.id === 21 || cu.cursus.name === "42cursus");
        if (cursus) ownLevel = cursus.level;
      }

      if (friendsList.length === 0 && Object.keys(friendsStats).length === 0) return;

      const titleDivs = document.querySelectorAll(".font-bold.text-black.uppercase.text-sm");
      let achievementsCard = null;
      titleDivs.forEach(function (el) {
        if (el.textContent.trim().toLowerCase() === "last achievements") {
          achievementsCard = el.closest(".bg-white") || el.closest("[class*='bg-white']");
        }
      });
      if (!achievementsCard) return;
      if (document.getElementById("logtime42-friends-card")) return;

      const card = document.createElement("div");
      card.id = "logtime42-friends-card";
      card.className = achievementsCard.className + " lt42-flip-card";
      card.style.overflow = "visible";
      card.style.padding = "0";

      const innerFlipper = document.createElement("div");
      innerFlipper.className = "lt42-flip-card-inner";
      card.appendChild(innerFlipper);

      // Click listener moved to specific buttons

      // ── FRONT SIDE ──
      const front = document.createElement("div");
      front.className = "lt42-flip-card-front p-6 flex flex-col w-full h-full bg-white md:drop-shadow-md md:rounded-lg";
      innerFlipper.appendChild(front);

      // ── BACK SIDE ──
      const back = document.createElement("div");
      back.className = "lt42-flip-card-back p-6 flex flex-col w-full h-full bg-white md:drop-shadow-md md:rounded-lg";
      innerFlipper.appendChild(back);

      const titleBar = document.createElement("div");
      titleBar.className = "flex flex-col gap-1 md:flex-row place-items-center justify-between mb-2";
      const title = document.createElement("div");
      title.className = "font-bold text-black uppercase text-sm";
      title.textContent = "Friends";
      titleBar.appendChild(title);

      const btnContainer = document.createElement("div");
      btnContainer.className = "flex flex-row gap-2";
      
      const createIntraBtn = (text, view) => {
        const btn = document.createElement("div");
        btn.className = "text-center text-legacy-main bg-transparent border border-legacy-main py-1 px-2 cursor-pointer text-[10px] uppercase hover:bg-legacy-main/5 transition-colors";
        btn.textContent = text;
        btn.onclick = (e) => {
          e.stopPropagation();
          showBackView(view);
        };
        return btn;
      };

      const btnLogtime = createIntraBtn("Top Logtime", "logtime");
      const btnLevel = createIntraBtn("Top Level", "level");
      const btnAdd = createIntraBtn("Add friend", "add");

      btnContainer.appendChild(btnLogtime);
      btnContainer.appendChild(btnLevel);
      btnContainer.appendChild(btnAdd);
      titleBar.appendChild(btnContainer);
      front.appendChild(titleBar);

      // Function to handle switching views on the back
      function showBackView(viewType) {
        // Clear back content
        back.innerHTML = "";
        
        // Header for back
        const backHeader = document.createElement("div");
        backHeader.className = "flex flex-col gap-1 md:flex-row place-items-center justify-between mb-4";
        const backTitle = document.createElement("div");
        backTitle.className = "font-bold text-black uppercase text-sm";
        backTitle.textContent = viewType === "add" ? "Add New Friend" : "Monthly Podium";
        backHeader.appendChild(backTitle);
        
        // Add back button to return to front
        const backBtn = document.createElement("div");
        backBtn.className = "text-center text-gray-400 bg-transparent border border-gray-300 py-1 px-2 cursor-pointer text-[10px] uppercase hover:bg-gray-50";
        backBtn.textContent = "Close";
        backBtn.onclick = (e) => {
          e.stopPropagation();
          card.classList.remove("is-flipped");
        };
        backHeader.appendChild(backBtn);
        back.appendChild(backHeader);

        if (viewType === "add") {
          renderAddFriendForm(back);
        } else {
          const content = document.createElement("div");
          content.className = "lt42-podium-container";
          back.appendChild(content);
          
          const allStats = [];
          if (ownLogin) {
            allStats.push({ login: ownLogin, totalMs: ownLogtimeMs, level: ownLevel, avatar: ownAvatar });
          }
          Object.keys(friendsStats).forEach(login => {
            const fs = friendsStats[login];
            allStats.push({ login: login, totalMs: fs.totalMs || 0, level: fs.level || 0, avatar: fs.avatar });
          });

          if (viewType === "logtime") {
            const logtimeTop = [...allStats].sort((a, b) => b.totalMs - a.totalMs).slice(0, 3);
            renderPodiumSection(content, "Top Logtime", logtimeTop, (val) => {
              const h = Math.floor(val / 3600000);
              const m = Math.floor((val % 3600000) / 60000);
              return h + "h" + m.toString().padStart(2, "0");
            }, "totalMs");
          } else {
            const levelTop = [...allStats].sort((a, b) => b.level - a.level).slice(0, 3);
            renderPodiumSection(content, "Top Level", levelTop, (val) => "Lvl " + val.toFixed(2), "level");
          }
        }

        if (!card.classList.contains("is-flipped")) {
          card.classList.add("is-flipped");
        }
      }

      function renderAddFriendForm(container) {
        const form = document.createElement("div");
        form.className = "flex flex-col gap-4 mt-8 items-center justify-center h-full pb-12";
        
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Enter Intra login...";
        input.className = "w-full max-w-[200px] border border-gray-300 p-2 rounded text-sm focus:outline-none focus:border-legacy-main";
        
        const addBtn = document.createElement("button");
        addBtn.className = "bg-legacy-main text-white px-6 py-2 rounded text-sm font-bold uppercase hover:bg-opacity-90 transition-all";
        addBtn.textContent = "Add Friend";
        
        const msg = document.createElement("div");
        msg.className = "text-xs mt-2";
        
        addBtn.onclick = async () => {
          const login = input.value.trim().toLowerCase();
          if (!login) return;
          
          addBtn.disabled = true;
          addBtn.textContent = "Processing...";
          
          chrome.storage.local.get({ friendsList: [] }, (data) => {
            let list = data.friendsList;
            if (list.includes(login)) {
              msg.textContent = "Friend already in list!";
              msg.style.color = "orange";
              addBtn.disabled = false;
              addBtn.textContent = "Add Friend";
              return;
            }
            list.push(login);
            
            // Clear cache to force a fresh fetch from Intra API for everyone
            const keysToClear = ['cachedFriends', 'monthlyLogtime', 'cachedStats', 'cachedLocations', 'friendAvatars'];
            chrome.storage.local.remove(keysToClear, () => {
              chrome.storage.local.set({ friendsList: list }, () => {
                msg.textContent = "Cache cleared! Fetching fresh data...";
                msg.style.color = "#00babc";
                chrome.runtime.sendMessage({ action: "refresh" });
                
                setTimeout(() => {
                  window.location.reload();
                }, 3000); // Increased to 3s to give background script more time
              });
            });
          });
        };
        
        form.appendChild(input);
        form.appendChild(addBtn);
        form.appendChild(msg);
        container.appendChild(form);
      }

      const listContainer = document.createElement("div");
      listContainer.className = "h-full";
      listContainer.style.overflowY = "auto";

      const friendKeys = Object.keys(friendsStats);
      if (friendKeys.length === 0 && friendsList.length > 0) {
        const emptyMsg = document.createElement("div");
        emptyMsg.style.cssText = "display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:13px;";
        emptyMsg.textContent = "Loading friends data…";
        listContainer.appendChild(emptyMsg);
      } else {
        friendKeys.sort(function (a, b) {
          const aOnline = friendsStats[a].active ? 1 : 0;
          const bOnline = friendsStats[b].active ? 1 : 0;
          if (aOnline !== bOnline) return bOnline - aOnline;
          return a.localeCompare(b);
        });

        friendKeys.forEach(function (login) {
          const f = friendsStats[login];
          const row = document.createElement("a");
          row.href = "https://profile.intra.42.fr/users/" + login;
          row.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px 10px;text-decoration:none;color:inherit;border-bottom:1px solid #f0f0f0;transition:background .15s;cursor:pointer;";
          
          const avatar = document.createElement("div");
          avatar.style.cssText = "width:34px;height:34px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#e0e0e0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#555;";
          if (f.avatar) {
            const img = document.createElement("img");
            img.src = f.avatar;
            img.style.cssText = "width:100%;height:100%;object-fit:cover;";
            avatar.appendChild(img);
          } else {
            avatar.textContent = login.substring(0, 2).toUpperCase();
          }
          row.appendChild(avatar);

          const info = document.createElement("div");
          info.style.cssText = "flex:1;min-width:0;";
          const nameRow = document.createElement("div");
          nameRow.style.cssText = "display:flex;align-items:center;gap:6px;";
          const nameSpan = document.createElement("span");
          nameSpan.style.cssText = "font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
          nameSpan.textContent = login;
          nameRow.appendChild(nameSpan);

          const statusDot = document.createElement("span");
          statusDot.style.cssText = "width:8px;height:8px;border-radius:50%;flex-shrink:0;" + (f.active ? "background:#22c55e;" : "background:#d1d5db;");
          nameRow.appendChild(statusDot);
          info.appendChild(nameRow);

          const detailRow = document.createElement("div");
          detailRow.style.cssText = "font-size:11px;color:#888;margin-top:1px;display:flex;gap:8px;";
          const lvlSpan = document.createElement("span");
          lvlSpan.style.cssText = "color:#00babc;font-weight:700;";
          lvlSpan.textContent = "Lvl " + (f.level || 0).toFixed(2);
          detailRow.appendChild(lvlSpan);

          let totalMs = f.totalMs || 0;
          const fh = Math.floor(totalMs / 3600000);
          const fm = Math.floor((totalMs % 3600000) / 60000);
          const ltSpan = document.createElement("span");
          ltSpan.textContent = "⏱ " + fh + "h" + fm.toString().padStart(2, "0");
          detailRow.appendChild(ltSpan);

          if (f.active) {
            const locSpan = document.createElement("span");
            locSpan.style.cssText = "color:#22c55e;";
            locSpan.textContent = "📍 " + f.active;
            detailRow.appendChild(locSpan);
          }
          info.appendChild(detailRow);
          row.appendChild(info);
          listContainer.appendChild(row);
        });
      }
      front.appendChild(listContainer);

      achievementsCard.parentElement.insertBefore(card, achievementsCard.nextSibling);
    });
  }

  function renderPodiumSection(container, titleText, top3, formatFn, valueKey) {
    const section = document.createElement("div");
    section.className = "lt42-podium-section";
    
    // We don't need the inline title anymore as it's in the header
    const row = document.createElement("div");
    row.className = "lt42-podium-row";
    
    const order = [1, 0, 2]; // 2nd, 1st, 3rd
    order.forEach((renderIdx) => {
      const data = top3[renderIdx];
      if (!data) {
          const empty = document.createElement("div");
          empty.className = "lt42-podium-step";
          empty.style.visibility = "hidden";
          row.appendChild(empty);
          return;
      }

      const step = document.createElement("div");
      step.className = `lt42-podium-step pos-${renderIdx + 1}`;
      
      const label = document.createElement("div");
      label.className = "lt42-podium-label";
      label.textContent = data.login;
      step.appendChild(label);

      const avatar = document.createElement("div");
      avatar.className = "lt42-podium-avatar";
      if (data.avatar) {
        const img = document.createElement("img");
        img.src = data.avatar;
        avatar.appendChild(img);
      } else {
        avatar.textContent = data.login.substring(0, 2).toUpperCase();
        avatar.style.display = "flex";
        avatar.style.alignItems = "center";
        avatar.style.justifyContent = "center";
        avatar.style.fontSize = "16px";
        avatar.style.fontWeight = "bold";
      }
      step.appendChild(avatar);

      const box = document.createElement("div");
      box.className = `lt42-podium-box podium-color-${renderIdx + 1}`;
      box.textContent = renderIdx + 1;
      
      const value = document.createElement("div");
      value.className = "lt42-podium-value";
      value.textContent = formatFn(data[valueKey]);
      step.appendChild(value); 
      step.appendChild(box); 

      row.appendChild(step);
    });

    section.appendChild(row);
    container.appendChild(section);
  }

  // ─── 3. Project Decorations (Bonus & Outstanding) ──────────────────────────
  function decorateOutstandingProjects() {
    const titleDivs = document.querySelectorAll(".font-bold.text-black.uppercase.text-sm");
    let marksCard = null;
    titleDivs.forEach(el => {
      if (el.textContent.trim().toLowerCase() === "marks") {
        marksCard = el.closest(".bg-white") || el.closest("[class*='bg-white']");
      }
    });

    if (!marksCard) return;

    // Find all rows in the Marks card
    const rows = marksCard.querySelectorAll(".flex.flex-row.justify-between.hover\\:bg-gray-300.p-2");
    rows.forEach(row => {
      // Try to extract projects_user_id from the link
      const link = row.querySelector("a[href*='/projects_users/']");
      let projectsUserId = null;
      if (link) {
        // More robust extraction: get the last numeric segment of the path
        const match = link.href.match(/\/projects_users\/(\d+)/);
        if (match) projectsUserId = match[1];
      }

      const scoreDiv = row.querySelector(".text-xs.flex.flex-row.items-center");
      if (!scoreDiv) return;

      const scoreText = scoreDiv.textContent.trim();
      const score = parseInt(scoreText, 10);

      const isVerifiedOutstanding = projectsUserId && outstandingProjectIds.includes(projectsUserId);
      const isBonus = score > 100 || row.textContent.toLowerCase().includes("outstanding");

      if (isVerifiedOutstanding && isBonus && score > 100) {
        // ULTRA THEME: Both Bonus > 100 and Outstanding (Red)
        if (row.classList.contains("lt42-ultra-project")) return;
        row.classList.remove("lt42-bonus-project", "lt42-outstanding-project");
        row.classList.add("lt42-ultra-project");

        const nameContainer = row.querySelector(".flex.flex-row.gap-1");
        if (nameContainer) {
          const oldBadge = nameContainer.querySelector(".lt42-bonus-badge, .lt42-outstanding-badge, .lt42-ultra-badge");
          if (oldBadge) oldBadge.remove();

          const badgeContainer = document.createElement("div");
          badgeContainer.className = "flex items-center gap-1 lt42-ultra-badge";
          
          badgeContainer.innerHTML = `
            <div class="lt42-outstanding-badge small">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              <span>Outstanding</span>
            </div>
            <div class="lt42-bonus-badge small">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
              <span>Bonus</span>
            </div>
          `;
          nameContainer.appendChild(badgeContainer);
        }
      } else if (isVerifiedOutstanding) {
        // GOLD THEME (Star)
        if (row.classList.contains("lt42-outstanding-project")) return;
        row.classList.remove("lt42-bonus-project", "lt42-ultra-project");
        row.classList.add("lt42-outstanding-project");

        const nameContainer = row.querySelector(".flex.flex-row.gap-1");
        if (nameContainer) {
          const oldBadge = nameContainer.querySelector(".lt42-bonus-badge, .lt42-outstanding-badge, .lt42-ultra-badge");
          if (oldBadge) oldBadge.remove();

          const badge = document.createElement("div");
          badge.className = "lt42-outstanding-badge small";
          badge.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            <span>Outstanding</span>
          `;
          nameContainer.appendChild(badge);
        }
      } else if (isBonus) {
        // BLUE THEME (Medal)
        if (row.classList.contains("lt42-bonus-project") || row.classList.contains("lt42-outstanding-project") || row.classList.contains("lt42-ultra-project")) return;
        
        row.classList.add("lt42-bonus-project");

        const nameContainer = row.querySelector(".flex.flex-row.gap-1");
        if (nameContainer) {
          const oldBadge = nameContainer.querySelector(".lt42-bonus-badge, .lt42-outstanding-badge, .lt42-ultra-badge");
          if (oldBadge) oldBadge.remove();

          const badge = document.createElement("div");
          badge.className = "lt42-bonus-badge small";
          badge.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
            <span>Bonus</span>
          `;
          nameContainer.appendChild(badge);
        }
      }
    });
  }

  // ─── 4. Inject Styles ──────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement("style");
    style.id = "logtime42-profile-styles";
    style.textContent = `
      #logtime42-friends-card a:hover {
        background: #f5f5f5 !important;
      }
      #logtime42-monthly-banner {
        animation: lt42fadeIn .4s ease;
      }
      @keyframes lt42fadeIn {
        from { opacity: 0; transform: translateY(-6px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* Flip Card Core */
      .lt42-flip-card {
        background-color: transparent;
        perspective: 1000px;
        cursor: pointer;
        min-height: 384px; /* matching md:h-96 */
      }
      .lt42-flip-card-inner {
        position: relative;
        width: 100%;
        height: 100%;
        text-align: center;
        transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        transform-style: preserve-3d;
      }
      .lt42-flip-card.is-flipped .lt42-flip-card-inner {
        transform: rotateY(180deg);
      }
      .lt42-flip-card-front, .lt42-flip-card-back {
        position: absolute;
        width: 100%;
        height: 100%;
        -webkit-backface-visibility: hidden;
        backface-visibility: hidden;
        border-radius: 0.5rem;
      }
      .lt42-flip-card-back {
        transform: rotateY(180deg);
        background: white;
        display: flex;
        flex-direction: column;
        z-index: 1;
      }
      .lt42-flip-card-front {
        z-index: 2;
      }

      /* Podiums */
      .lt42-podium-container {
        display: flex;
        flex-direction: column;
        justify-content: center;
        height: 100%;
        padding-bottom: 20px;
      }
      .lt42-podium-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        width: 100%;
      }
      .lt42-podium-row {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 25px;
        height: 180px; 
        width: 100%;
      }
      .lt42-podium-step {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 110px;
        position: relative;
      }
      .lt42-podium-avatar {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        overflow: hidden;
        background: #f0f0f0;
        margin-bottom: 8px;
        z-index: 2;
        position: relative;
      }
      .lt42-podium-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .lt42-podium-box {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 800;
        border-radius: 6px 6px 0 0;
        font-size: 18px;
        text-shadow: 0 2px 4px rgba(0,0,0,0.3);
      }
      .podium-color-1 { 
        height: 70px; 
        background: linear-gradient(135deg, #ffd700 0%, #ff8c00 100%);
        border: 1px solid #e5bl00;
        z-index: 1;
      }
      .podium-color-2 { 
        height: 50px; 
        background: linear-gradient(135deg, #c0c0c0 0%, #8e8e8e 100%);
        border: 1px solid #a0a0a0;
      }
      .podium-color-3 { 
        height: 35px; 
        background: linear-gradient(135deg, #cd7f32 0%, #8b4513 100%);
        border: 1px solid #b87333;
      }
      
      .lt42-podium-label {
        position: absolute;
        top: -45px;
        font-size: 12px;
        font-weight: 800;
        white-space: nowrap;
        color: #111;
        background: white;
        padding: 4px 12px;
        border-radius: 20px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        z-index: 5;
        border: 1px solid #eee;
      }
      .lt42-podium-value {
        font-size: 14px;
        font-weight: 900;
        color: #111;
        background: white;
        padding: 4px 14px;
        border-radius: 12px;
        margin-bottom: -10px;
        z-index: 3;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        border: 2px solid #fff;
        white-space: nowrap;
      }

      /* Bonus Projects */
      .lt42-bonus-project {
        position: relative;
        border-left: 4px solid #00babc !important;
        background: rgba(0, 186, 188, 0.03) !important;
        transition: all 0.3s ease;
        animation: lt42-blueGlowPulse 4s infinite ease-in-out;
      }
      .lt42-bonus-project:hover {
        background: rgba(0, 186, 188, 0.08) !important;
        transform: translateX(4px);
      }
      .lt42-bonus-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: #00babc;
        color: white;
        font-size: 9px;
        font-weight: 800;
        padding: 1px 6px;
        border-radius: 4px;
        text-transform: uppercase;
        margin-left: 6px;
        box-shadow: 0 2px 4px rgba(0, 186, 188, 0.2);
        vertical-align: middle;
      }
      .lt42-bonus-badge.small {
        font-size: 7px;
        padding: 1px 4px;
        gap: 2px;
      }
      .lt42-bonus-badge svg {
        stroke: white;
        flex-shrink: 0;
      }
      @keyframes lt42-blueGlowPulse {
        0% { box-shadow: inset 4px 0 0 rgba(0, 186, 188, 0.1); }
        50% { box-shadow: inset 20px 0 30px rgba(0, 186, 188, 0.08); }
        100% { box-shadow: inset 4px 0 0 rgba(0, 186, 188, 0.1); }
      }

      /* Outstanding Projects (Gold) */
      .lt42-outstanding-project {
        position: relative;
        border-left: 4px solid #ffd700 !important;
        background: rgba(255, 215, 0, 0.04) !important;
        transition: all 0.3s ease;
        animation: lt42-goldGlowPulse 4s infinite ease-in-out;
      }
      .lt42-outstanding-project:hover {
        background: rgba(255, 215, 0, 0.09) !important;
        transform: translateX(4px);
      }
      .lt42-outstanding-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: #ffd700;
        color: black;
        font-size: 9px;
        font-weight: 900;
        padding: 1px 6px;
        border-radius: 4px;
        text-transform: uppercase;
        margin-left: 6px;
        box-shadow: 0 0 10px rgba(255, 215, 0, 0.4);
        vertical-align: middle;
      }
      .lt42-outstanding-badge.small {
        font-size: 7px;
        padding: 1px 4px;
        gap: 2px;
      }
      .lt42-outstanding-badge svg {
        fill: black;
        stroke: black;
        flex-shrink: 0;
      }
      @keyframes lt42-goldGlowPulse {
        0% { box-shadow: inset 4px 0 0 rgba(255, 215, 0, 0.1); }
        50% { box-shadow: inset 20px 0 30px rgba(255, 215, 0, 0.12); }
        100% { box-shadow: inset 4px 0 0 rgba(255, 215, 0, 0.1); }
      }

      /* Ultra Projects (Red - Both) */
      .lt42-ultra-project {
        position: relative;
        border-left: 4px solid #ff4757 !important;
        background: rgba(255, 71, 87, 0.05) !important;
        transition: all 0.3s ease;
        animation: lt42-redGlowPulse 4s infinite ease-in-out;
      }
      .lt42-ultra-project:hover {
        background: rgba(255, 71, 87, 0.1) !important;
        transform: translateX(4px);
      }
      @keyframes lt42-redGlowPulse {
        0% { box-shadow: inset 4px 0 0 rgba(255, 71, 87, 0.1); }
        50% { box-shadow: inset 20px 0 30px rgba(255, 71, 87, 0.1); }
        100% { box-shadow: inset 4px 0 0 rgba(255, 71, 87, 0.1); }
      }
    `;
    document.head.appendChild(style);
  }

  // ─── 4. Boot ───────────────────────────────────────────────────────────────
  function boot() {
    const path = window.location.pathname;
    if (path !== "/" && !path.startsWith("/users/")) return;

    injectStyles();

    // Fetch Outstanding data for current profile
    const currentProfileLogin = getProfileUserName();
    console.log("[LT42] Current Profile Login:", currentProfileLogin);
    if (currentProfileLogin) {
      chrome.runtime.sendMessage({ action: "getOutstandingData", login: currentProfileLogin }, (response) => {
        console.log("[LT42] Received Outstanding IDs:", response ? response.outstandingIds : "null");
        if (response && response.outstandingIds) {
          outstandingProjectIds = response.outstandingIds;
          // Re-run decoration if cards already exist
          decorateOutstandingProjects();
        }
      });
    }

    function tryInject(attempt) {
      const cards = document.querySelectorAll(".font-bold.text-black.uppercase.text-sm");
      if (cards.length >= 3 || attempt > 20) {
        injectHeaderStats();
        injectMonthlyTotals();
        injectFriendsCard();
        decorateOutstandingProjects();
      } else {
        setTimeout(function () { tryInject(attempt + 1); }, 500);
      }
    }
    tryInject(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 1500); });
  } else {
    setTimeout(boot, 1500);
  }

  console.log("%c✅ Logtime42 Profile Enhancer loaded!", "color: #00babc; font-size: 14px;");
})();
