import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

/**
 * main.jsx
 * This is the primary entry point for MoveCalc PRO.
 * It mounts your React App into the 'root' div of the index.html file.
 */
const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  // If the screen stays black, it means index.html is missing <div id="root"></div>
  console.error("CRITICAL ERROR: The root element was not found in index.html.");
}

