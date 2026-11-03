import type { StayStatement } from '../src/staff/statement';
import { finance, opening } from './payment-fixtures';
export const statement: StayStatement = {
  generated_at: '2030-01-02T10:00:00Z',
  booking: {
    id: 51,
    room_type_id: 2,
    stay_name: 'River stay',
    room_name: 'Deluxe',
    guest_name: 'Statement guest',
    timezone: 'Asia/Kolkata',
    check_in: '2030-01-01',
    check_out: '2030-01-03',
    rooms: 2,
    guests: 4,
    nightly_rate: '1000.25',
  },
  summary: finance,
  entries: [
    {
      id: opening.id,
      kind: opening.kind,
      amount: opening.amount,
      method: opening.method,
      created_at: opening.created_at,
      reversal_of: null,
      reversed_by: null,
      effective: true,
    },
  ],
};
