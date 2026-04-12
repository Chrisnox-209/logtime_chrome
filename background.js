// background.js

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("refreshData", { periodInMinutes: 5 });
  console.log("Extension Logtime installée. Alarme créée.");
  refreshAllData();

  chrome.storage.local.get(['clusterTimes', 'isCoalitionWinner'], (data) => {
    if (!data.clusterTimes) {
      chrome.storage.local.set({ clusterTimes: {}, lastProcessedLocationId: 0 });
    }
    if (data.isCoalitionWinner === undefined) {
      chrome.storage.local.set({ isCoalitionWinner: false });
    }
    console.log("Initialisation Matrix (0 postes) terminée.");
  });
});

chrome.runtime.onStartup.addListener(() => {
  refreshAllData();
});

// Restaurer le badge au démarrage du navigateur
chrome.storage.local.get(['cachedFriends'], (data) => {
  if (data.cachedFriends) {
    let count = 0;
    Object.values(data.cachedFriends).forEach(f => { if (f.active) count++; });
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: count > 0 ? '#00b894' : '#636e72' });
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "refreshData") {
    await refreshAllData();
  }
});

// Listener pour que le popup/options puisse demander un rafraîchissement manuel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "refresh") {
    refreshAllData(request.force || false).then(() => {
      sendResponse({ status: "success" });
    });
    return true;
  }
  if (request.action === "debug_storage") {
    chrome.storage.local.get(null, (data) => {
      console.log("[LT42] DEBUG STORAGE:", data);
      sendResponse(data);
    });
    return true;
  }
  if (request.action === "getOutstandingData") {
    (async () => {
      try {
        const ids = await getOutstandingProjects(request.login);
        sendResponse({ outstandingIds: ids || [] });
      } catch (e) {
        console.error("[LT42] Message handling error:", e);
        sendResponse({ outstandingIds: [] });
      }
    })();
    return true; // Keep channel open for async response
  }
  if (request.action === "login") {
    handleLogin().then(res => {
      sendResponse(res);
    }).catch(err => {
      sendResponse({ status: "error", error: err.message });
    });
    return true;
  }
  if (request.action === "autoScrapeProfile") {
    const url = `https://profile.intra.42.fr/users/${request.login}`;
    chrome.tabs.create({ url, active: false }, (tab) => {
      setTimeout(() => {
        chrome.tabs.remove(tab.id);
      }, 6000);
    });
    sendResponse({ status: "started" });
    return true;
  }
});

async function handleLogin() {
  const { clientId, clientSecret, username } = await chrome.storage.local.get(['clientId', 'clientSecret', 'username']);
  if (!clientId || !clientSecret || !username) {
    return { status: "error", error: "Veuillez configurer votre Login, UID et Secret dans les options." };
  }

  try {
    // 1. Get Access Token via client_credentials
    const res = await fetch('https://api.intra.42.fr/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      })
    });

    if (!res.ok) throw new Error("Identifiants API invalides (UID/Secret)");
    const data = await res.json();

    const expire = (Date.now() / 1000) + data.expires_in - 60;
    await chrome.storage.local.set({
      accessToken: data.access_token,
      refreshToken: null, // No refresh token in client_credentials
      tokenExpire: expire
    });

    // 2. Initial fetch to validate the target user and get avatar/campus
    const userRes = await fetch(`https://api.intra.42.fr/v2/users/${username}`, {
      headers: { 'Authorization': `Bearer ${data.access_token}` }
    });

    if (userRes.ok) {
      const userData = await userRes.json();
      
      // Store user avatar and campus
      let userAvatar = null;
      if (userData.image && userData.image.versions && userData.image.versions.small) {
        userAvatar = userData.image.versions.small;
      } else if (userData.image && userData.image.link) {
        userAvatar = userData.image.link;
      }

      let campusName = '';
      if (userData.campus && Array.isArray(userData.campus) && userData.campus.length > 0) {
        campusName = userData.campus[0].name || '';
      }

      await chrome.storage.local.set({ 
        userAvatar, 
        userCampus: campusName,
        userWallet: userData.wallet || 0,
        userCoalitionColor: (userData.coalitions && userData.coalitions[0]) ? userData.coalitions[0].color : null,
        userCoalitionLogo: (userData.coalitions && userData.coalitions[0]) ? userData.coalitions[0].image_url : null
      });
    } else {
      throw new Error(`Utilisateur '${username}' introuvable.`);
    }

    await refreshAllData();
    return { status: "success" };
  } catch (e) {
    console.error("Auth Error:", e);
    return { status: "error", error: e.message };
  }
}

