/* --- MASTER UI: SCROLL & CALENDAR LOCK --- */

@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');

:root {
    --blue: #3b82f6;
    --bg: #0b0f1a;
    --card: #111827;
    --border: rgba(255, 255, 255, 0.08);
}

* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; }

/* 1. LAYOUT LOCK: Prevent whole-page dragging */
body, html {
    margin: 0; padding: 0;
    height: 100vh; width: 100vw;
    background-color: var(--bg);
    color: white; font-family: 'Plus Jakarta Sans', sans-serif;
    overflow: hidden; 
}

#app-shell { display: flex; width: 100%; height: 100vh; overflow: hidden; }

/* 2. SIDEBAR SCROLL: Keep the logo fixed, scroll the buttons */
#sidebar {
    width: 280px; height: 100vh;
    background: var(--card); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; flex-shrink: 0;
}
.sidebar-nav {
    flex: 1;
    overflow-y: auto !important; /* Enable toolbar scroll */
    padding: 12px 0;
}
.sidebar-nav::-webkit-scrollbar { width: 4px; }
.sidebar-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }

/* 3. CONTENT AREA: Independent Scroll Zone */
#viewport { flex: 1; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.tab-panel {
    display: none; height: 100%; width: 100%;
    overflow-y: auto !important; /* Forces scroll for long dashboard/registries */
    padding-bottom: 150px;
}
.tab-panel.active { display: block !important; }

/* 4. CALENDAR FIX: Force it to have a physical size so it's not a void */
#dash-calendar {
    min-height: 650px !important;
    height: 650px !important;
    background: rgba(0,0,0,0.2);
    border-radius: 24px;
    padding: 15px;
    border: 1px solid var(--border);
}

/* SPREADSHEET STYLING */
.spreadsheet-container { background: var(--card); border: 1px solid var(--border); border-radius: 32px; overflow: hidden; margin-top: 24px; }
.fleet-table { width: 100%; border-collapse: collapse; text-align: left; }
.fleet-table th { padding: 18px 24px; font-size: 10px; color: #64748b; text-transform: uppercase; background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--border); }
.fleet-table td { padding: 18px 24px; font-size: 13px; border-bottom: 1px solid var(--border); }
.fleet-table tr:hover td { background: rgba(255,255,255,0.03); color: var(--blue); cursor: pointer; }

/* TILES */
.balance-card, .stat-card { cursor: pointer; transition: 0.3s; }
.balance-card:hover, .stat-card:hover { transform: translateY(-4px); filter: brightness(1.2); }
.balance-card { background: linear-gradient(135deg, #3b82f6, #1e3a8a); padding: 48px; border-radius: 48px; }
.stat-card { background: var(--card); border: 1px solid var(--border); padding: 48px; border-radius: 48px; text-align: center; }

.nav-btn { display: flex; align-items: center; gap: 14px; width: 90%; margin: 4px auto; padding: 14px 20px; border-radius: 12px; color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; border: none; background: transparent; cursor: pointer; text-align: left; }
.nav-btn.active { color: white !important; background: var(--blue) !important; box-shadow: 0 10px 30px rgba(59, 130, 246, 0.3); }

.hidden { display: none !important; }
.pulse { display: inline-block; width: 6px; height: 6px; background: #22c55e; border-radius: 50%; margin-right: 6px; animation: p-anim 2s infinite; }
@keyframes p-anim { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }

