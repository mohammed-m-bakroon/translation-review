import { STATUSES, groupsOf } from '../domain';
import type { Filters, Status, TranslationItem } from '../domain';

interface Props {
  items: readonly TranslationItem[];
  filters: Filters;
  onChange(patch: Partial<Filters>): void;
}

export function FilterBar({ items, filters, onChange }: Props) {
  return (
    <div className="filters" role="search">
      <label className="field">
        <span className="field__label">Search</span>
        <input
          type="search"
          value={filters.query}
          placeholder="Key, Arabic or English…"
          onChange={(e) => onChange({ query: e.target.value })}
        />
      </label>
      <label className="field">
        <span className="field__label">Status</span>
        <select value={filters.status} onChange={(e) => onChange({ status: e.target.value as Status | 'all' })}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Section</span>
        <select value={filters.group} onChange={(e) => onChange({ group: e.target.value })}>
          <option value="all">All sections</option>
          {groupsOf(items).map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>
    </div>
  );
}
