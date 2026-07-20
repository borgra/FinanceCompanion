import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

document.title = import.meta.env.DEV ? 'Local - Finance Com' : 'Finance Companion';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
