import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from 'react';

import { ApiError } from './api';
import type { Pagination as PaginationType } from './domain';

export function humanize(value: string) {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Short, stable labels for operational statuses. */
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  PENDING_APPROVAL: 'Pending',
  SUSPENDED: 'Suspended',
  REJECTED: 'Rejected',
  APPROVED: 'Approved',
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  READY: 'Ready',
  PICKED_UP: 'On delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  CANCELLATION_IN_PROGRESS: 'Refunding',
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  PAUSED: 'Paused',
  EXPIRED: 'Expired',
  ARCHIVED: 'Archived',
  OPEN: 'Open',
  CLOSED: 'Closed',
};

const STATUS_TONES: Record<string, 'positive' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'positive',
  APPROVED: 'positive',
  DELIVERED: 'positive',
  CONFIRMED: 'positive',
  OPEN: 'positive',
  PENDING_APPROVAL: 'warning',
  PENDING: 'warning',
  PREPARING: 'warning',
  READY: 'warning',
  PICKED_UP: 'warning',
  SCHEDULED: 'warning',
  PAUSED: 'warning',
  CANCELLATION_IN_PROGRESS: 'warning',
  SUSPENDED: 'danger',
  REJECTED: 'danger',
  CANCELLED: 'danger',
  ARCHIVED: 'danger',
  EXPIRED: 'danger',
  CLOSED: 'neutral',
  DRAFT: 'neutral',
};

export function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? humanize(status);
}

export function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? 'neutral';
  return <span className={`status status--${tone}`}>{statusLabel(status)}</span>;
}

export function StatusSelect({
  disabled,
  label = 'Set status',
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label?: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  value: string;
}) {
  return (
    <label className="status-select">
      <span className="sr-only">{label}</span>
      <select
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          if (next && next !== value) onChange(next);
          event.target.value = value;
        }}
        value={value}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? '—'
    : new Intl.DateTimeFormat('en-AE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? '—'
    : new Intl.DateTimeFormat('en-AE', {
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
      }).format(date);
}

export function formatCurrency(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('en-AE', {
    currency: 'AED',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function fullName(person: {
  firstName: string;
  lastName: string;
}) {
  return `${person.firstName} ${person.lastName}`.trim() || 'Unnamed account';
}

export function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function LoadingPanel({ label = 'Loading data…' }: { label?: string }) {
  return (
    <div className="state-panel" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorPanel({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <span className="state-panel__icon" aria-hidden="true">!</span>
      <div>
        <strong>Unable to load this data</strong>
        <p>{getErrorMessage(error)}</p>
      </div>
      <button className="button button--secondary" onClick={onRetry} type="button">
        Try again
      </button>
    </div>
  );
}

export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">⌁</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

export function Pagination({
  pagination,
  onPageChange,
}: {
  pagination: PaginationType;
  onPageChange: (page: number) => void;
}) {
  if (pagination.totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <span>{pagination.total.toLocaleString()} total</span>
      <div>
        <button
          className="icon-button"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
          type="button"
          aria-label="Previous page">
          ←
        </button>
        <span className="pagination__page">Page {pagination.page} of {pagination.totalPages}</span>
        <button
          className="icon-button"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
          type="button"
          aria-label="Next page">
          →
        </button>
      </div>
    </nav>
  );
}

export function Notice({
  type,
  children,
  onDismiss,
}: {
  type: 'success' | 'error';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className={`notice notice--${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span aria-hidden="true">{type === 'success' ? '✓' : '!'}</span>
      <p>{children}</p>
      {onDismiss ? <button aria-label="Dismiss message" onClick={onDismiss} type="button">×</button> : null}
    </div>
  );
}

export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`modal${wide ? ' modal--wide' : ''}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog">
        <div className="modal__header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button aria-label="Close dialog" className="icon-button" onClick={onClose} type="button">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function ActionDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Enter a clear operational reason',
  reasonRequired = false,
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonRequired?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const reasonId = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (reasonRequired && !trimmedReason) {
      setError('A reason is required for this action.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(trimmedReason);
    } catch (submissionError) {
      setError(getErrorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal description={description} onClose={submitting ? () => undefined : onClose} title={title}>
      <form className="modal__form" onSubmit={submit}>
        {children}
        {reasonRequired || reasonPlaceholder ? (
          <label className="field" htmlFor={reasonId}>
            <span>
              {reasonLabel}
              {reasonRequired ? ' *' : ''}
            </span>
            <textarea
              autoFocus={reasonRequired}
              disabled={submitting}
              id={reasonId}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              value={reason}
            />
          </label>
        ) : null}
        {error ? <Notice type="error">{error}</Notice> : null}
        <div className="modal__actions">
          <button className="button button--secondary" disabled={submitting} onClick={onClose} type="button">
            Cancel
          </button>
          <button className={`button ${danger ? 'button--danger' : 'button--primary'}`} disabled={submitting} type="submit">
            {submitting ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
