import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { label } from '../domain/property';
import { can } from './api';
import {
  attachmentName,
  DocumentApi,
  documentForm,
  DOCUMENT_CATEGORIES,
  type PropertyDocument,
} from './documents';
import { useAuth } from './session';
import { Failure, Pagination, useMutation } from './StaffUi';
function useDocuments() {
  const { api } = useAuth();
  return useMemo(() => new DocumentApi(api), [api]);
}
export function DocumentPage() {
  const { id = '' } = useParams();
  const { api, profile } = useAuth();
  const propertyId = Number(id);
  const allowed =
    /^[1-9]\d*$/.test(id) &&
    can(profile, 'properties') &&
    (can(profile, 'properties.documents') || can(profile, 'properties.documents.create'));
  const load = useCallback(
    (signal: AbortSignal) => (allowed ? api.property(id, signal) : Promise.resolve(null)),
    [allowed, api, id],
  );
  const result = useResource(id, load);
  if (!allowed)
    return <p role="alert">You do not have permission to manage these property documents.</p>;
  return (
    <>
      <Link to="/staff/properties">← Properties</Link>
      <h1>Private property documents</h1>
      {result.loading ? (
        <p role="status">Loading property…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry property</button>
        </>
      ) : result.data ? (
        <>
          <h2>{result.data.title}</h2>
          <DocumentManager key={id} propertyId={propertyId} />
        </>
      ) : null}
    </>
  );
}
function DocumentManager({ propertyId }: { propertyId: number }) {
  const api = useDocuments();
  const { profile } = useAuth();
  const readable = can(profile, 'properties.documents');
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const [notice, setNotice] = useState('');
  const load = useCallback(
    (signal: AbortSignal) =>
      readable ? api.list(propertyId, new URLSearchParams(query), signal) : Promise.resolve(null),
    [api, propertyId, query, readable],
  );
  const result = useResource(`${propertyId}:${query}`, load);
  const refresh = (message: string) => {
    setNotice(message);
    if (message === 'Document deleted.' && params.has('page')) {
      const next = new URLSearchParams(params);
      next.delete('page');
      setParams(next);
    }
    result.retry();
  };
  return (
    <>
      <p>
        PDF, JPEG or PNG, up to 10 MB each and 50 files per property. Documents are private and are
        separate from public property photos.
      </p>
      {can(profile, 'properties.documents.create') && (
        <UploadDocument propertyId={propertyId} onSaved={() => refresh('Document uploaded.')} />
      )}{' '}
      {notice && <p role="status">{notice}</p>}
      {!readable ? (
        <p>
          You can upload documents, but your account does not have permission to list or download
          them.
        </p>
      ) : (
        <>
          <form
            className="staff-filters"
            key={query}
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget),
                next = new URLSearchParams();
              const category = String(form.get('category') || '');
              if (category) next.set('category', category);
              setParams(next);
            }}
          >
            <label>
              Document category
              <select name="category" defaultValue={params.get('category') || ''}>
                <option value="">All categories</option>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {label(c)}
                  </option>
                ))}
              </select>
            </label>
            <button>Filter documents</button>
          </form>
          <button onClick={() => result.retry()}>Refresh documents</button>
          {result.loading ? (
            <p role="status">Loading documents…</p>
          ) : result.error ? (
            <>
              <Failure error={result.error} />
              <button onClick={result.retry}>Retry documents</button>
            </>
          ) : result.data ? (
            <>
              <div className="staff-records staff-document-records">
                {result.data.data.map((document) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    deletable={can(profile, 'properties.documents.delete')}
                    onDeleted={() => refresh('Document deleted.')}
                  />
                ))}
                {!result.data.data.length && <p>No matching documents.</p>}
              </div>
              <Pagination
                meta={result.data.meta}
                onPage={(page) => {
                  const next = new URLSearchParams(params);
                  next.set('page', String(page));
                  setParams(next);
                }}
              />
            </>
          ) : null}
        </>
      )}
    </>
  );
}
function UploadDocument({ propertyId, onSaved }: { propertyId: number; onSaved: () => void }) {
  const api = useDocuments();
  const [title, setTitle] = useState(''),
    [category, setCategory] = useState('other'),
    [description, setDescription] = useState(''),
    [file, setFile] = useState<File | null>(null),
    [inputKey, setInputKey] = useState(0);
  const mutation = useMutation();
  async function submit(event: FormEvent) {
    event.preventDefault();
    void mutation.run(async () => {
      await api.upload(propertyId, documentForm(title, category, description, file));
      if (mutation.isActive()) {
        setTitle('');
        setDescription('');
        setFile(null);
        setInputKey((v) => v + 1);
        onSaved();
      }
    }, '');
  }
  return (
    <form className="staff-panel staff-document-upload" onSubmit={submit}>
      <h3>Upload document</h3>
      <fieldset className="staff-visit-fieldset" disabled={mutation.busy}>
        <label>
          Document title
          <input
            required
            maxLength={150}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Upload category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Document description (optional)
          <textarea
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Document file
          <input
            key={inputKey}
            type="file"
            required
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <button disabled={mutation.busy}>{mutation.busy ? 'Uploading…' : 'Upload document'}</button>
      </fieldset>
      {mutation.error ? <Failure error={mutation.error} /> : null}
    </form>
  );
}
function DocumentCard({
  document: record,
  deletable,
  onDeleted,
}: {
  document: PropertyDocument;
  deletable: boolean;
  onDeleted: () => void;
}) {
  const api = useDocuments();
  const [confirming, setConfirming] = useState(false),
    [downloading, setDownloading] = useState(false),
    [downloadError, setDownloadError] = useState<unknown>();
  const downloadController = useRef<AbortController | null>(null);
  const urls = useRef(new Map<string, number>());
  const mounted = useRef(true);
  const mutation = useMutation();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      downloadController.current?.abort();
      for (const [url, timer] of urls.current) {
        window.clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      urls.current.clear();
    };
  }, []);
  async function download() {
    if (downloadController.current) return;
    const controller = new AbortController();
    downloadController.current = controller;
    setDownloading(true);
    setDownloadError(undefined);
    try {
      const blob = await api.download(record, controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = attachmentName(record.original_name, record.mime_type);
      window.document.body.append(anchor);
      anchor.click();
      anchor.remove();
      const timer = window.setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.current.delete(url);
      }, 1000);
      urls.current.set(url, timer);
    } catch (error) {
      if (!controller.signal.aborted && mounted.current) setDownloadError(error);
    } finally {
      downloadController.current = null;
      if (mounted.current) setDownloading(false);
    }
  }
  return (
    <article className="staff-panel">
      <h3>{record.title}</h3>
      <p>
        {label(record.category)} · {record.original_name} ·{' '}
        {record.size_bytes < 1024
          ? `${record.size_bytes} B`
          : `${(record.size_bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`}
      </p>
      {record.description && <p className="staff-message">{record.description}</p>}
      <p>
        {record.created_at
          ? new Date(record.created_at).toLocaleString()
          : 'Upload date unavailable'}
      </p>
      <div className="staff-paging">
        <button disabled={downloading || mutation.busy} onClick={download}>
          {downloading ? 'Downloading…' : 'Download document'}
        </button>
        {deletable && !confirming && (
          <button disabled={mutation.busy || downloading} onClick={() => setConfirming(true)}>
            Delete document
          </button>
        )}
      </div>
      {downloadError ? <Failure error={downloadError} /> : null}
      {deletable && confirming && (
        <div className="staff-document-confirm">
          <p>Delete “{record.title}”? The stored file will be removed permanently.</p>
          <button
            disabled={mutation.busy || downloading}
            onClick={() =>
              void mutation.run(async () => {
                await api.remove(record.property_id, record.id);
                if (mutation.isActive()) onDeleted();
              }, '')
            }
          >
            {mutation.busy ? 'Deleting…' : 'Confirm deletion'}
          </button>
          <button disabled={mutation.busy} onClick={() => setConfirming(false)}>
            Keep document
          </button>
        </div>
      )}
      {mutation.error ? <Failure error={mutation.error} /> : null}
    </article>
  );
}
