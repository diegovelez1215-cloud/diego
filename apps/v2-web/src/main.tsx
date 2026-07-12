import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/reset.css';
import './styles/tokens.css';
import './styles/shell.css';

const root = document.getElementById('v2-root');

if (!root) {
  throw new Error('United 2026 V2 could not find its application root.');
}

createRoot(root).render(<App />);
