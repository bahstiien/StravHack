import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../_ds/modernist-258f3828-3586-492b-953f-73564ce81e5f/styles.css';
import './app.css';
import App from './App.jsx';
import AuthGate from './components/AuthGate.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate>{({ repository }) => <App repository={repository} />}</AuthGate>
  </StrictMode>,
);
