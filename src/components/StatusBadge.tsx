import type { Status } from '../domain';

const LABEL: Record<Status, string> = { missing: 'Missing', draft: 'Draft', reviewed: 'Reviewed', approved: 'Approved' };

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge--${status}`}>{LABEL[status]}</span>;
}
