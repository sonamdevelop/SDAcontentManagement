import { useCallback, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { publicApi } from '../api/client';
import { useResource } from '../api/useResource';
import { safePhotoUrl } from '../domain/property';
import { can, StaffApi, StaffError } from './api';
import { useAuth } from './session';
import { Failure, useMutation } from './StaffUi';
import { isStay, type Stay, type Room } from './stays';
type Content = {
  description: string | null;
  rules: string | null;
  amenities: string[] | null;
  images: string[] | null;
  is_published: boolean;
};
type ContentStay = Omit<Stay, 'rooms'> & Content & { rooms: (Room & Content)[] };
function isContent(v: unknown): v is Content {
  if (!v || typeof v !== 'object') return false;
  const c = v as Content;
  return (
    [c.description, c.rules].every((s) => s === null || typeof s === 'string') &&
    [c.amenities, c.images].every(
      (a) => a === null || (Array.isArray(a) && a.every((s) => typeof s === 'string')),
    ) &&
    typeof c.is_published === 'boolean' &&
    (c.images || []).every((p) =>
      /^stay-content\/(stays|rooms)\/[1-9]\d*\/[a-zA-Z0-9]+\.(jpg|jpeg|png|webp)$/.test(p),
    )
  );
}
export function contentForm(form: HTMLFormElement, existing: string[]) {
  const source = new FormData(form),
    body = new FormData(),
    remove = source.getAll('remove_images').map(String),
    photos = source.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  if (
    remove.some((p) => !existing.includes(p)) ||
    existing.length - remove.length + photos.length > 10
  )
    throw new Error('Choose up to 10 gallery photos.');
  if (
    photos.some(
      (f) =>
        f.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(f.type),
    )
  )
    throw new Error('Photos must be JPEG, PNG or WebP, up to 5 MB each.');
  body.set('description', String(source.get('description') || ''));
  body.set('rules', String(source.get('rules') || ''));
  body.set('is_published', source.has('is_published') ? '1' : '0');
  const amenities = String(source.get('amenities') || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    amenities.length > 30 ||
    new Set(amenities).size !== amenities.length ||
    amenities.some((s) => s.length > 80)
  )
    throw new Error('Use up to 30 distinct amenities, each up to 80 characters.');
  amenities.forEach((a, i) => body.append(`amenities[${i}]`, a));
  remove.forEach((a, i) => body.append(`remove_images[${i}]`, a));
  photos.forEach((f, i) => body.append(`photos[${i}]`, f));
  return body;
}
export function StayContentPage() {
  const { id = '' } = useParams(),
    { api, profile } = useAuth(),
    [params, setParams] = useSearchParams(),
    roomId = params.get('room_id') || '';
  const allowed = ['stays', 'stays.manage'].every((p) => can(profile, p));
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!allowed) return null;
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new StaffError(404);
      const result = await api.request<{ data: ContentStay }>(`/admin/stays/${id}/content`, {
        signal,
      });
      if (!isStay(result?.data) || !isContent(result.data) || !result.data.rooms.every(isContent))
        throw new StaffError(502);
      return result.data as ContentStay;
    },
    [api, allowed, id],
  );
  const result = useResource(id, load);
  if (!allowed) return <p role="alert">Stay content needs stay management permission.</p>;
  return (
    <>
      <h1>Stay public content</h1>
      <Link to="/staff/stays">Back to stays and rooms</Link>
      <p>
        Publish stay and room content separately. Both must be active and published to appear
        publicly. Photos are public marketing assets; use private document workflows for sensitive
        files.
      </p>
      {result.loading ? (
        <p role="status">Loading stay content…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry stay content</button>
        </>
      ) : result.data ? (
        <>
          <label>
            Content target
            <select
              aria-label="Content target"
              value={roomId}
              onChange={(e) => setParams(e.target.value ? { room_id: e.target.value } : {})}
            >
              <option value="">Stay · {result.data.name}</option>
              {result.data.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  Room · {r.name}
                </option>
              ))}
            </select>
          </label>
          <button onClick={result.retry}>Refresh stay content</button>
          {roomId && !result.data.rooms.some((r) => String(r.id) === roomId) ? (
            <p role="alert">Room not found in this stay.</p>
          ) : (
            <ContentEditor
              key={`${roomId}:${JSON.stringify(result.data)}`}
              api={api}
              stayId={id}
              roomId={roomId}
              content={
                roomId ? result.data.rooms.find((r) => String(r.id) === roomId)! : result.data
              }
              onSaved={result.retry}
            />
          )}
        </>
      ) : null}
    </>
  );
}
function ContentEditor({
  api,
  stayId,
  roomId,
  content,
  onSaved,
}: {
  api: StaffApi;
  stayId: string;
  roomId: string;
  content: Content & { name: string };
  onSaved: () => void;
}) {
  const mutation = useMutation();
  const path = useMemo(
    () => `/admin/stays/${stayId}${roomId ? `/rooms/${roomId}` : ''}/content`,
    [stayId, roomId],
  );
  return (
    <form
      className="staff-panel"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        void mutation.run(async () => {
          await api.request(path, {
            method: 'POST',
            body: contentForm(form, content.images || []),
          });
          if (mutation.isActive()) onSaved();
        }, '');
      }}
    >
      <h2>{content.name}</h2>
      <fieldset disabled={mutation.busy}>
        <label>
          Public description
          <textarea
            aria-label="Public description"
            name="description"
            maxLength={10000}
            rows={5}
            defaultValue={content.description || ''}
          />
        </label>
        <label>
          Public rules
          <textarea
            aria-label="Public rules"
            name="rules"
            maxLength={5000}
            rows={3}
            defaultValue={content.rules || ''}
          />
        </label>
        <label>
          Amenities (one per line)
          <textarea
            aria-label="Amenities (one per line)"
            name="amenities"
            rows={4}
            defaultValue={(content.amenities || []).join('\n')}
          />
        </label>
        <label className="staff-check">
          <input name="is_published" type="checkbox" defaultChecked={content.is_published} />
          Published in stay catalogue
        </label>
        <div className="stay-gallery">
          {(content.images || []).map((p) => (
            <label key={p}>
              <img
                src={safePhotoUrl('/storage/' + p, publicApi.baseUrl)!}
                alt={`${content.name} gallery photo`}
              />
              <input name="remove_images" type="checkbox" value={p} />
              Remove photo
            </label>
          ))}
        </div>
        <label>
          Add gallery photos
          <input name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" />
        </label>
        <p>
          Up to 10 photos, 5 MB each. If a save response is uncertain, refresh content before
          uploading again.
        </p>
        <button>{mutation.busy ? 'Saving content…' : 'Save public content'}</button>
      </fieldset>
      {mutation.error ? <Failure error={mutation.error} /> : null}
    </form>
  );
}
