export type CustomerSession = {
  id: number;
  device_name: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_current: boolean;
};
export type CustomerSessionPage = {
  data: CustomerSession[];
  meta: { current_page: number; last_page: number; total: number };
};
const positive = (n: unknown) => Number.isSafeInteger(n) && Number(n) > 0;
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
export function isCustomerSession(value: unknown): value is CustomerSession {
  if (!value || typeof value !== 'object') return false;
  const r = value as CustomerSession;
  return (
    positive(r.id) &&
    typeof r.device_name === 'string' &&
    Array.from(r.device_name).length <= 100 &&
    typeof r.is_current === 'boolean' &&
    date(r.created_at) &&
    (r.last_used_at === null ||
      (date(r.last_used_at) && Date.parse(r.last_used_at) >= Date.parse(r.created_at))) &&
    (r.expires_at === null ||
      (date(r.expires_at) && Date.parse(r.expires_at) > Date.parse(r.created_at)))
  );
}
export function isCustomerSessionPage(value: unknown, page: number): value is CustomerSessionPage {
  const r = value as CustomerSessionPage;
  return (
    !!r &&
    Array.isArray(r.data) &&
    r.data.every(isCustomerSession) &&
    new Set(r.data.map((r) => r.id)).size === r.data.length &&
    !!r.meta &&
    r.meta.current_page === page &&
    positive(r.meta.last_page) &&
    positive(r.meta.total) &&
    r.meta.total >= r.data.length &&
    r.data.filter((r) => r.is_current).length === (page === 1 ? 1 : 0)
  );
}