async function getValidToken() {
  const data = await chrome.storage.local.get(['accessToken', 'tokenExpire', 'clientId', 'clientSecret']);
  
  if (data.accessToken && data.tokenExpire > (Date.now() / 1000)) {
    return data.accessToken;
  }

  if (data.clientId && data.clientSecret) {
    try {
      const res = await fetch('https://api.intra.42.fr/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: data.clientId,
          client_secret: data.clientSecret
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[LT42] Token refresh failed: ${res.status} ${res.statusText}`, errText);
        throw new Error("Auth failed");
      }
      const resData = await res.json();
      const expire = (Date.now() / 1000) + resData.expires_in - 60;
      
      await chrome.storage.local.set({
        accessToken: resData.access_token,
        tokenExpire: expire
      });
      return resData.access_token;
    } catch(e) {
      console.error("Token fetch failed", e);
    }
  }
  
  return null;
}

async function refreshAllData(force = false) {
  const currentToken = await getValidToken();
  if (!currentToken) return false;

  const settings = await chrome.storage.local.get(['username', 'friendsList']);
  const username = settings.username;
  if (!username) return false;

  // --- Déterminer la plage de dates ---
  const storageData = await chrome.storage.local.get(['clusterTimes', 'lastProcessedLocationId']);
  let clusterTimes = storageData.clusterTimes || {};
  let lastProcessedLocationId = storageData.lastProcessedLocationId || 0;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // To keep the profile calendar accurate, we want at least 12 months of data.
  const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  
  // Cache check: see if we have enough history
  const cacheInfo = await chrome.storage.local.get(['cachedLocations', 'lastProcessedLocationId', 'hasFetchedFullHistory']);
  const cachedLocs = cacheInfo.cachedLocations || [];
  const lastProcessedId = cacheInfo.lastProcessedLocationId || 0;
  const hasFetchedFullHistory = cacheInfo.hasFetchedFullHistory || false;
  
  // Only deep fetch if we never did it before
  const isFirstFetch = !hasFetchedFullHistory;

  let startObj;
  if (isFirstFetch) {
    startObj = twelveMonthsAgo;
    console.log("🔄 Fetch approfondi Logtime : récupération de 1 an d'historique...");
    await chrome.storage.local.set({ hasFetchedFullHistory: true });
  } else {
    startObj = new Date(now.getTime() - (45 * 24 * 60 * 60 * 1000));
  }
  const endObj = new Date(now.getTime() + 86400000);

  // --- 0. Initialize missing keys & priority coalition check ---
  let isCoalitionWinner = false;
  let userCoalition = null;
  try {
    const current = await chrome.storage.local.get(['isCoalitionWinner', 'cachedCoalition']);
    isCoalitionWinner = current.isCoalitionWinner || false;
    userCoalition = current.cachedCoalition || null;
  } catch (e) {
    console.warn("[LT42] Early coalition check failed deeply:", e);
  }

  const start = startObj.toISOString();
  const end = endObj.toISOString();

  try {
    // 1. Fetch Logtime
    let allLocs = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const locsRes = await fetch(`https://api.intra.42.fr/v2/users/${username}/locations?range[begin_at]=${start},${end}&per_page=100&page=${page}`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      if (!locsRes.ok) {
        console.error(`[LT42] Logtime fetch failed: ${locsRes.status} ${locsRes.statusText}`);
        if (locsRes.status === 401) {
          await chrome.storage.local.remove(['accessToken', 'tokenExpire']);
          console.warn("[LT42] Access token invalidated (401). Will try to refresh next time.");
        }
        throw new Error(`Logtime fetch failed (${locsRes.status})`);
      }
      const pageLocs = await locsRes.json();
      if (Array.isArray(pageLocs) && pageLocs.length > 0) {
        allLocs = allLocs.concat(pageLocs);
        page++;
        if (pageLocs.length < 100) hasMore = false;
        else await new Promise(r => setTimeout(r, 600));
      } else hasMore = false;
    }

    const { cachedLocations = [] } = await chrome.storage.local.get(['cachedLocations']);
    const locMap = {};
    cachedLocations.forEach(l => locMap[l.id] = l);
    allLocs.forEach(l => locMap[l.id] = l);
    
    let mergedLocs = Object.values(locMap).filter(l => new Date(l.begin_at).getTime() >= twelveMonthsAgo.getTime());
    mergedLocs.sort((a, b) => new Date(b.begin_at) - new Date(a.begin_at));

    const monthlyLogtime = {};
    const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    mergedLocs.forEach(l => {
      const s = new Date(l.begin_at).getTime();
      const e = (l.end_at ? new Date(l.end_at) : new Date()).getTime();
      let cur = new Date(new Date(s).getFullYear(), new Date(s).getMonth(), 1);
      const lst = new Date(new Date(e).getFullYear(), new Date(e).getMonth(), 1);
      while (cur <= lst) {
        const mS = new Date(cur.getFullYear(), cur.getMonth(), 1).getTime();
        const mE = new Date(cur.getFullYear(), cur.getMonth() + 1, 1).getTime();
        const oS = Math.max(s, mS);
        const oE = Math.min(e, mE);
        if (oE > oS) {
          const lbl = MONTH_NAMES[cur.getMonth()];
          monthlyLogtime[lbl] = (monthlyLogtime[lbl] || 0) + Math.floor((oE - oS) / 60000);
        }
        cur.setMonth(cur.getMonth() + 1);
      }
    });
    
    // --- Matrix Live ---
    let activeSession = null;
    let maxId = lastProcessedLocationId;
    mergedLocs.forEach(loc => {
      if (loc.id <= lastProcessedLocationId) return;
      if (loc.end_at !== null) {
        const dM = Math.floor((new Date(loc.end_at) - new Date(loc.begin_at)) / 60000);
        clusterTimes[loc.host] = (clusterTimes[loc.host] || 0) + dM;
        if (loc.id > maxId) maxId = loc.id;
      } else activeSession = { host: loc.host, begin_at: loc.begin_at };
    });

    await new Promise(r => setTimeout(r, 600));
    const statsRes = await fetch(`https://api.intra.42.fr/v2/users/${username}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const stats = statsRes.ok ? await statsRes.json() : null;
    
    if (stats) {
      let uAv = stats.image?.versions?.small || stats.image?.link;
      let cNa = stats.campus?.[0]?.name || '';
      await chrome.storage.local.set({ userAvatar: uAv, userCampus: cNa });
    }

    await chrome.storage.local.set({
      cachedLocations: mergedLocs,
      cachedStats: stats,
      cachedCoalition: userCoalition,
      isCoalitionWinner: isCoalitionWinner,
      monthlyLogtime: monthlyLogtime,
      lastRefresh: Date.now(),
      clusterTimes: clusterTimes,
      lastProcessedLocationId: maxId,
      activeSession: activeSession
    });

    // 3. Update friends
    const { friendsList: activeFriends = [], cachedFriends: oldFriendsStats = {}, friendAvatars = {} } = await chrome.storage.local.get(['friendsList', 'cachedFriends', 'friendAvatars']);
    let onlineFriends = 0;
    const friendsStats = { ...oldFriendsStats };

    if (activeFriends.length > 0) {
      for (const friend of activeFriends) {
        const fs = { ...(friendsStats[friend] || {}) };
        try {
          const cachedAvatar = friendAvatars[friend];
          const avatarFresh = cachedAvatar && cachedAvatar.fetchedAt && (Date.now() - cachedAvatar.fetchedAt < 86400000);
          const needsProf = force || !avatarFresh || !fs.level || fs.wallet === undefined || !fs.coalitionColor || !fs.titles?.length;

          // Only sleep before API call to respect 42 rate limits (500ms)
          await new Promise(r => setTimeout(r, 500));

          // 1. Fetch Location
          const nowD = new Date();
          const firstDay = new Date(nowD.getFullYear(), nowD.getMonth(), 1).toISOString();
          const locR = await fetch(`https://api.intra.42.fr/v2/users/${friend}/locations?range[begin_at]=${firstDay},${nowD.toISOString()}&per_page=100`, { 
            headers: { Authorization: `Bearer ${currentToken}` } 
          }).catch(() => null);
          
          if (locR?.ok) {
            const locs = await locR.json();
            fs.active = (locs.length > 0 && locs[0].end_at === null) ? locs[0].host : null;
            if (locs.length > 0) fs.locs = locs; // Save to compute session time in UI
            if (fs.active) onlineFriends++;

            let totalFriendMs = 0;
            const mS = new Date(nowD.getFullYear(), nowD.getMonth(), 1).getTime();
            const mE = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 1).getTime();
            locs.forEach(l => {
              const s = new Date(l.begin_at).getTime();
              const e = (l.end_at ? new Date(l.end_at) : Date.now()).getTime();
              const oS = Math.max(s, mS);
              const oE = Math.min(e, mE);
              if (oE > oS) totalFriendMs += (oE - oS);
            });
            fs.totalMs = totalFriendMs;
          } else if (locR?.status === 429) {
            console.warn(`[LT42] Rate limited (429) while syncing ${friend}. Skipping...`);
            continue; // Stop for this friend
          }

          // 2. Fetch Profile if needed
          if (needsProf) {
            await new Promise(r => setTimeout(r, 500)); // Respect 200-500ms rate limits
            const profR = await fetch(`https://api.intra.42.fr/v2/users/${friend}`, { 
              headers: { Authorization: `Bearer ${currentToken}` } 
            }).catch(() => null);
            
            if (profR?.ok) {
              const p = await profR.json();
              fs.wallet = p.wallet || 0;
              fs.level = p.cursus_users?.find(cu => cu.cursus_id === 21)?.level || fs.level || 0;
              // Filter out titles that contain the login (vanity titles like "Awesome %login")
              if (!fs.titles || fs.titles.length === 0) {
                fs.titles = (p.titles || [])
                  .map(t => t.name.replace('%login', friend))
                  .filter(name => !name.toLowerCase().includes(friend.toLowerCase()));
              }
              if (p.coalitions?.length > 0) {
                fs.coalitionColor = p.coalitions[0].color;
                fs.coalitionLogo = p.coalitions[0].image_url;
              }
              if (p.image?.versions?.small) fs.avatar = p.image.versions.small;
            }
          }

          // 3. Fetch Coalition if explicitly missing
          if (needsProf && (!fs.coalitionColor || !fs.coalitionLogo)) {
            await new Promise(r => setTimeout(r, 500));
            const cR = await fetch(`https://api.intra.42.fr/v2/users/${friend}/coalitions`, { 
              headers: { Authorization: `Bearer ${currentToken}` } 
            }).catch(() => null);
            if (cR?.ok) {
              const cD = await cR.json();
              if (cD.length > 0) {
                fs.coalitionColor = cD[0].color;
                fs.coalitionLogo = cD[0].image_url;
              } else {
                fs.coalitionColor = "#888"; // default if they have no coalition
              }
            }
          }
          friendsStats[friend] = fs;
        } catch(e) { console.warn("Friend sync fail", friend, e); }
      }
      await chrome.storage.local.set({ cachedFriends: friendsStats });
    }

    // --- Update Winning Coalition Globally (Once per hour max) ---
    try {
      const wData = await chrome.storage.local.get(['myWinningCoalitionTimestamp']);
      const lastW = wData.myWinningCoalitionTimestamp || 0;
      if (Date.now() - lastW > 3600000 || forceRefresh) {
         const meRes = await fetch(`https://api.intra.42.fr/v2/users/${username}`, {
           headers: { Authorization: `Bearer ${currentToken}` }
         });
         if (meRes.ok) {
            const meData = await meRes.json();
            const campusId = meData.campus && meData.campus.length > 0 ? meData.campus[0].id : 1;
            
            await new Promise(r => setTimeout(r, 500));
            const bRes = await fetch(`https://api.intra.42.fr/v2/blocs?filter[campus_id]=${campusId}`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            });
            if (bRes.ok) {
               const blocs = await bRes.json();
               if (blocs.length > 0) {
                   await new Promise(r => setTimeout(r, 500));
                   const cbRes = await fetch(`https://api.intra.42.fr/v2/blocs/${blocs[0].id}/coalitions`, {
                     headers: { Authorization: `Bearer ${currentToken}` }
                   });
                   if (cbRes.ok) {
                       const cbData = await cbRes.json();
                       cbData.sort((a,b) => b.score - a.score);
                       if (cbData.length > 0) {
                           await chrome.storage.local.set({ 
                              myWinningCoalitionColor: cbData[0].color,
                              myWinningCoalitionTimestamp: Date.now()
                           });
                       }
                   }
               }
            }
         }
      }
    } catch (e) { console.warn("Winner sync error", e); }

    const badgeCount = onlineFriends.toString();
    chrome.action.setBadgeText({ text: badgeCount });
    chrome.action.setBadgeBackgroundColor({ color: onlineFriends > 0 ? '#00b894' : '#636e72' });

    return true;
  } catch (err) {
    console.error("Refresh fail:", err);
    return false;
  }
}

