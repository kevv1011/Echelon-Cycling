import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import {initializeTheme} from './hooks/useTheme.js';
initializeTheme();
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
