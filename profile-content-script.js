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

  function getProfileUserName() {
    const path = window.location.pathname;
    if (path.startsWith("/users/")) {
      return path.split("/")[2];
    }
    const loginSpan = document.querySelector("span[data-login]");
    if (loginSpan) return loginSpan.getAttribute("data-login");
    // Backup for V3: look for the login in the top-right bubble shown in user snippet
    const loginBubble = document.querySelector(".drop-shadow-md.text-white");
    if (loginBubble) return loginBubble.textContent.trim();
    return null;
  }

  function scrapeProfileData() {
    try {
      const currentLogin = getProfileUserName();
      if (!currentLogin) return;

      // 1. Find the wallet balance in the footer of the profile card
      const bTags = document.querySelectorAll('b.pr-1');
      let walletAmount = null;
      bTags.forEach(b => {
        if (b.textContent.trim() === '₳') {
          const span = b.nextElementSibling;
          if (span && !isNaN(parseInt(span.textContent.trim()))) {
            walletAmount = parseInt(span.textContent.trim());
          }
        }
      });

      // 2. Find badges (titles) in the header - targeting the specific 'shadow-base' pills and filtering out vanity names
      const badgeElements = document.querySelectorAll('.inline-flex.items-center.text-xs.font-semibold.shadow-base');
      const titles = Array.from(badgeElements)
        .map(el => el.textContent.trim())
        .filter(t => t.length > 0 && !t.toLowerCase().includes(currentLogin.toLowerCase()));

      // 3. Find coalition color and logo
      const coalLink = document.querySelector('a[href*="/coalitions/"]');
      let coalitionColor = null;
      if (coalLink) {
        const svg = coalLink.querySelector('svg');
        if (svg && svg.getAttribute('fill')) {
          coalitionColor = svg.getAttribute('fill');
        }
      }

      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
        console.warn("[LT42] Extension disconnected. Please refresh the page.");
        return;
      }

      chrome.storage.local.get(["username", "friendsList", "cachedFriends"], (data) => {
        try {
          const username = data.username;
          const friendsList = data.friendsList || [];
          const cachedFriends = data.cachedFriends || {};

          const updates = {};
          let hasUpdates = false;

          // 1. Own user?
          if (username === currentLogin) {
            if (walletAmount !== null) updates.userWallet = walletAmount;
            if (titles.length > 0) updates.userTitles = titles;
            if (coalitionColor) updates.userCoalitionColor = coalitionColor;
            hasUpdates = true;
          }
          
          // 2. Friend?
          if (friendsList.includes(currentLogin)) {
            if (!cachedFriends[currentLogin]) cachedFriends[currentLogin] = {};
            
            let friendChanged = false;
            if (walletAmount !== null && cachedFriends[currentLogin].wallet !== walletAmount) {
              cachedFriends[currentLogin].wallet = walletAmount;
              friendChanged = true;
            }
            if (titles.length > 0 && JSON.stringify(cachedFriends[currentLogin].titles) !== JSON.stringify(titles)) {
              cachedFriends[currentLogin].titles = titles;
              friendChanged = true;
            }
            if (coalitionColor && cachedFriends[currentLogin].coalitionColor !== coalitionColor) {
              cachedFriends[currentLogin].coalitionColor = coalitionColor;
              friendChanged = true;
            }
            if (friendChanged) {
              updates.cachedFriends = cachedFriends;
              hasUpdates = true;
            }
          }

          if (hasUpdates) {
            chrome.storage.local.set(updates);
          }
        } catch (stErr) { console.error("[LT42] Storage update error:", stErr); }
      });
    } catch (scrErr) {
      console.error("[LT42] Scrape error:", scrErr);
    }
  }

  // ─── 0. Helpers ────────────────────────────────────────────────────────────
  function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  function calculatePersonalRecords(locations) {
    const dayStats = {};
    const weekStats = {};
    const monthStats = {};

    const now = new Date();
    locations.forEach(loc => {
      const start = new Date(loc.begin_at).getTime();
      const end = (loc.end_at ? new Date(loc.end_at) : now).getTime();

      let current = new Date(start);
      current.setHours(0, 0, 0, 0);

      while (current.getTime() <= end) {
        const dStart = current.getTime();
        const dEnd = dStart + 86400000;

        const overlapStart = Math.max(start, dStart);
        const overlapEnd = Math.min(end, dEnd);

        if (overlapEnd > overlapStart) {
          const overlapMs = overlapEnd - overlapStart;
          const dObj = new Date(dStart);
          
          // Day
          const dayKey = dObj.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
          dayStats[dayKey] = (dayStats[dayKey] || 0) + overlapMs;

          // Week
          const weekNum = getWeekNumber(dObj);
          const weekKey = `Week ${weekNum}, ${dObj.getFullYear()}`;
          weekStats[weekKey] = (weekStats[weekKey] || 0) + overlapMs;

          // Month (short key for card matching)
          const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const monthLabel = MONTH_NAMES_SHORT[dObj.getMonth()];
          monthStats[monthLabel] = (monthStats[monthLabel] || 0) + overlapMs;
        }
        current.setTime(current.getTime() + 86400000);
      }
    });

    let bestDay = { key: "None", value: 0 };
    Object.keys(dayStats).forEach(k => {
      if (dayStats[k] > bestDay.value) bestDay = { key: k, value: dayStats[k] };
    });

    let bestWeek = { key: "None", value: 0 };
    Object.keys(weekStats).forEach(k => {
      if (weekStats[k] > bestWeek.value) bestWeek = { key: k, value: weekStats[k] };
    });

    let bestMonth = { key: "None", value: 0 };
    Object.keys(monthStats).forEach(k => {
      if (monthStats[k] > bestMonth.value) bestMonth = { key: k, value: monthStats[k] };
    });

    return { bestDay, bestWeek, bestMonth, dayStats, weekStats, monthStats };
  }

  // ─── 1. Header Stats & Coalition Star ───────────────────────────────────────
  function injectHeaderStats() {
    chrome.storage.local.get(["monthlyLogtime", "cachedLocations", "activeSession", "username"], function (data) {
      const ownLogin = data.username;
      const currentProfileLogin = getProfileUserName();
      if (!currentProfileLogin) return;

      // ─── 1.1 Coalition Lead Star (Works for ALL students) ───
      chrome.storage.local.get(['myWinningCoalitionColor'], (cache) => {
        const winningColor = cache.myWinningCoalitionColor;
        let pColor = null;
        const coalLink = document.querySelector('a[href*="/coalitions/"]');
        if (coalLink) {
          const svg = coalLink.querySelector('svg');
          if (svg && svg.getAttribute('fill')) pColor = svg.getAttribute('fill');
        }

        const isWinner = (pColor && winningColor && pColor.toLowerCase() === winningColor.toLowerCase());
        
        if (isWinner && !document.getElementById("lt42-coalition-star")) {
           // Target avatar using multiple selectors for robustness
           const injectStar = () => {
             if (document.getElementById("lt42-coalition-star")) return;
             
             // Enhanced targeting for V3 profile card (div with background-image)
             const v3Avatar = document.querySelector('div[style*="background-image"][class*="rounded-full"]');
             const v2Avatar = document.querySelector(".user-badge img, .user-image img, img[src*='/users/'], .rounded-full img, .img-circle.avatar");
             
             const avatarElement = v3Avatar || v2Avatar;
             let imgContainer = avatarElement ? avatarElement.parentElement : null;

             if (imgContainer) {
                // Ensure the star doesn't get clipped by overflow:hidden on the circle
                if (imgContainer.classList.contains('rounded-full') || getComputedStyle(imgContainer).borderRadius !== '0px') {
                  imgContainer = imgContainer.parentElement;
                }

                if (getComputedStyle(imgContainer).position === "static") {
                  imgContainer.style.position = "relative";
                }

                const star = document.createElement("div");
                star.id = "lt42-coalition-star";
                star.className = "lt42-star-bounce";
                star.style.position = "absolute";
                star.style.zIndex = "4"; 
                star.style.top = "-30px";
                star.style.left = "50%";
                star.style.transform = "translateX(-50%)";
                star.style.pointerEvents = "auto";
                star.style.cursor = "help";
                star.title = "Coalition Lead Leader (Rank #1)";
                
                star.innerHTML = `
                 <svg width="30" height="30" viewBox="0 0 24 24" fill="url(#starGradientGlobal)" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 0 8px rgba(255,215,0,0.8));">
                   <defs>
                     <linearGradient id="starGradientGlobal" x1="0%" y1="0%" x2="100%" y2="100%">
                       <stop offset="0%" style="stop-color:#fffce1;stop-opacity:1" />
                       <stop offset="50%" style="stop-color:#ffd700;stop-opacity:1" />
                       <stop offset="100%" style="stop-color:#ff8c00;stop-opacity:1" />
                     </linearGradient>
                   </defs>
                   <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="#fff" stroke-width="0.5" />
                 </svg>
                `;
                imgContainer.appendChild(star);
                console.log(`[LT42] Lead Star injected for ${currentProfileLogin}`);
             }
           };
           
           injectStar();
           // Retry for pages that load content late (Flash bngo)
           setTimeout(injectStar, 1000);
           setTimeout(injectStar, 3000);
        }
      });

      // ─── 1.2 Personal Header Pills (Owner Only) ───
      if (ownLogin && currentProfileLogin === ownLogin) {
        const monthlyLogtime = data.monthlyLogtime || {};
        const locations = data.cachedLocations || [];
        const activeSession = data.activeSession;

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        
        let todayMins = 0;
        let monthMinsTotal = 0;

        locations.forEach(loc => {
          const start = new Date(loc.begin_at).getTime();
          const end = (loc.end_at ? new Date(loc.end_at) : now).getTime();

          // Today overlap
          const tOverlap = Math.min(end, now.getTime()) - Math.max(start, todayStart);
          if (tOverlap > 0) todayMins += tOverlap / 60000;

          // Month overlap
          const mOverlap = Math.min(end, now.getTime()) - Math.max(start, monthStart);
          if (mOverlap > 0) monthMinsTotal += mOverlap / 60000;
        });

        // Use the calculated month total for the pill instead of background cache if it's more fresh
        const finalMonthMins = Math.max(monthMinsTotal, 0);

        const statusPill = document.querySelector(".absolute.px-2.py-1.rounded-full.top-2.right-4");
        if (!statusPill || document.getElementById("lt42-header-stats")) return;

        const container = document.createElement("div");
        container.id = "lt42-header-stats";
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
        container.appendChild(createPill("Month", minutesToHM(finalMonthMins)));
        statusPill.parentElement.appendChild(container);
      }
    });
  }

  // ─── 2. Logtime Card (Flippable Calendar/Records) ───────────────────────────
  function injectMonthlyTotals() {
    chrome.storage.local.get(["monthlyLogtime", "username", "cachedLocations", "cachedStats"], function (data) {
      const locations = data.cachedLocations || [];
      const records = calculatePersonalRecords(locations);
      const sumsPerMonth = records.monthStats;
      const ownLogin = data.username;
      const currentProfileLogin = getProfileUserName();
      const ownStats = data.cachedStats || {};

      if (!ownLogin || !currentProfileLogin || ownLogin !== currentProfileLogin) return;

      const titleDivs = document.querySelectorAll(".font-bold.text-black.uppercase.text-sm");
      let logtimeCard = null;
      titleDivs.forEach(el => {
        if (el.textContent.trim().toLowerCase() === "logtime") {
          logtimeCard = el.closest(".bg-white") || el.closest("[class*='bg-white']");
        }
      });
      if (!logtimeCard || document.getElementById("logtime42-flip-container")) return;

      let ownLevel = 0;
      if (ownStats.cursus_users) {
        const cursus = ownStats.cursus_users.find(cu => cu.cursus.id === 21 || cu.cursus.name === "42cursus");
        if (cursus) ownLevel = cursus.level;
      }

      // Move existing children into the front face to preserve event listeners (hover tooltips)
      const children = Array.from(logtimeCard.childNodes);
      logtimeCard.className += " lt42-flip-card";
      logtimeCard.id = "logtime42-flip-container";
      logtimeCard.style.overflow = "visible";
      logtimeCard.style.padding = "0";
      logtimeCard.style.minHeight = "400px";

      const innerFlipper = document.createElement("div");
      innerFlipper.className = "lt42-flip-card-inner";

      const front = document.createElement("div");
      front.className = "lt42-flip-card-front p-6 flex flex-col w-full h-full bg-white md:drop-shadow-md md:rounded-lg";
      
      const back = document.createElement("div");
      back.className = "lt42-flip-card-back p-6 flex flex-col w-full h-full bg-white md:drop-shadow-md md:rounded-lg";

      children.forEach(child => front.appendChild(child));
      
      innerFlipper.appendChild(front);
      innerFlipper.appendChild(back);
      logtimeCard.appendChild(innerFlipper);

      const btnContainer = document.createElement("div");
      btnContainer.className = "flex flex-row gap-2 mt-2 md:mt-0";
      
      const createFlipBtn = (text, view) => {
        const btn = document.createElement("div");
        btn.className = "text-center text-legacy-main bg-transparent border border-legacy-main py-1 px-2 cursor-pointer text-[10px] uppercase hover:bg-legacy-main/5 transition-colors";
        btn.textContent = text;
        btn.onclick = (e) => {
          e.stopPropagation();
          showLogtimeBackView(view);
        };
        return btn;
      };

      btnContainer.appendChild(createFlipBtn("Records", "records"));
      
      const headerTitle = front.querySelector(".font-bold.text-black.uppercase.text-sm");
      if (headerTitle && headerTitle.parentElement) {
        headerTitle.parentElement.style.display = "flex";
        headerTitle.parentElement.style.justifyContent = "space-between";
        headerTitle.parentElement.style.alignItems = "center";
        headerTitle.parentElement.appendChild(btnContainer);
      }

      function showLogtimeBackView(viewType) {
        back.innerHTML = "";
        const backHeader = document.createElement("div");
        backHeader.className = "flex flex-col gap-1 md:flex-row place-items-center justify-between mb-8";
        const backTitle = document.createElement("div");
        backTitle.className = "font-bold text-black uppercase text-sm";
        backTitle.textContent = "Personal Records";
        backHeader.appendChild(backTitle);
        
        const backBtn = document.createElement("div");
        backBtn.className = "text-center text-gray-400 bg-transparent border border-gray-300 py-1 px-2 cursor-pointer text-[10px] uppercase hover:bg-gray-50";
        backBtn.textContent = "Close";
        backBtn.onclick = (e) => {
          e.stopPropagation();
          logtimeCard.classList.remove("is-flipped");
        };
        backHeader.appendChild(backBtn);
        back.appendChild(backHeader);

        const content = document.createElement("div");
        content.className = "lt42-records-grid-container";
        back.appendChild(content);

        renderLogtimeRecords(content, records);
        logtimeCard.classList.add("is-flipped");
      }

      const monthHeaders = front.querySelectorAll("th[colspan='7']");
      monthHeaders.forEach(th => {
        const originalText = th.getAttribute("data-original-month") || th.textContent.trim().split(" ")[0];
        if (!th.hasAttribute("data-original-month")) th.setAttribute("data-original-month", originalText);
        const totalMins = (sumsPerMonth[originalText] || 0) / 60000;
        th.innerHTML = `${originalText} <span style="font-weight: 400; font-size: 0.85em; margin-left: 5px; color: #00868a; opacity: 0.8;">(${minutesToHM(totalMins)})</span>`;
      });
    });
  }

  // ─── 3. Friends Card (Flippable) ──────────────────────────────────────────
  function injectFriendsCard() {
    chrome.storage.local.get(["cachedFriends", "friendsList", "monthlyLogtime", "username", "cachedStats", "userAvatar", "clientId", "clientSecret", "myWinningCoalitionColor"], function (data) {
      const friendsList = data.friendsList || [];
      const friendsStats = data.cachedFriends || {};
      const ownLogin = data.username;
      const ownStats = data.cachedStats || {};
      const clientId = data.clientId;
      const clientSecret = data.clientSecret;
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
      titleDivs.forEach(el => {
        if (el.textContent.trim().toLowerCase() === "last achievements") {
          achievementsCard = el.closest(".bg-white") || el.closest("[class*='bg-white']");
        }
      });
      if (!achievementsCard || document.getElementById("logtime42-friends-card")) return;

      const card = document.createElement("div");
      card.id = "logtime42-friends-card";
      card.className = achievementsCard.className + " lt42-flip-card";
      card.style.overflow = "visible";
      card.style.padding = "0";

      const innerFlipper = document.createElement("div");
      innerFlipper.className = "lt42-flip-card-inner";
      card.appendChild(innerFlipper);

      const front = document.createElement("div");
      front.className = "lt42-flip-card-front p-6 flex flex-col w-full h-full bg-white md:drop-shadow-md md:rounded-lg";
      innerFlipper.appendChild(front);

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
      btnContainer.className = "flex flex-row gap-2 mt-2 self-end mr-4";
      
      const refreshBtn = document.createElement("button");
      refreshBtn.className = "lt42-action-btn lt42-refresh-btn";
      refreshBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 2v6h-6"></path>
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
          <path d="M3 22v-6h6"></path>
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
        </svg>
      `;
      refreshBtn.title = "Sync All Friends Data";
      refreshBtn.onclick = () => {
        refreshBtn.classList.add("lt42-spinning");
        chrome.runtime.sendMessage({ action: "refresh", force: true }, () => {
          window.location.reload();
        });
      };
      btnContainer.appendChild(refreshBtn);
      
      const createBtn = (text, view) => {
        const btn = document.createElement("div");
        btn.className = "text-center text-legacy-main bg-transparent border border-legacy-main py-1 px-2 cursor-pointer text-[10px] uppercase hover:bg-legacy-main/5 transition-colors";
        btn.textContent = text;
        btn.onclick = (e) => {
          e.stopPropagation();
          showFriendsBackView(view);
        };
        return btn;
      };

      btnContainer.appendChild(createBtn("Top Logtime", "logtime"));
      btnContainer.appendChild(createBtn("Top Level", "level"));
      btnContainer.appendChild(createBtn("Top ₳", "wallet"));
      
      if (clientId && clientSecret) {
        btnContainer.appendChild(createBtn("Add friend", "add"));
      } else {
        const warning = document.createElement("div");
        warning.className = "text-[10px] text-orange-500 uppercase font-bold";
        warning.textContent = "API unconfigured";
        btnContainer.appendChild(warning);
      }

      titleBar.appendChild(btnContainer);
      front.appendChild(titleBar);

      async function showFriendsBackView(viewType) {
        back.innerHTML = "";
        const backHeader = document.createElement("div");
        backHeader.className = "flex flex-col gap-1 md:flex-row place-items-center justify-between mb-4";
        const backTitle = document.createElement("div");
        backTitle.className = "font-bold text-black uppercase text-sm";
        backTitle.textContent = viewType === "add" ? "Add New Friend" : "Monthly Podium";
        backHeader.appendChild(backTitle);
        
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
          const storage = await new Promise(r => chrome.storage.local.get(["userWallet", "userCoalitionColor", "userCoalitionLogo", "myWinningCoalitionColor"], r));
          const ownWallet = storage.userWallet || 0;
          const ownCoalColor = storage.userCoalitionColor;
          const ownCoalLogo = storage.userCoalitionLogo;
          const globalWinnerColor = storage.myWinningCoalitionColor;

          if (ownLogin) {
            allStats.push({ 
              login: ownLogin, totalMs: ownLogtimeMs, level: ownLevel, avatar: ownAvatar, wallet: ownWallet,
              coalitionColor: ownCoalColor, coalitionLogo: ownCoalLogo 
            });
          }
          Object.keys(friendsStats).forEach(login => {
            const fs = friendsStats[login] || {};
            allStats.push({ 
              login: login, 
              totalMs: fs.totalMs || 0, 
              level: fs.level || 0, 
              avatar: fs.avatar, 
              wallet: (fs.wallet !== undefined && fs.wallet !== null) ? fs.wallet : 0,
              coalitionColor: fs.coalitionColor,
              coalitionLogo: fs.coalitionLogo
            });
          });

          if (viewType === "logtime") {
            const logtimeTop = [...allStats].sort((a, b) => b.totalMs - a.totalMs).slice(0, 3);
            renderPodiumSection(content, "Top Logtime", logtimeTop, (val) => {
              const h = Math.floor(val / 3600000);
              const m = Math.floor((val % 3600000) / 60000);
              return h + "h" + m.toString().padStart(2, "0");
            }, "totalMs", globalWinnerColor);
          } else if (viewType === "wallet") {
            const walletTop = [...allStats].sort((a, b) => (b.wallet || 0) - (a.wallet || 0)).slice(0, 3);
            renderPodiumSection(content, "Top ₳", walletTop, (val) => val + " ₳", "wallet", globalWinnerColor);
          } else {
            const levelTop = [...allStats].sort((a, b) => b.level - a.level).slice(0, 3);
            renderPodiumSection(content, "Top Level", levelTop, (val) => "Lvl " + val.toFixed(2), "level", globalWinnerColor);
          }
        }
        card.classList.add("is-flipped");
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
          chrome.storage.local.get({ friendsList: [] }, (storage) => {
            let list = storage.friendsList;
            if (list.includes(login)) {
              msg.textContent = "Friend already in list!";
              msg.style.color = "orange";
              addBtn.disabled = false;
              addBtn.textContent = "Add Friend";
              return;
            }
            list.push(login);
            chrome.storage.local.set({ friendsList: list }, () => {
              msg.textContent = "Friend added! Syncing profile data...";
              msg.style.color = "#00babc";
              chrome.runtime.sendMessage({ action: "autoScrapeProfile", login: login });
              chrome.runtime.sendMessage({ action: "refresh", force: true }, () => {
                window.location.reload();
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
      listContainer.className = "h-full overflow-y-auto";

      const friendKeys = Object.keys(friendsStats);
      if (friendKeys.length === 0 && friendsList.length > 0) {
        const emptyMsg = document.createElement("div");
        emptyMsg.style.cssText = "display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:13px;";
        emptyMsg.textContent = "Loading friends data…";
        listContainer.appendChild(emptyMsg);
      } else {
        friendKeys.sort((a, b) => {
          const aOnline = friendsStats[a].active ? 1 : 0;
          const bOnline = friendsStats[b].active ? 1 : 0;
          if (aOnline !== bOnline) return bOnline - aOnline;
          return a.localeCompare(b);
        });
        friendKeys.forEach(login => {
          const f = friendsStats[login];
          const row = document.createElement("a");
          row.href = "/users/" + login;
          row.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px 10px;text-decoration:none;color:inherit;border-bottom:1px solid #f0f0f0;transition:background .15s;cursor:pointer;";
          
          const avatarContainer = document.createElement("div");
          avatarContainer.style.cssText = "position:relative;width:34px;height:34px;flex-shrink:0;";
          
          const avatar = document.createElement("div");
          avatar.style.cssText = `width:34px;height:34px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#e0e0e0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#555;position:relative;box-sizing:border-box;`;

          if (f.coalitionColor) {
            row.style.borderLeft = `4px solid ${f.coalitionColor}`;
            row.style.paddingLeft = `6px`;
          }

          if (f.avatar) { avatar.innerHTML = `<img src="${f.avatar}" style="width:100%;height:100%;object-fit:cover;">`; }
          else { avatar.textContent = login.substring(0, 2).toUpperCase(); }
          
          avatarContainer.appendChild(avatar);

          if (f.coalitionLogo) {
            const miniLogo = document.createElement("div");
            miniLogo.style.cssText = `
              width: 14px;
              height: 14px;
              position: absolute;
              bottom: -2px;
              right: -4px;
              z-index: 10;
              background-image: url('${f.coalitionLogo}');
              background-size: 85%;
              background-repeat: no-repeat;
              background-position: center;
              background-color: white;
              border-radius: 50%;
              border: 1px solid #e0e0e0;
              box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            `;
            avatarContainer.appendChild(miniLogo);
          }

          row.appendChild(avatarContainer);

          // Add Star if friend's coalition is leading globally
          if (f.coalitionColor && data.myWinningCoalitionColor && f.coalitionColor === data.myWinningCoalitionColor) {
            const starContainer = document.createElement("div");
            starContainer.style.cssText = `
              position: absolute;
              bottom: -3px;
              left: -3px;
              z-index: 10;
            `;
            starContainer.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="url(#starMiniGradient)" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 0 3px rgba(255,215,0,0.8)); display: block;">
                <defs>
                  <linearGradient id="starMiniGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#fffce1;stop-opacity:1" />
                    <stop offset="50%" style="stop-color:#ffd700;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#ff8c00;stop-opacity:1" />
                  </linearGradient>
                </defs>
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="#fff" stroke-width="0.5" />
              </svg>
            `;
            avatarContainer.appendChild(starContainer);
          }

          const info = document.createElement("div");
          info.style.cssText = "flex:1;min-width:0;";
          const nameRow = document.createElement("div");
          nameRow.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;";
          const nameSpan = document.createElement("span");
          nameSpan.style.cssText = "font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
          nameSpan.textContent = login;
          nameRow.appendChild(nameSpan);
          const statusDot = document.createElement("span");
          statusDot.style.cssText = "width:8px;height:8px;border-radius:50%;flex-shrink:0;" + (f.active ? "background:#22c55e;" : "background:#d1d5db;");
          nameRow.appendChild(statusDot);

          // Student Badges (Titles) - Filter out any remaining vanity titles during rendering
          if (f.titles && Array.isArray(f.titles) && f.titles.length > 0) {
            f.titles
              .filter(title => !title.toLowerCase().includes(login.toLowerCase()))
              .forEach(title => {
                const badge = document.createElement("span");
                badge.className = "lt42-friend-badge";
                badge.textContent = title;
                nameRow.appendChild(badge);
              });
          }
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
          const wSpan = document.createElement("span");
          wSpan.textContent = "₳ " + (f.wallet || 0);
          detailRow.appendChild(wSpan);
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

  function renderLogtimeRecords(container, records) {
    const formatTime = (ms) => {
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      return `${h}h${m.toString().padStart(2, '0')}`;
    };

    const recs = [
      { label: "Best Month", value: formatTime(records.bestMonth.value), key: records.bestMonth.key, height: "100px", color: "linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)" },
      { label: "Best Week", value: formatTime(records.bestWeek.value), key: records.bestWeek.key, height: "70px", color: "linear-gradient(135deg, #c0c0c0 0%, #8e8e8e 100%)" },
      { label: "Best Day", value: formatTime(records.bestDay.value), key: records.bestDay.key, height: "45px", color: "linear-gradient(135deg, #cd7f32 0%, #8b4513 100%)" }
    ];

    const row = document.createElement("div");
    row.className = "flex flex-row items-end justify-center gap-6 mt-4 w-full h-[200px]";

    recs.forEach(rec => {
      const pillarGroup = document.createElement("div");
      pillarGroup.className = "flex flex-col items-center gap-1 w-24";
      
      const topLabel = document.createElement("div");
      topLabel.style.cssText = "font-size: 8px; font-weight: 800; color: #888; text-transform: uppercase;";
      topLabel.textContent = rec.label;
      
      const timeVal = document.createElement("div");
      timeVal.style.cssText = "font-size: 13px; font-weight: 900; color: #111; margin-bottom: 4px;";
      timeVal.textContent = rec.value;
      
      const pillar = document.createElement("div");
      pillar.style.cssText = `width: 100%; height: ${rec.height}; background: ${rec.color}; border-radius: 4px 4px 0 0; box-shadow: 0 4px 10px rgba(0,0,0,0.1);`;

      const bottomKey = document.createElement("div");
      bottomKey.style.cssText = "font-size: 9px; font-weight: 700; color: #aaa; text-align: center; margin-top: 4px; line-height: 1.1;";
      bottomKey.textContent = rec.key;

      pillarGroup.appendChild(topLabel);
      pillarGroup.appendChild(timeVal);
      pillarGroup.appendChild(pillar);
      pillarGroup.appendChild(bottomKey);
      row.appendChild(pillarGroup);
    });

    container.appendChild(row);
  }

  // ─── 4. Project Decorations ────────────────────────────────────────────────
  function decorateOutstandingProjects() {
    const titleDivs = document.querySelectorAll(".font-bold.text-black.uppercase.text-sm");
    let marksCard = null;
    titleDivs.forEach(el => {
      if (el.textContent.trim().toLowerCase() === "marks") {
        marksCard = el.closest(".bg-white") || el.closest("[class*='bg-white']");
      }
    });
    if (!marksCard) return;
    const rows = marksCard.querySelectorAll(".flex.flex-row.justify-between.hover\\:bg-gray-300.p-2");
    rows.forEach(row => {
      const link = row.querySelector("a[href*='/projects_users/']");
      let projectsUserId = null;
      if (link) {
        const match = link.href.match(/\/projects_users\/(\d+)/);
        if (match) projectsUserId = match[1];
      }
      const scoreDiv = row.querySelector(".text-xs.flex.flex-row.items-center");
      if (!scoreDiv) return;
      const score = parseInt(scoreDiv.textContent.trim(), 10);
      const isVerifiedOutstanding = projectsUserId && outstandingProjectIds.includes(projectsUserId);
      const isBonus = score > 100 || row.textContent.toLowerCase().includes("outstanding");

      if (isVerifiedOutstanding && isBonus && score > 100) {
        if (row.classList.contains("lt42-ultra-project")) return;
        row.className = "flex flex-row justify-between hover:bg-gray-300 p-2 lt42-ultra-project";
        const nameContainer = row.querySelector(".flex.flex-row.gap-1");
        if (nameContainer) {
          nameContainer.querySelectorAll(".lt42-bonus-badge, .lt42-outstanding-badge, .lt42-ultra-badge").forEach(b => b.remove());
          const badgeContainer = document.createElement("div");
          badgeContainer.className = "flex items-center gap-1 lt42-ultra-badge";
          badgeContainer.innerHTML = `<div class="lt42-outstanding-badge small"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg><span>Outstanding</span></div><div class="lt42-bonus-badge small"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg><span>Bonus</span></div>`;
          nameContainer.appendChild(badgeContainer);
        }
      } else if (isVerifiedOutstanding) {
        if (row.classList.contains("lt42-outstanding-project")) return;
        row.className = "flex flex-row justify-between hover:bg-gray-300 p-2 lt42-outstanding-project";
        const nameContainer = row.querySelector(".flex.flex-row.gap-1");
        if (nameContainer) {
          nameContainer.querySelectorAll(".lt42-bonus-badge, .lt42-outstanding-badge, .lt42-ultra-badge").forEach(b => b.remove());
          const badge = document.createElement("div");
          badge.className = "lt42-outstanding-badge small";
          badge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg><span>Outstanding</span>`;
          nameContainer.appendChild(badge);
        }
      } else if (isBonus) {
        if (row.classList.contains("lt42-bonus-project")) return;
        row.classList.add("lt42-bonus-project");
        const nameContainer = row.querySelector(".flex.flex-row.gap-1");
        if (nameContainer) {
          nameContainer.querySelectorAll(".lt42-bonus-badge, .lt42-outstanding-badge, .lt42-ultra-badge").forEach(b => b.remove());
          const badge = document.createElement("div");
          badge.className = "lt42-bonus-badge small";
          badge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg><span>Bonus</span>`;
          nameContainer.appendChild(badge);
        }
      }
    });
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.id = "logtime42-profile-styles";
    style.textContent = `
      .lt42-flip-card { background-color: transparent; perspective: 1000px; cursor: pointer; min-height: 400px; }
      .lt42-flip-card-inner { position: relative; width: 100%; height: 100%; text-align: center; transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1); transform-style: preserve-3d; }
      .lt42-flip-card.is-flipped .lt42-flip-card-inner { transform: rotateY(180deg); }
      .lt42-flip-card-front, .lt42-flip-card-back { position: absolute; width: 100%; height: 100%; -webkit-backface-visibility: hidden; backface-visibility: hidden; border-radius: 0.5rem; }
      .lt42-flip-card-back { transform: rotateY(180deg); background: white; z-index: 1; display: flex; flex-direction: column; }
      .lt42-flip-card-front { z-index: 2; }
      .lt42-coalition-star {
        position: absolute;
        top: -40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 4;
        pointer-events: none;
        animation: lt42-star-bounce 2.5s infinite ease-in-out;
      }
      @keyframes lt42-star-bounce {
        0%, 100% { transform: translateX(-50%) translateY(0) scale(1); filter: drop-shadow(0 0 5px gold); }
        50% { transform: translateX(-50%) translateY(-8px) scale(1.2); filter: drop-shadow(0 0 15px gold); }
      }
      .lt42-podium-container { display: flex; flex-direction: column; justify-content: center; height: 100%; padding-bottom: 20px; }
      .lt42-records-grid-container { display: flex; flex-direction: column; justify-content: flex-start; height: 100%; padding-top: 20px; }
      .lt42-podium-section { flex: 1; display: flex; flex-direction: column; justify-content: center; width: 100%; }
      .lt42-podium-row { display: flex; align-items: flex-end; justify-content: center; gap: 25px; height: 180px; width: 100%; }
      .lt42-podium-step { display: flex; flex-direction: column; align-items: center; width: 110px; position: relative; }
      .lt42-podium-avatar { width: 64px; height: 64px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.15); overflow: hidden; background: #f0f0f0; margin-bottom: 8px; z-index: 2; position: relative; }
      .lt42-podium-box { width: 100%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; border-radius: 6px 6px 0 0; font-size: 18px; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }
      .podium-color-1 { height: 70px; background: linear-gradient(135deg, #ffd700 0%, #ff8c00 100%); border: 1px solid #e5bl00; z-index: 1; }
      .podium-color-2 { height: 50px; background: linear-gradient(135deg, #c0c0c0 0%, #8e8e8e 100%); border: 1px solid #a0a0a0; }
      .podium-color-3 { height: 35px; background: linear-gradient(135deg, #cd7f32 0%, #8b4513 100%); border: 1px solid #b87333; }
      .lt42-podium-label { position: absolute; top: -45px; font-size: 12px; font-weight: 800; color: #111; background: white; padding: 4px 12px; border-radius: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); z-index: 5; border: 1px solid #eee; }
      .lt42-podium-value { font-size: 14px; font-weight: 900; color: #111; background: white; padding: 4px 14px; border-radius: 12px; margin-bottom: -10px; z-index: 3; border: 2px solid #fff; }
      .lt42-bonus-project { border-left: 4px solid #00babc !important; background: rgba(0, 186, 188, 0.03) !important; transition: transform 0.3s; }
      .lt42-outstanding-project { border-left: 4px solid #ffd700 !important; background: rgba(255, 215, 0, 0.04) !important; transition: transform 0.3s; }
      .lt42-ultra-project { border-left: 4px solid #ff4757 !important; background: rgba(255, 71, 87, 0.05) !important; transition: transform 0.3s; }
      .lt42-bonus-badge, .lt42-outstanding-badge { display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; border-radius: 4px; text-transform: uppercase; margin-left: 6px; font-weight: 900; font-size: 8px; }
      .lt42-bonus-badge { background: #00babc; color: white; }
      .lt42-outstanding-badge { background: #ffd700; color: black; }
      .lt42-friend-badge { 
        font-size: 8px; 
        font-weight: 900; 
        color: white; 
        background: #4E5566; 
        border-radius: 4px; 
        padding: 1px 5px; 
        text-transform: uppercase; 
        box-shadow: 0 1px 3px rgba(0,0,0,0.1); 
        white-space: nowrap;
      }
      .lt42-spinning svg {
        animation: lt42-spin 1s linear infinite;
      }
      @keyframes lt42-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .lt42-refresh-btn {
        display: flex !important;
        align-items: center;
        justify-content: center;
        width: 24px !important;
        height: 24px !important;
        background: transparent !important;
        border: 1px solid #00babc !important;
        border-radius: 4px !important;
        color: #00babc !important;
        cursor: pointer !important;
        padding: 0 !important;
        transition: all 0.2s;
      }
      .lt42-refresh-btn:hover {
        background: rgba(0, 186, 188, 0.1) !important;
        transform: scale(1.1);
      }
      .lt42-action-btn { 
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function renderPodiumSection(container, title, top3, formatFn, type, globalWinnerColor) {
    const section = document.createElement("div");
    section.className = "lt42-podium-section";
    
    const row = document.createElement("div");
    row.className = "lt42-podium-row";
    
    // Order: 2, 1, 3 for the podium shape
    const podiumOrder = [1, 0, 2];
    podiumOrder.forEach(idx => {
      const p = top3[idx];
      if (p) renderPodiumStep(row, p, formatFn(p[type]), type, idx + 1, globalWinnerColor);
    });
    
    section.appendChild(row);
    container.appendChild(section);
  }

  function renderPodiumStep(container, p, value, type, rank, globalWinnerColor) {
    const step = document.createElement("div");
    step.className = "lt42-podium-step";
    
    const label = document.createElement("div");
    label.className = "lt42-podium-label";
    label.textContent = p.login;
    
    const avatarEl = document.createElement("div");
    avatarEl.className = "lt42-podium-avatar";
    if (p.coalitionColor) {
      avatarEl.style.border = `2px solid ${p.coalitionColor}`;
    }
    if (p.avatar) {
      avatarEl.innerHTML = `<img src="${p.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      avatarEl.style.display = "flex";
      avatarEl.style.alignItems = "center";
      avatarEl.style.justifyContent = "center";
      avatarEl.style.background = "#ddd";
      avatarEl.style.fontWeight = "bold";
      avatarEl.style.borderRadius = "50%";
      avatarEl.textContent = p.login.substring(0, 2).toUpperCase();
    }

    if (p.coalitionLogo) {
      const miniLogo = document.createElement("div");
      miniLogo.style.cssText = `
        width: 14px; height: 14px; position: absolute; bottom: -2px; right: -4px;
        z-index: 10; background-image: url('${p.coalitionLogo}'); background-size: 85%;
        background-repeat: no-repeat; background-position: center; background-color: white;
        border-radius: 50%; border: 1px solid #e0e0e0; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      `;
      avatarEl.appendChild(miniLogo);
    }
    
    if (p.coalitionColor && globalWinnerColor && p.coalitionColor === globalWinnerColor) {
      const star = document.createElement("div");
      star.style.cssText = "position:absolute; bottom:-3px; left:-3px; z-index:10;";
      star.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="url(#starMiniGradient)" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 0 3px rgba(255,215,0,0.8)); display: block;">
          <defs>
            <linearGradient id="starMiniGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#fffce1;stop-opacity:1" />
              <stop offset="50%" style="stop-color:#ffd700;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#ff8c00;stop-opacity:1" />
            </linearGradient>
          </defs>
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="#fff" stroke-width="0.5" />
        </svg>
      `;
      avatarEl.appendChild(star);
    }
    
    const valEl = document.createElement("div");
    valEl.className = "lt42-podium-value";
    valEl.textContent = value;
    
    const box = document.createElement("div");
    box.className = `lt42-podium-box podium-color-${rank}`;
    box.textContent = rank;
    
    step.appendChild(label);
    step.appendChild(avatarEl);
    step.appendChild(valEl);
    step.appendChild(box);
    container.appendChild(step);
  }

  function injectMatrixLink() {
    chrome.storage.local.get(["userCampus"], function (data) {
      if (!data.userCampus || !data.userCampus.toLowerCase().includes('lyon')) return;
      if (document.getElementById("lt42-matrix-header-link")) return;

      const buttons = document.querySelectorAll('button[aria-haspopup="menu"]');
      let bellBtn = null;
      for (const btn of buttons) {
        if (btn.querySelector('title')?.textContent.includes('notification')) {
          bellBtn = btn;
          break;
        }
      }

      if (!bellBtn || !bellBtn.parentElement) return;

      const matrixLink = document.createElement("a");
      matrixLink.id = "lt42-matrix-header-link";
      matrixLink.href = "https://matrix.42lyon.fr/claimed";
      matrixLink.target = "_blank";
      matrixLink.title = "Matrix 42 Lyon";
      matrixLink.className = "flex items-center justify-center p-0 h-full transition-opacity hover:opacity-70";
      matrixLink.style.marginRight = "-8px";
      matrixLink.style.marginLeft = "5px";
      
      const mIcon = document.createElement("div");
      mIcon.style.cssText = "width:22px;height:22px;border:1.5px solid #333;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:#333;font-family:sans-serif;";
      mIcon.textContent = "M";
      
      matrixLink.appendChild(mIcon);
      bellBtn.parentElement.insertBefore(matrixLink, bellBtn);
    });
  }

  function boot() {
    if (window.location.pathname !== "/" && !window.location.pathname.startsWith("/users/")) return;
    injectStyles();
    const login = getProfileUserName();
    const isAvailable = () => typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id;

    if (login && isAvailable()) {
      chrome.runtime.sendMessage({ action: "getOutstandingData", login }, (res) => {
        if (res && res.outstandingIds) {
          outstandingProjectIds = res.outstandingIds;
          decorateOutstandingProjects();
        }
      });
    }
    const tryInject = (attempt) => {
      if (document.querySelectorAll(".font-bold.text-black.uppercase.text-sm").length >= 3 || attempt > 20) {
        injectHeaderStats();
        injectMonthlyTotals();
        injectFriendsCard();
        injectMatrixLink();
        decorateOutstandingProjects();
        scrapeProfileData();
      } else {
        setTimeout(() => tryInject(attempt + 1), 500);
      }
    };
    tryInject(0);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 1500));
  else setTimeout(boot, 1500);
})();
