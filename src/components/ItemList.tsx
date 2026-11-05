import type { TranslationItem } from '../domain';
import { StatusBadge } from './StatusBadge';

interface Props {
  items: readonly TranslationItem[];
  selectedId: string | null;
  onSelect(id: string): void;
}

export function ItemList({ items, selectedId, onSelect }: Props) {
  if (items.length === 0) {
    return <p className="empty" role="status">No translations match these filters.</p>;
  }
  return (
    <ul className="list" aria-label="Translations">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="list__item"
            aria-current={item.id === selectedId ? 'true' : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span className="list__top">
              <code>{item.id}</code>
              <StatusBadge status={item.status} />
            </span>
            <span className="list__ar" dir="rtl" lang="ar">{item.ar}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
