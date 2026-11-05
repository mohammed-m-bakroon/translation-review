import { useMemo, useState } from 'react';
import { buildExport, filterItems } from '../domain';
import { useTranslations } from '../state/TranslationProvider';
import { Editor } from './Editor';
import { FilterBar } from './FilterBar';
import { ItemList } from './ItemList';
import { StatsBar } from './StatsBar';
import { AddPanel, GlossaryPanel, ImportPanel } from './Panels';

type PanelName = 'add' | 'import' | 'glossary';

function downloadJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const { state, selected, select, setFilters, editEnglish, moveTo, removeItem, translateMissing, dismissNotice } = useTranslations();
  const missingCount = state.items.filter((i) => i.en.trim() === '').length;
  const busy = state.translating.length > 0;
  const [panel, setPanel] = useState<PanelName | null>(null);
  const toggle = (name: PanelName) => setPanel((p) => (p === name ? null : name));
  const visible = useMemo(() => filterItems(state.items, state.filters), [state.items, state.filters]);

  if (state.status === 'loading') return <p className="screen" role="status">Loading translations…</p>;
  if (state.status === 'error') return <p className="screen" role="alert">Could not load translations: {state.error}</p>;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Translation Review</h1>
          <p className="muted">Arabic is the source. Only approved English is exported.</p>
        </div>
        <div className="topbar__actions">
          <button type="button" className="btn" aria-expanded={panel === 'add'} onClick={() => toggle('add')}>Add string</button>
          <button type="button" className="btn" aria-expanded={panel === 'import'} onClick={() => toggle('import')}>Import</button>
          <button type="button" className="btn" aria-expanded={panel === 'glossary'} onClick={() => toggle('glossary')}>Glossary</button>
          {missingCount > 0 && (
            <button type="button" className="btn" onClick={() => void translateMissing()} disabled={busy}>
              {busy ? 'Translating…' : `Translate missing (${missingCount})`}
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={() => downloadJson(buildExport(state.items), 'translations.json')}>
            Export approved
          </button>
        </div>
      </header>

      {panel === 'add' && <AddPanel onDone={() => setPanel(null)} />}
      {panel === 'import' && <ImportPanel onDone={() => setPanel(null)} />}
      {panel === 'glossary' && <GlossaryPanel onDone={() => setPanel(null)} />}

      {state.notice && (
        <p className="banner banner--info" role="status">
          {state.notice} <button type="button" className="btn btn--ghost btn--sm" onClick={dismissNotice}>Dismiss</button>
        </p>
      )}
      {state.saveError && <p className="banner" role="alert">Your last change was not saved and has been reverted: {state.saveError}</p>}

      <StatsBar items={state.items} />

      <main className="layout">
        <aside className="sidebar">
          <FilterBar items={state.items} filters={state.filters} onChange={setFilters} />
          <ItemList items={visible} selectedId={state.selectedId} onSelect={select} />
        </aside>
        {selected ? (
          <Editor key={selected.id} item={selected} glossary={state.glossary} onSave={editEnglish} onMove={moveTo} onDelete={removeItem} />
        ) : (
          <p className="empty">{state.items.length === 0 ? 'No strings yet. Use "Add string" or "Import" to start.' : 'Select a translation to review it.'}</p>
        )}
      </main>
    </div>
  );
}
