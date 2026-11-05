import { STATUSES, summarize } from '../domain';
import type { TranslationItem } from '../domain';

export function StatsBar({ items }: { items: readonly TranslationItem[] }) {
  const { total, counts, approvedPercent } = summarize(items);
  return (
    <section className="stats" aria-label="Progress">
      <div className="stats__head">
        <strong>{approvedPercent}% approved</strong>
        <span>{counts.approved} of {total} strings</span>
      </div>
      <div
        className="stats__bar"
        role="progressbar"
        aria-valuenow={approvedPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Approved translations"
      >
        {STATUSES.map((s) => (
          <span key={s} className={`stats__seg stats__seg--${s}`} style={{ width: `${total ? (counts[s] / total) * 100 : 0}%` }} />
        ))}
      </div>
      <ul className="stats__legend">
        {STATUSES.map((s) => (
          <li key={s}><span className={`dot dot--${s}`} aria-hidden="true" />{s}: {counts[s]}</li>
        ))}
      </ul>
    </section>
  );
}
