// content-script.js

// Seuils en minutes
const THRESHOLDS = {
    GREEN: 222,  // >= 3h42
    BLUE: 162,   // 2h42 -> 3h41
    ORANGE: 102, // 1h42 -> 2h41
    RED: 0       // 0 -> 1h41
};

let isMatrixEnabled = true;

// Toujours afficher le temps réel
function minutesToHoursMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h${m.toString().padStart(2, '0')}`;
}

// Couleurs par seuil
function getColorThemeForMinutes(mins, isClaimed) {
    if (isClaimed) return { bgColor: '#eab308', borderColor: '#854d0e', shadowColor: 'rgba(234, 179, 8, 0.5)', text: 'CLAIMED' };
    if (mins >= THRESHOLDS.GREEN) return { bgColor: '#22c55e', borderColor: '#14532d', shadowColor: 'rgba(34, 197, 94, 0.5)' };
    if (mins >= THRESHOLDS.BLUE) return { bgColor: '#3b82f6', borderColor: '#1e3a8a', shadowColor: 'rgba(59, 130, 246, 0.5)' };
    if (mins >= THRESHOLDS.ORANGE) return { bgColor: '#f97316', borderColor: '#7c2d12', shadowColor: 'rgba(249, 115, 22, 0.5)' };
    if (mins > 0) return { bgColor: '#ef4444', borderColor: '#7f1d1d', shadowColor: 'rgba(239, 68, 68, 0.5)' };
    return null;
}

function generateCSS(clusterTimes, activeSession) {
    if (!isMatrixEnabled) return '';
    let cssString = '';

    const activeHost = activeSession ? activeSession.host : null;
    const activeStart = activeSession ? new Date(activeSession.begin_at) : null;

    for (const [host, baseMins] of Object.entries(clusterTimes)) {
        let totalMins = baseMins;

        if (host === activeHost && activeStart) {
            const liveDiff = Math.floor((new Date() - activeStart) / 60000);
            totalMins += liveDiff;
        }

        if (totalMins <= 0) continue;

        const isClaimed = window.claimedHosts && window.claimedHosts.includes(host);
        const theme = getColorThemeForMinutes(totalMins, isClaimed);
        if (!theme) continue;

        const timeStr = minutesToHoursMinutes(totalMins);
        const text = isClaimed ? `CLAIMED\\00000a${timeStr}` : timeStr;

        cssString += `
            #host-${host} {
                opacity: 1 !important; transform: scale(1.1) !important; z-index: 50 !important;
                box-shadow: 0 10px 25px -5px ${theme.shadowColor} !important; position: relative !important;
            }
            #${host} > div > div > div { background-color: ${theme.bgColor} !important; border: 2px solid ${theme.borderColor} !important; }
            #${host} p { color: #ffffff !important; font-weight: 800 !important; }
            #${host} svg { color: #ffffff !important; }
            #host-${host}::after {
                content: "${text}"; position: absolute; top: 40px; left: 50%; transform: translateX(-50%); 
                background-color: #111827; color: #ffffff; font-size: 10px; font-weight: 900;
                padding: 4px 8px; border-radius: 4px; white-space: pre-wrap !important; z-index: 100 !important;
                border: 1px solid ${theme.bgColor}; pointer-events: none; text-align: center; line-height: 1.2;
            }
        `;
    }
    return cssString;
}

function injectOrUpdateCSS(clusterTimes, activeSession) {
    let styleEl = document.getElementById('logtime42-matrix-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'logtime42-matrix-styles';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = generateCSS(clusterTimes, activeSession);
}

// Initialisation
let currentClusterTimes = {};
let currentActiveSession = null;
let renderTimeout = null;
window.claimedHosts = [];

async function fetchMyClaims() {
    try {
        const res = await fetch("https://matrix.42lyon.fr/claimed");
        if (res.ok) {
            const html = await res.text();
            // Scraping simple : on vérifie pour chaque poste si la chaine de caractères existe
            // dans la page des claims (qui ne liste que les claims de l'utilisateur).
            let hostsFound = [];
            for (const host of Object.keys(currentClusterTimes)) {
                if (html.includes(host)) {
                    hostsFound.push(host);
                }
            }
            window.claimedHosts = hostsFound;
            render();
        }
    } catch(err) {
        console.error("Logtime42: Impossible de récupérer les claims :", err);
    }
}

function render() {
    injectOrUpdateCSS(currentClusterTimes, currentActiveSession);
    updateStatsMenu();
}

function updateStatsMenu() {
    let menu = document.getElementById('logtime42-stats-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'logtime42-stats-menu';
        menu.style.cssText = `
            position: fixed; top: 80px; left: 20px; z-index: 10000;
            background: rgba(17, 24, 39, 0.85); backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px;
            padding: 16px; color: white; font-family: sans-serif;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
            min-width: 220px; transition: all 0.3s ease;
        `;
        document.body.appendChild(menu);
    }

    // Calculer les stats
    let totalMins = 0;
    const hostsList = [];

    const activeHost = currentActiveSession ? currentActiveSession.host : null;
    const activeStart = currentActiveSession ? new Date(currentActiveSession.begin_at) : null;

    for (const [host, baseMins] of Object.entries(currentClusterTimes)) {
        let hostMins = baseMins;
        if (host === activeHost && activeStart) {
            hostMins += Math.floor((new Date() - activeStart) / 60000);
        }
        totalMins += hostMins;
        hostsList.push({ host, mins: hostMins });
    }

    hostsList.sort((a, b) => b.mins - a.mins);
    const top5 = hostsList.slice(0, 5);

    const isClaimedPage = window.location.pathname === '/claimed';
    const navLabel = isClaimedPage ? 'Voir Matrix' : 'Mes Claims';

    menu.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0; font-size: 14px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Logtime Global</h3>
            <label class="logtime-switch">
                <input type="checkbox" id="matrix-toggle" ${isMatrixEnabled ? 'checked' : ''}>
                <span class="logtime-slider"></span>
            </label>
        </div>
        <div style="font-size: 24px; font-weight: 800; margin-bottom: 16px; color: #22c55e;">
            ${minutesToHoursMinutes(totalMins)}
        </div>
        <button id="matrix-nav-btn" style="
            width: 100%; padding: 8px; margin-bottom: 16px; border-radius: 6px; 
            border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(59, 130, 246, 0.2);
            color: #60a5fa; font-size: 13px; font-weight: 600; cursor: pointer;
            transition: all 0.2s ease;
        ">
            ${navLabel}
        </button>
        <div style="margin-top: 12px;">
            <h4 style="margin: 0 0 8px 0; font-size: 12px; color: #9ca3af;">TOP 5 PLACES</h4>
            <div style="display: flex; flex-direction: column; gap: 6px;">
                ${top5.map((h, i) => `
                    <div style="display: flex; justify-content: space-between; font-size: 13px;">
                        <span style="color: #d1d5db;">${i+1}. ${h.host}</span>
                        <span style="font-weight: 700; color: #ffffff;">${minutesToHoursMinutes(h.mins)}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        <style>
            #matrix-nav-btn:hover { background: rgba(59, 130, 246, 0.3) !important; border-color: #60a5fa !important; }
            .logtime-switch { position: relative; display: inline-block; width: 34px; height: 20px; }
            .logtime-switch input { opacity: 0; width: 0; height: 0; }
            .logtime-slider { 
                position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; 
                background-color: #374151; transition: .4s; border-radius: 20px;
            }
            .logtime-slider:before { 
                position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; 
                background-color: white; transition: .4s; border-radius: 50%;
            }
            input:checked + .logtime-slider { background-color: #22c55e; }
            input:checked + .logtime-slider:before { transform: translateX(14px); }
        </style>
    `;

    document.getElementById('matrix-toggle').addEventListener('change', (e) => {
        isMatrixEnabled = e.target.checked;
        chrome.storage.local.set({ isMatrixEnabled: isMatrixEnabled });
        render();
    });

    document.getElementById('matrix-nav-btn').addEventListener('click', () => {
        window.location.href = isClaimedPage ? '/' : '/claimed';
    });
}

// Debounce pour éviter de re-render trop souvent lors des mutations DOM
function debouncedRender() {
    if (renderTimeout) clearTimeout(renderTimeout);
    renderTimeout = setTimeout(render, 300);
}

// Attendre que la page SvelteKit soit complètement rendue
function waitForMatrixAndRender() {
    // Observer les mutations du DOM pour détecter quand SvelteKit a fini de render
    const observer = new MutationObserver(() => {
        // Chaque fois que le DOM change, on re-render (les rotate-y-180 arrivent dynamiquement)
        debouncedRender();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'] // Surveiller les changements de classe (rotate-y-180)
    });

    // Render initial après un délai pour laisser SvelteKit hydrater
    setTimeout(render, 2000);
    // Re-render de sécurité au cas où le premier était trop tôt
    setTimeout(render, 5000);

    // Live updater chaque minute pour le temps en cours
    setInterval(render, 60000);
    
    // Refresh claims periodically
    setInterval(fetchMyClaims, 120000);
}

// Chargement initial depuis le Storage
chrome.storage.local.get(['clusterTimes', 'activeSession', 'isMatrixEnabled'], (data) => {
    currentClusterTimes = data.clusterTimes || {};
    currentActiveSession = data.activeSession || null;
    isMatrixEnabled = data.isMatrixEnabled !== undefined ? data.isMatrixEnabled : true;
    fetchMyClaims();
    waitForMatrixAndRender();
});

// Écoute des updates depuis background.js
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        let changed = false;
        if (changes.clusterTimes) {
            currentClusterTimes = changes.clusterTimes.newValue || {};
            changed = true;
        }
        if (changes.activeSession) {
            currentActiveSession = changes.activeSession.newValue || null;
            changed = true;
        }
        if (changed) render();
    }
});

console.log("%c✅ Logtime42 Matrix Tracker chargé !", "color: #22c55e; font-size: 14px;");