async function getOutstandingProjects(login) {
  try {
    const data = await chrome.storage.local.get(['outstandingCache']);
    const cache = data.outstandingCache || {};
    const entry = cache[login];

    // 24h cache (86400000 ms)
    if (entry && (Date.now() - entry.timestamp < 86400000)) {
      return entry.ids;
    }

    const token = await getValidToken();
    if (!token) {
      console.warn("[LT42] No valid API token found. Please check your UID/Secret in options.");
      return [];
    }

    console.log(`[LT42] Fetching Outstanding data for ${login}...`);
    const res = await fetch(`https://api.intra.42.fr/v2/users/${login}/scale_teams/as_corrected?per_page=100`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
        console.error(`[LT42] API request failed for ${login}: ${res.status}`);
        return [];
    }

    const evals = await res.json();
    if (!Array.isArray(evals)) return [];

    console.log(`[LT42] Processing ${evals.length} evaluations for ${login}...`);

    // Flag ID 9 is "Outstanding project"
    const outstandingIds = evals
      .filter(e => e.flag && (e.flag.id === 9 || (e.flag.name && e.flag.name.toLowerCase().includes('outstanding'))))
      .map(e => {
        const teamUser = e.team.users.find(u => u.login === login);
        return teamUser ? teamUser.projects_user_id.toString() : null;
      })
      .filter(id => id !== null);

    const uniqueIds = [...new Set(outstandingIds)];
    console.log(`[LT42] Found ${uniqueIds.length} outstanding IDs for ${login}:`, uniqueIds);

    cache[login] = { ids: uniqueIds, timestamp: Date.now() };
    await chrome.storage.local.set({ outstandingCache: cache });

    return uniqueIds;
  } catch (e) {
    console.error("[LT42] Error in getOutstandingProjects:", e);
    return [];
  }
}
