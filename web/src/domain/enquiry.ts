export interface EnquiryDraft {
  name: string;
  email: string;
  phone: string;
  message: string;
  consent: boolean;
}
export type FieldErrors = Partial<Record<keyof EnquiryDraft, string>>;
export const emptyEnquiry: EnquiryDraft = {
  name: '',
  email: '',
  phone: '',
  message: '',
  consent: false,
};
export function normalizeEnquiry(draft: EnquiryDraft): EnquiryDraft {
  return {
    name: draft.name.trim(),
    email: draft.email.trim().toLowerCase(),
    phone: draft.phone.trim(),
    message: draft.message.replace(/\r\n?/g, '\n').trim(),
    consent: draft.consent,
  };
}
export function validateEnquiry(draft: EnquiryDraft): FieldErrors {
  const d = normalizeEnquiry(draft);
  const errors: FieldErrors = {};
  if (!d.name || d.name.length > 150) errors.name = 'Enter your name (up to 150 characters).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) || d.email.length > 255)
    errors.email = 'Enter a valid email address.';
  if (d.phone && !/^[0-9+() .-]{5,30}$/.test(d.phone))
    errors.phone = 'Enter a valid phone number or leave it blank.';
  if (!d.message || d.message.length > 5000)
    errors.message = 'Enter a message (up to 5,000 characters).';
  if (!d.consent) errors.consent = 'Please agree to be contacted about this property.';
  return errors;
}
/** Keep one UUID for an equivalent uncertain submission. Never persist customer data in browser storage. */
export class EnquiryAttempt {
  private previous = '';
  private id = '';
  constructor(private readonly uuid: () => string = () => crypto.randomUUID()) {}
  keyFor(draft: EnquiryDraft): string {
    const fingerprint = JSON.stringify(normalizeEnquiry(draft));
    if (fingerprint !== this.previous) {
      this.previous = fingerprint;
      this.id = this.uuid();
    }
    return this.id;
  }
}
