import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { can } from './api';
import { Failure, Pagination, useMutation } from './StaffUi';
import {
  formatLeadValue,
  dueTimestamp,
  LeadApi,
  localDateInput,
  type FollowUp,
  type LeadDetail,
} from './leads';
import { useAuth } from './session';
function useLeadApi() {
  const { api } = useAuth();
  return useMemo(() => new LeadApi(api), [api]);
}
export function LeadPage() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const api = useLeadApi();
  const allowed = can(profile, 'leads.view');
  const load = useCallback(
    (signal: AbortSignal) => (allowed ? api.detail(id, signal) : Promise.resolve(null)),
    [api, id, allowed],
  );
  const result = useResource(id, load);
  if (!allowed) return <p role="alert">You do not have permission to view this lead.</p>;
  return (
    <>
      <Link to="/staff/leads">← Leads</Link>
      {result.loading ? (
        <p role="status">Loading lead…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry lead</button>
        </>
      ) : result.data ? (
        <LeadContent key={id} initial={result.data} />
      ) : null}
    </>
  );
}
function LeadContent({ initial }: { initial: LeadDetail }) {
  const [lead, setLead] = useState(initial);
  const { profile } = useAuth();
  return (
    <>
      <h1>{lead.title}</h1>
      {can(profile, 'visits') && (
        <p>
          <Link to={`/staff/site-visits?lead_id=${lead.id}`}>View site visits for this lead</Link>
        </p>
      )}
      <section className="staff-panel">
        <h2>Lead details</h2>
        <p>
          {formatLeadValue(lead.lead_value, lead.currency)} · {lead.stage?.name || 'No stage'} ·{' '}
          {lead.agent?.name || 'Unassigned'}
        </p>
        <p>Pipeline: {lead.pipeline?.name || 'Not assigned'}</p>
        {lead.expected_close_date && <p>Expected close: {lead.expected_close_date}</p>}
        {lead.closed_at && <p>Closed: {lead.closed_at}</p>}
        {lead.lost_reason && <p>Lost reason: {lead.lost_reason}</p>}
        <p className="staff-message">{lead.description || 'No description'}</p>
        {lead.contact ? (
          <>
            <h3>Contact</h3>
            <p>{lead.contact.name}</p>
            {lead.contact.emails.map((email, i) => (
              <p key={i}>{email.value}</p>
            ))}
            {lead.contact.contact_numbers.map((phone, i) => (
              <p key={i}>{phone.value}</p>
            ))}
          </>
        ) : (
          <p>No linked contact</p>
        )}
      </section>
      <div className="staff-lead-actions">
        {can(profile, 'leads.assign') && <Assignment lead={lead} onUpdate={setLead} />}{' '}
        {can(profile, 'leads.edit') &&
          (can(profile, 'leads') ? (
            <StageEditor lead={lead} onUpdate={setLead} />
          ) : (
            <p>Stage choices require lead-list permission.</p>
          ))}
      </div>
      <Activities leadId={lead.id} />
    </>
  );
}
function Assignment({
  lead,
  onUpdate,
}: {
  lead: LeadDetail;
  onUpdate: (lead: LeadDetail) => void;
}) {
  const api = useLeadApi();
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState('');
  const load = useCallback((signal: AbortSignal) => api.assignees(page, signal), [api, page]);
  const result = useResource(String(page), load);
  const mutation = useMutation();
  return (
    <section className="staff-panel">
      <h2>Assign agent</h2>
      <p>
        Current: {lead.agent?.name || 'Unassigned'}. Only eligible agents in your visibility scope
        are listed.
      </p>
      {result.loading ? (
        <p role="status">Loading agents…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry agents</button>
        </>
      ) : result.data ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void mutation.run(async () => {
                const saved = await api.update(lead.id, 'assignment', {
                  user_id: Number(selected),
                });
                if (mutation.isActive()) onUpdate(saved);
              }, 'Agent assignment saved.');
            }}
          >
            <fieldset disabled={mutation.busy}>
              <label>
                New agent
                <select required value={selected} onChange={(e) => setSelected(e.target.value)}>
                  <option value="">Choose agent</option>
                  {result.data.data.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={!selected || mutation.busy}>Save assignment</button>
            </fieldset>
          </form>
          <Pagination
            meta={result.data.meta}
            onPage={(n) => {
              setSelected('');
              setPage(n);
            }}
          />
        </>
      ) : null}
      {mutation.error ? <Failure error={mutation.error} /> : null}
      {mutation.success && <p role="status">{mutation.success}</p>}
    </section>
  );
}
function StageEditor({
  lead,
  onUpdate,
}: {
  lead: LeadDetail;
  onUpdate: (lead: LeadDetail) => void;
}) {
  const api = useLeadApi();
  const load = useCallback((signal: AbortSignal) => api.pipelines(signal), [api]);
  const result = useResource('pipelines', load);
  const [selected, setSelected] = useState(''),
    [reason, setReason] = useState(lead.lost_reason || '');
  const mutation = useMutation();
  const pipeline = result.data?.find((p) => p.id === lead.pipeline?.id);
  const target = pipeline?.stages.find((s) => s.id === Number(selected));
  return (
    <section className="staff-panel">
      <h2>Update stage</h2>
      <p>Choose a stage in the current pipeline. Moving to another pipeline is not supported.</p>
      {result.loading ? (
        <p role="status">Loading stages…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry stages</button>
        </>
      ) : pipeline ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void mutation.run(async () => {
              const saved = await api.update(lead.id, 'stage', {
                lead_pipeline_stage_id: Number(selected),
                ...(target?.code === 'lost' ? { lost_reason: reason.trim() } : {}),
              });
              if (mutation.isActive()) onUpdate(saved);
            }, 'Lead stage saved.');
          }}
        >
          <fieldset disabled={mutation.busy}>
            <label>
              New stage
              <select required value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">Choose stage</option>
                {pipeline.stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </label>
            {target?.code === 'lost' && (
              <label>
                Lost reason
                <textarea
                  required
                  maxLength={5000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            <button disabled={!target || mutation.busy}>Save stage</button>
          </fieldset>
        </form>
      ) : (
        <p>No stages are available for this lead’s pipeline.</p>
      )}
      {mutation.error ? <Failure error={mutation.error} /> : null}
      {mutation.success && <p role="status">{mutation.success}</p>}
    </section>
  );
}
export function FollowUpQueue() {
  const { profile } = useAuth();
  return (
    <>
      <h1>Follow-up queue</h1>
      <p>Dated tasks are reminders in this workspace. Email and push notifications are not sent.</p>
      {can(profile, 'leads.view') ? (
        <Activities />
      ) : (
        <p role="alert">You do not have permission to view follow-ups.</p>
      )}
    </>
  );
}
function Activities({ leadId }: { leadId?: number }) {
  const api = useLeadApi();
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const [editing, setEditing] = useState<FollowUp | null>(null);
  const load = useCallback(
    (signal: AbortSignal) => api.followUps(new URLSearchParams(query), leadId, signal),
    [api, query, leadId],
  );
  const result = useResource(`${leadId || 'all'}:${query}`, load);
  const editable = !!leadId && can(profile, 'leads.edit');
  const refresh = () => {
    setEditing(null);
    result.retry();
  };
  return (
    <section className="staff-activities">
      <h2>{leadId ? 'Notes & follow-ups' : 'Visible notes & tasks'}</h2>
      {editable && (
        <ActivityForm
          key={editing?.id || 'new'}
          leadId={leadId!}
          activity={editing}
          onSaved={refresh}
          onCancel={() => setEditing(null)}
        />
      )}
      <form
        className="staff-filters"
        key={query}
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const next = new URLSearchParams();
          for (const key of ['type', 'status', 'overdue']) {
            const value = String(form.get(key) || '');
            if (value) next.set(key, value);
          }
          setParams(next);
        }}
      >
        <label>
          Activity type
          <select name="type" defaultValue={params.get('type') || ''}>
            <option value="">Notes and tasks</option>
            <option value="note">Notes</option>
            <option value="task">Tasks</option>
          </select>
        </label>
        <label>
          Activity status
          <select name="status" defaultValue={params.get('status') || ''}>
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="done">Done</option>
          </select>
        </label>
        <label className="staff-check">
          <input
            type="checkbox"
            name="overdue"
            value="1"
            defaultChecked={params.get('overdue') === '1'}
          />
          Overdue tasks only
        </label>
        <button>Filter activities</button>
      </form>
      <button onClick={result.retry}>Refresh activities</button>
      {result.loading ? (
        <p role="status">Loading activities…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry activities</button>
        </>
      ) : result.data ? (
        <>
          <div className="staff-records">
            {result.data.data.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                editable={editable}
                onEdit={() => setEditing(activity)}
                onSaved={refresh}
                leadId={leadId}
              />
            ))}
            {!result.data.data.length && <p>No matching notes or tasks.</p>}
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
    </section>
  );
}
function ActivityCard({
  activity,
  editable,
  onEdit,
  onSaved,
  leadId,
}: {
  activity: FollowUp;
  editable: boolean;
  onEdit: () => void;
  onSaved: () => void;
  leadId?: number;
}) {
  const api = useLeadApi();
  const mutation = useMutation();
  return (
    <article className="staff-panel">
      <h3>{activity.type === 'note' ? 'Note' : activity.title || 'Task'}</h3>
      <p className="staff-message">{activity.comment}</p>
      {activity.type === 'task' && (
        <p>
          {activity.is_done ? 'Done' : activity.is_overdue ? 'Overdue' : 'Pending'} ·{' '}
          {activity.due_at ? new Date(activity.due_at).toLocaleString() : 'No due date'}
        </p>
      )}
      {!leadId && (
        <p>
          {activity.lead_ids.map((id) => (
            <Link className="staff-related-lead" key={id} to={`/staff/leads/${id}`}>
              Open lead #{id}
            </Link>
          ))}
        </p>
      )}
      {editable && (
        <div className="staff-paging">
          <button onClick={onEdit}>Edit {activity.type}</button>
          {activity.type === 'task' && (
            <button
              disabled={mutation.busy}
              onClick={() =>
                void mutation.run(async () => {
                  await api.saveFollowUp(leadId!, { is_done: !activity.is_done }, activity.id);
                  if (mutation.isActive()) onSaved();
                }, 'Task updated.')
              }
            >
              {activity.is_done ? 'Mark pending' : 'Mark done'}
            </button>
          )}
        </div>
      )}
      {mutation.error ? <Failure error={mutation.error} /> : null}
    </article>
  );
}
function ActivityForm({
  leadId,
  activity,
  onSaved,
  onCancel,
}: {
  leadId: number;
  activity: FollowUp | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const api = useLeadApi();
  const [type, setType] = useState<'note' | 'task'>(activity?.type || 'note'),
    [title, setTitle] = useState(activity?.title || ''),
    [comment, setComment] = useState(activity?.comment || ''),
    [due, setDue] = useState(localDateInput(activity?.due_at || null));
  const [saved, setSaved] = useState('');
  const mutation = useMutation();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaved('');
    await mutation.run(async () => {
      const data: Record<string, unknown> = {
        ...(!activity ? { type } : {}),
        ...(type === 'note'
          ? { comment: comment.trim() }
          : {
              title: title.trim(),
              due_at: dueTimestamp(due),
              ...(comment.trim() || activity?.comment ? { comment: comment.trim() } : {}),
            }),
      };
      await api.saveFollowUp(leadId, data, activity?.id);
      if (mutation.isActive()) {
        if (!activity) {
          setTitle('');
          setComment('');
          setDue('');
          setSaved(type === 'note' ? 'Note added.' : 'Follow-up added.');
        }
        onSaved();
      }
    }, '');
  }
  return (
    <form className="staff-panel staff-activity-form" onSubmit={submit}>
      <h3>{activity ? `Edit ${type}` : 'Add note or follow-up'}</h3>
      <fieldset disabled={mutation.busy}>
        {!activity && (
          <label>
            New activity type
            <select value={type} onChange={(e) => setType(e.target.value as 'note' | 'task')}>
              <option value="note">Note</option>
              <option value="task">Follow-up task</option>
            </select>
          </label>
        )}
        {type === 'task' && (
          <>
            <label>
              Task title
              <input
                required
                maxLength={255}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Due date and time
              <input
                type="datetime-local"
                step="1"
                required
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            <p>
              Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Saved as an exact
              instant.
            </p>
          </>
        )}
        <label>
          {type === 'note' ? 'Note text' : 'Task notes (optional)'}
          <textarea
            required={type === 'note'}
            minLength={type === 'note' ? 1 : undefined}
            maxLength={10000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        <button disabled={mutation.busy}>
          {mutation.busy
            ? 'Saving…'
            : activity
              ? 'Save activity'
              : type === 'note'
                ? 'Add note'
                : 'Add follow-up'}
        </button>
        {activity && (
          <button type="button" onClick={onCancel}>
            Cancel edit
          </button>
        )}
      </fieldset>
      {mutation.error ? <Failure error={mutation.error} /> : null}
      {saved && <p role="status">{saved}</p>}
    </form>
  );
}
