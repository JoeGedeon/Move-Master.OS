import React, { useState } from 'react';

// Simplified imports to test the connection
export default function App() {
  const [view, setView] = useState('dashboard');

  return (
    <div style={{ backgroundColor: '#111827', minHeight: '100vh', color: 'white', display: 'flex' }}>
      {/* Sidebar */}
      <nav style={{ width: '250px', borderRight: '1px solid #374151', padding: '20px' }}>
        <h1 style={{ color: '#3b82f6' }}>MoveMaster OS</h1>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '20px' }}>
          <li onClick={() => setView('dashboard')} style={{ cursor: 'pointer', padding: '10px 0' }}>Dashboard</li>
          <li onClick={() => setView('settings')} style={{ cursor: 'pointer', padding: '10px 0' }}>Settings</li>
        </ul>
      </nav>

      {/* Content */}
      <main style={{ padding: '40px', flex: 1 }}>
        {view === 'dashboard' ? (
          <div>
            <h2 style={{ fontSize: '2rem' }}>Welcome to your Dashboard</h2>
            <p>If you can see this, the white screen is FIXED.</p>
          </div>
        ) : (
          <div><h2>Settings Page</h2></div>
        )}
      </main>
    </div>
  );
}
