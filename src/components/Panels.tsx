import { useState } from 'react';
import type { FormEvent } from 'react';
import type { GlossaryTerm } from '../domain';
import { useTranslations } from '../state/TranslationProvider';

export function AddPanel({ onDone }: { onDone(): void }) {
  const { addItem } = useTranslations();
  const [id, setId] = useState('');
  const [ar, setAr] = useState('');
  const [en, setEn] = useState('');
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const message = addItem(id, ar, en, auto && en.trim() === '');
    if (message) setError(message);
    else onDone();
  };

  return (
    <form className="panel" onSubmit={submit} aria-label="Add a string">
      <h2>Add a string</h2>
      <label className="field">
        <span className="field__label">Key</span>
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="home.hero.title" dir="ltr" />
      </label>
      <label className="field">
        <span className="field__label">Arabic text</span>
        <textarea value={ar} onChange={(e) => setAr(e.target.value)} dir="rtl" lang="ar" rows={3} />
      </label>
      <label className="field">
        <span className="field__label">English (optional)</span>
        <textarea value={en} onChange={(e) => setEn(e.target.value)} dir="ltr" lang="en" rows={3} />
      </label>
      <label className="check">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} disabled={en.trim() !== ''} />
        Translate to English automatically (saved as a machine draft for review)
      </label>
      {error && <p className="issue issue--error" role="alert">{error}</p>}
      <div className="editor__actions">
        <button type="submit" className="btn btn--primary">Add string</button>
        <button type="button" className="btn btn--ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

export function ImportPanel({ onDone }: { onDone(): void }) {
  const { importText, state } = useTranslations();
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const readFile = async (file: File | undefined) => {
    if (file) setText(await file.text());
  };

  const run = () => {
    const outcome = importText(text, replace ? 'replace' : 'merge');
    if (!outcome.ok) {
      setFeedback({ kind: 'error', text: outcome.error });
      return;
    }
    const { added, updated, unchanged, removed } = outcome.result;
    const parts = [`${added} added`, `${updated} updated`, `${unchanged} unchanged`];
    if (removed > 0) parts.push(`${removed} replaced`);
    if (outcome.skipped.length > 0) parts.push(`${outcome.skipped.length} skipped (${outcome.skipped.slice(0, 3).join('; ')}${outcome.skipped.length > 3 ? '…' : ''})`);
    setFeedback({ kind: 'ok', text: `Import finished: ${parts.join(', ')}.` });
    setText('');
  };

  return (
    <section className="panel" aria-label="Import translations">
      <h2>Import translations</h2>
      <p className="muted">
        Paste JSON or choose a file. Accepted: <code>{'{ "key": "Arabic text" }'}</code>, nested Laravel language
        files, or <code>{'{ "ar": {…}, "en": {…} }'}</code>. Imported English always starts as a draft.
      </p>
      <label className="field">
        <span className="field__label">File</span>
        <input type="file" accept=".json,application/json" onChange={(e) => void readFile(e.target.files?.[0])} />
      </label>
      <label className="field">
        <span className="field__label">JSON</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} dir="ltr" spellCheck={false} />
      </label>
      <label className="check">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        Replace everything ({state.items.length} current strings will be removed)
      </label>
      {feedback && <p className={`issue issue--${feedback.kind === 'ok' ? 'ok' : 'error'}`} role={feedback.kind === 'ok' ? 'status' : 'alert'}>{feedback.text}</p>}
      <div className="editor__actions">
        <button type="button" className="btn btn--primary" onClick={run} disabled={!text.trim()}>Import</button>
        <button type="button" className="btn btn--ghost" onClick={onDone}>Close</button>
      </div>
    </section>
  );
}

export function GlossaryPanel({ onDone }: { onDone(): void }) {
  const { state, setGlossary } = useTranslations();
  const [ar, setAr] = useState('');
  const [en, setEn] = useState('');
  const [note, setNote] = useState('');

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!ar.trim() || !en.trim()) return;
    const term: GlossaryTerm = { ar: ar.trim(), en: en.trim(), ...(note.trim() ? { note: note.trim() } : {}) };
    setGlossary([...state.glossary.filter((t) => t.ar !== term.ar), term]);
    setAr('');
    setEn('');
    setNote('');
  };

  return (
    <section className="panel" aria-label="Glossary">
      <h2>Glossary</h2>
      <p className="muted">When the Arabic contains a term, the English must contain its required translation. Mismatches block review.</p>
      {state.glossary.length === 0 ? (
        <p className="muted">No terms yet.</p>
      ) : (
        <ul className="terms">
          {state.glossary.map((t) => (
            <li key={t.ar}>
              <span dir="rtl" lang="ar">{t.ar}</span>
              <span aria-hidden="true">→</span>
              <strong>{t.en}</strong>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setGlossary(state.glossary.filter((x) => x.ar !== t.ar))} aria-label={`Remove ${t.ar}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="terms__form" onSubmit={add}>
        <label className="field"><span className="field__label">Arabic term</span><input value={ar} onChange={(e) => setAr(e.target.value)} dir="rtl" lang="ar" /></label>
        <label className="field"><span className="field__label">Required English</span><input value={en} onChange={(e) => setEn(e.target.value)} dir="ltr" /></label>
        <label className="field"><span className="field__label">Note (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button type="submit" className="btn btn--primary" disabled={!ar.trim() || !en.trim()}>Add term</button>
      </form>
      <div className="editor__actions"><button type="button" className="btn btn--ghost" onClick={onDone}>Close</button></div>
    </section>
  );
}
