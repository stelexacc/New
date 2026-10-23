import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import WebRoot from './WebRoot.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<React.StrictMode>{import.meta.env.VITE_STELEX_WEB==='true'?<WebRoot/>:<App/>}</React.StrictMode>);
