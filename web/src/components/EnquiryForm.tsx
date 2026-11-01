import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, publicApi } from '../api/client';
import {
  emptyEnquiry,
  EnquiryAttempt,
  normalizeEnquiry,
  validateEnquiry,
  type EnquiryDraft,
  type FieldErrors,
} from '../domain/enquiry';
import { Icon } from './Icon';
export function EnquiryForm({ propertyId }: { propertyId: number }) {
  const [draft, setDraft] = useState<EnquiryDraft>({ ...emptyEnquiry });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [retryUntil, setRetryUntil] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const attempt = useRef(new EnquiryAttempt());
  const request = useRef<AbortController | null>(null);
  const success = useRef<HTMLHeadingElement>(null);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (sent) success.current?.focus();
  }, [sent]);
  useEffect(() => {
    if (retryUntil <= Date.now()) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.min(1000, retryUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [retryUntil, clock]);
  const wait = Math.max(0, Math.ceil((retryUntil - clock) / 1000));
  const update = (key: keyof EnquiryDraft, value: string | boolean) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || unavailable || wait) return;
    const issues = validateEnquiry(draft);
    setErrors(issues);
    setMessage('');
    if (Object.keys(issues).length) {
      document.getElementById(`enquiry-${Object.keys(issues)[0]}`)?.focus();
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    try {
      await publicApi.enquire(
        propertyId,
        normalizeEnquiry(draft),
        attempt.current.keyFor(draft),
        controller.signal,
      );
      if (!controller.signal.aborted) setSent(true);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 422) {
        setErrors(error.fields);
        setMessage('Please check the details below and try again.');
      } else if (error instanceof ApiError && error.status === 404) {
        setUnavailable(true);
        setMessage(
          'This property is no longer accepting enquiries. Please explore another property.',
        );
      } else if (error instanceof ApiError && error.status === 429) {
        const now = Date.now();
        setClock(now);
        setRetryUntil(now + (error.retryAfter ?? 30) * 1000);
        setMessage('Please wait a moment before sending again. Your details are still here.');
      } else {
        setMessage('We couldn’t send your enquiry. Your details are still here—please try again.');
      }
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }
  if (sent)
    return (
      <div className="enquiry-success" role="status">
        <span className="success-icon">
          <Icon name="check" />
        </span>
        <h2 ref={success} tabIndex={-1}>
          Enquiry sent.
        </h2>
        <p>
          Thank you for getting in touch. The property team can contact you using the details you
          shared.
        </p>
      </div>
    );
  const field = (
    name: 'name' | 'email' | 'phone',
    title: string,
    type: string,
    maxLength: number,
    autoComplete: string,
  ) => (
    <div className="form-field">
      <label htmlFor={`enquiry-${name}`}>{title}</label>
      <input
        id={`enquiry-${name}`}
        name={name}
        type={type}
        required={name !== 'phone'}
        autoComplete={autoComplete}
        maxLength={maxLength}
        value={draft[name]}
        onChange={(e) => update(name, e.target.value)}
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `error-${name}` : undefined}
      />
      {errors[name] && (
        <span className="field-error" id={`error-${name}`}>
          {errors[name]}
        </span>
      )}
    </div>
  );
  return (
    <section className="enquiry-panel" aria-labelledby="enquiry-heading">
      <p className="eyebrow">LET’S TALK</p>
      <h2 id="enquiry-heading">Interested in this place?</h2>
      <p>Share your details and ask the property team a question.</p>
      <form onSubmit={submit} noValidate aria-busy={pending}>
        <fieldset disabled={pending || unavailable}>
          {field('name', 'Your name *', 'text', 150, 'name')}
          {field('email', 'Email address *', 'email', 255, 'email')}
          {field('phone', 'Phone number (optional)', 'tel', 30, 'tel')}
          <div className="form-field">
            <label htmlFor="enquiry-message">Your message *</label>
            <textarea
              id="enquiry-message"
              name="message"
              required
              rows={4}
              maxLength={5000}
              placeholder="What would you like to know?"
              value={draft.message}
              onChange={(e) => update('message', e.target.value)}
              aria-invalid={!!errors.message}
              aria-describedby={errors.message ? 'error-message' : undefined}
            />
            {errors.message && (
              <span className="field-error" id="error-message">
                {errors.message}
              </span>
            )}
          </div>
          <div>
            <label className="consent-label">
              <input
                id="enquiry-consent"
                name="consent"
                type="checkbox"
                required
                checked={draft.consent}
                onChange={(e) => update('consent', e.target.checked)}
                aria-invalid={!!errors.consent}
                aria-describedby={errors.consent ? 'error-consent' : undefined}
              />
              <span>I agree to be contacted about this property using the details above. *</span>
            </label>
            {errors.consent && (
              <span className="field-error" id="error-consent">
                {errors.consent}
              </span>
            )}
          </div>
          <button
            className="button primary enquiry-submit"
            type="submit"
            disabled={pending || wait > 0}
          >
            <Icon name="mail" />
            {pending ? 'Sending…' : wait ? `Try again in ${wait}s` : 'Send enquiry'}
          </button>
        </fieldset>
        {message && (
          <p role="alert" className="form-message">
            {message}
          </p>
        )}
        <p className="form-footnote">Fields marked * are required.</p>
      </form>
    </section>
  );
}
