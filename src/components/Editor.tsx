import { useState } from 'react';
import { allowedTransitions, hasErrors, validate } from '../domain';
import type { GlossaryTerm, Status, TransitionResult, TranslationItem } from '../domain';
import { StatusBadge } from './StatusBadge';
import { useReview } from './useReview';
import { useTranslations } from '../state/TranslationProvider';

interface Props {
  item: TranslationItem;
  glossary: readonly GlossaryTerm[];
  onSave(id: string, en: string): void;
  onMove(id: string, to: Status): TransitionResult;
  onDelete(id: string): void;
}

const ACTION_LABEL: Partial<Record<Status, string>> = {
  reviewed: 'Mark as reviewed',
  approved: 'Approve',
  draft: 'Send back to draft',
};

/** Render with `key={item.id}` so the draft resets when another item is selected. */
export function Editor({ item, glossary, onSave, onMove, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  const { service, reviewDelayMs, translateItem, state } = useTranslations();
  const [draft, setDraft] = useState(item.en);
  const [prevEn, setPrevEn] = useState(item.en);
  const [translateError, setTranslateError] = useState<string | null>(null);
  // When the saved English changes from outside (auto-translate), follow it unless the user has typed.
  if (item.en !== prevEn) {
    setPrevEn(item.en);
    if (draft === prevEn) setDraft(item.en);
  }
  const translating = state.translating.includes(item.id);
  const review = useReview(service, item.ar, draft, glossary, reviewDelayMs);
  const [message, setMessage] = useState<string | null>(null);

  const dirty = draft !== item.en;
  const issues = validate(item.ar, draft, glossary);
  const blocked = hasErrors(issues);

  const save = () => {
    if (!dirty) return;
    onSave(item.id, draft);
    setMessage(null);
  };

  const autoTranslate = async () => {
    setTranslateError(null);
    if (item.en.trim() !== '' || dirty) {
      // Overwriting existing English is a deliberate act: ask the service directly and put the result in the box.
      try {
        setDraft(await service.translate(item.ar, glossary));
      } catch (e) {
        setTranslateError(e instanceof Error ? e.message : 'Translation failed.');
      }
      return;
    }
    setTranslateError(await translateItem(item.id));
  };

  const move = (to: Status) => {
    const result = onMove(item.id, to);
    setMessage(result.ok ? null : result.reason);
  };

  return (
    <section className="editor" aria-label={`Edit ${item.id}`}>
      <header className="editor__head">
        <div>
          <h2><code>{item.id}</code></h2>
          <p className="muted">Section: {item.group}</p>
        </div>
        <StatusBadge status={item.status} />
      </header>

      <div className="editor__panes">
        <div className="pane">
          <span className="pane__label" id="ar-label">Arabic (source)</span>
          <p className="pane__ar" dir="rtl" lang="ar" aria-labelledby="ar-label">{item.ar}</p>
        </div>
        <div className="pane">
          <label className="pane__label" htmlFor="en-input">English</label>
          <textarea
            id="en-input"
            dir="ltr"
            lang="en"
            rows={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                save();
              }
            }}
            aria-describedby="issues"
            aria-invalid={blocked}
          />
          <span className="hint">Ctrl/Cmd + Enter to save</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void autoTranslate()} disabled={translating}>
            {translating ? 'Translating…' : 'Auto-translate'}
          </button>
        </div>
      </div>

      {item.machine && (
        <p className="issue issue--warning">Machine draft: a person must read and confirm this before it is approved. Editing it marks it as human-checked.</p>
      )}
      {translateError && <p className="issue issue--error" role="alert">{translateError}</p>}

      <div className="review" aria-live="polite" aria-label="Meaning check">
        <span className="review__label">Meaning check · {service.label}</span>
        {review.kind === 'checking' && <p className="muted">Checking the meaning…</p>}
        {review.kind === 'error' && <p className="issue issue--warning">Could not check the meaning: {review.message}</p>}
        {review.kind === 'done' && (
          <div className={`issue issue--${review.result.verdict === 'correct' ? 'ok' : review.result.verdict === 'problem' ? 'error' : 'warning'}`}>
            <strong>{review.result.verdict === 'correct' ? 'Looks accurate.' : review.result.verdict === 'problem' ? 'Possible mistake.' : 'Not sure.'}</strong>{' '}
            {review.result.summary}
            {review.result.suggestion && review.result.suggestion !== draft && (
              <>
                <br />
                Suggested: <q dir="ltr">{review.result.suggestion}</q>{' '}
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDraft(review.result.suggestion ?? draft)}>Use suggestion</button>
              </>
            )}
          </div>
        )}
        {review.kind === 'done' && <p className="hint">This check is advice, not a guarantee. A person still decides.</p>}
      </div>

      <div id="issues" aria-live="polite" className="issues">
        {issues.length === 0 && draft.trim() !== '' && <p className="issue issue--ok">No automatic rule problems.</p>}
        {issues.map((issue, i) => (
          <p key={`${issue.code}-${i}`} className={`issue issue--${issue.severity}`}>
            <strong>{issue.severity === 'error' ? 'Error' : 'Warning'}:</strong> {issue.message}
          </p>
        ))}
      </div>

      {message && <p className="issue issue--error" role="alert">{message}</p>}

      <footer className="editor__actions">
        <button type="button" className="btn btn--primary" onClick={save} disabled={!dirty}>
          Save changes
        </button>
        {allowedTransitions(item.status).map((to) => (
          <button
            key={to}
            type="button"
            className={`btn ${to === 'draft' ? 'btn--ghost' : ''}`}
            onClick={() => move(to)}
            disabled={dirty}
            title={dirty ? 'Save your changes first' : undefined}
          >
            {ACTION_LABEL[to]}
          </button>
        ))}
        <span className="spacer" />
        {confirming ? (
          <>
            <button type="button" className="btn btn--danger" onClick={() => onDelete(item.id)}>Confirm delete</button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>Keep</button>
          </>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={() => setConfirming(true)}>Delete</button>
        )}
      </footer>
    </section>
  );
}
