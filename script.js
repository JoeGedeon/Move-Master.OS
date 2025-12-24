/* --- ENTERPRISE DESIGN TOKENS --- */
:root {
    --primary: #2563eb;
    --dark: #0F172A;
    --sidebar-active: rgba(255, 255, 255, 0.05);
}

@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');

body { 
    font-family: 'Plus Jakarta Sans', sans-serif; 
    -webkit-tap-highlight-color: transparent;
}

/* Sidebar Buttons */
.nav-btn-sidebar {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 14px 16px;
    border-radius: 14px;
    font-size: 0.9rem;
    font-weight: 600;
    color: #94A3B8;
    transition: all 0.2s;
}

.nav-btn-sidebar:hover {
    color: white;
    background: var(--sidebar-active);
}

.nav-btn-sidebar.active {
    color: white;
    background: var(--primary);
    box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.2);
}

/* Mobile Nav Buttons */
.nav-btn-mobile {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px;
    transition: all 0.2s;
}

/* Tab Management */
.tab-content { display: none; }
.tab-content.active { display: block; }

/* Interactive Elements */
.btn-press:active { transform: scale(0.97); opacity: 0.9; }

/* Custom Animations */
.animate-in {
    animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.loader-ring {
    border: 4px solid #f1f5f9;
    border-top: 4px solid var(--primary);
    border-radius: 50%;
    width: 48px;
    height: 48px;
    animation: spin 1s linear infinite;
}

@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

/* Custom Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }

/* Dashboard List Styling */
#logs-container > div {
    transition: all 0.2s;
}
#logs-container > div:hover {
    transform: translateX(4px);
    border-color: #BFDBFE;
}

