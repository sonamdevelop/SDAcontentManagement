import { useEffect, useRef, useState } from 'react';
import { StaffError, type Page } from './api';
export function Failure({ error }: { error: unknown }) {
  return (
    <div role="alert">
      <p>
        {error instanceof StaffError
          ? error.message
          : error instanceof TypeError
            ? 'Could not confirm the request. Refresh the current page before retrying a save.'
            : error instanceof Error
              ? error.message
              : 'Could not confirm the request. Refresh the current page before retrying a save.'}
      </p>
      {error instanceof StaffError &&
        Object.entries(error.fields).map(([name, messages]) => (
          <p key={name}>
            {name}: {messages.join(' ')}
          </p>
        ))}
    </div>
  );
}
export function Pagination({
  meta,
  onPage,
}: {
  meta: Page<unknown>['meta'];
  onPage: (page: number) => void;
}) {
  return (
    <div className="staff-paging">
      <button
        type="button"
        disabled={meta.current_page <= 1}
        onClick={() => onPage(meta.current_page - 1)}
      >
        Previous
      </button>
      <span>
        Page {meta.current_page} of {meta.last_page} · {meta.total} records
      </span>
      <button
        type="button"
        disabled={meta.current_page >= meta.last_page}
        onClick={() => onPage(meta.current_page + 1)}
      >
        Next
      </button>
    </div>
  );
}
// Ignore late responses after navigation and prevent repeated mutation submissions.
export function useMutation() {
  const active = useRef(true),
    pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [success, setSuccess] = useState('');
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function run(work: () => Promise<void>, message: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    setSuccess('');
    try {
      await work();
      if (active.current) setSuccess(message);
    } catch (e) {
      if (active.current) setError(e);
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return { busy, error, success, run, isActive: () => active.current };
}
