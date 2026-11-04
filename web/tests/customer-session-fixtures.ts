import type { CustomerSessionPage } from '../src/customer/sessions';
export const sessionPage: CustomerSessionPage = {
  data: [
    {
      id: 7,
      device_name: 'Customer web',
      created_at: '2026-11-01T10:00:00Z',
      last_used_at: '2026-11-04T10:00:00Z',
      expires_at: '2026-12-01T10:00:00Z',
      is_current: true,
    },
    {
      id: 8,
      device_name: 'My phone',
      created_at: '2026-11-02T10:00:00Z',
      last_used_at: null,
      expires_at: '2026-12-02T10:00:00Z',
      is_current: false,
    },
  ],
  meta: { current_page: 1, last_page: 1, total: 2 },
};
export const onlyCurrent = {
  data: [sessionPage.data[0]],
  meta: { current_page: 1, last_page: 1, total: 1 },
};
