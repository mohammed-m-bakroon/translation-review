import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import { createHttpApi } from './data/httpApi';
import { createMockApi } from './data/mockApi';
import { createHttpTranslator } from './data/httpTranslator';
import { createDemoTranslator } from './data/demoTranslator';
import { TranslationProvider } from './state/TranslationProvider';
import './styles.css';

// Created once, outside React, so the adapter identity is stable across renders.
// Unset variables keep the localStorage demo. Set them to use server/ (see .env.example).
const token = optionalEnv('VITE_API_TOKEN');
const apiBase = optionalEnv('VITE_API_BASE_URL');
const aiBase = optionalEnv('VITE_AI_BASE_URL') ?? apiBase;
const api = apiBase ? createHttpApi(apiBase, token) : createMockApi();
const service = aiBase ? createHttpTranslator(aiBase, token) : createDemoTranslator();

function optionalEnv(name: 'VITE_API_BASE_URL' | 'VITE_AI_BASE_URL' | 'VITE_API_TOKEN'): string | undefined {
  const value = import.meta.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TranslationProvider api={api} service={service}>
      <App />
    </TranslationProvider>
  </StrictMode>,
);
