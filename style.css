/* --- THE PAINT: SCROLL & SPREADSHEET ENGINE --- */

@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');

:root {
    --blue: #3b82f6;
    --bg: #0b0f1a;
    --card: #111827;
    --border: rgba(255, 255, 255, 0.08);
}

* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

body, html {
    margin: 0; padding: 0; height: 100vh; width: 100vw;
    background-color: var(--bg); color: white;
    font-family: 'Plus Jakarta Sans', sans-serif;
    overflow: hidden;
}

/* --- SCROLL ZONES --- */
#sidebar { width: 260px; height: 100vh; background: var(--card); border-right: 1px solid var(--border); flex-shrink: 0; display: flex; flex-direction: column; }
.sidebar-nav { flex: 1; overflow-y: auto !important; padding: 10px 0; }
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); }

.tab-panel {
    display: none; position: absolute; inset: 0; width: 100%; height: 100%;
    overflow-y: auto !important; padding-bottom: 150px;
}
.tab-panel.active { display: block !important; }

/* --- DASHBOARD INTERACTIVITY --- */
.balance-card, .stat-card { cursor: pointer; transition: 0.3s cubic-bezier(0.4,0,0.2,1); }
.balance-card:hover, .stat-card:hover { transform: scale(1.01); filter: brightness(1.15); }
.balance-card { background: linear-gradient(135deg, #3b82f6, #1e3a8a); padding: 48px; border-radius: 48px; }
.stat-card { background: var(--card); border: 1px solid var(--border); padding: 48px; border-radius: 48px; text-align: center; }

/* --- SPREADSHEET DESIGN --- */
.spreadsheet-box { background: var(--card); border: 1px solid var(--border); border-radius: 32px; overflow: hidden; }
.fleet-table { width: 100%; border-collapse: collapse; text-align: left; }
.fleet-table th { 
    padding: 16px 24px; font-size: 10px; color: #64748b; text-transform: uppercase; 
    background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--border); 
}
.fleet-table td { padding: 16px 24px; font-size: 13px; border-bottom: 1px solid var(--border); }
.fleet-table tr:hover td { background: rgba(255,255,255,0.03); color: var(--blue); cursor: pointer; }

/* --- CALENDAR PROFESSIONAL UI --- */
#dash-calendar { min-height: 600px; height: 100% !important; }
.fc { font-family: inherit; --fc-border-color: rgba(255,255,255,0.05); }
.fc .fc-button-primary { background: #1e293b !important; border: 1px solid var(--border) !important; font-size: 10px !important; font-weight: 900 !important; text-transform: uppercase !important; }
.fc .fc-button-active { background: var(--blue) !important; }

/* MODALS */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.9); backdrop-filter: blur(10px); z-index: 1000; display: flex; align-items: center; justify-content: center; }
.modal-box { background: var(--card); border: 1px solid var(--border); padding: 40px; border-radius: 40px; width: 440px; }
.modal-input { width: 100%; background: #1e293b; border: 1px solid var(--border); padding: 16px; border-radius: 12px; color: white; margin-bottom: 12px; }

.hidden { display: none !important; }
.nav-btn { display: flex; align-items: center; gap: 14px; width: 90%; margin: 4px auto; padding: 14px 20px; border-radius: 12px; color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; cursor: pointer; border: none; background: transparent; }
.nav-btn.active { color: white; background: var(--blue); }

