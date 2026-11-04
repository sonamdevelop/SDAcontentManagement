import type { PublicStay } from '../src/api/stay-catalogue';
import { stay } from './stay-fixtures';
export const publicStay: PublicStay = {
  id: 1,
  name: 'River stay',
  city: 'Dandeli',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  description: 'A quiet riverside retreat',
  rules: 'No smoking',
  amenities: ['Parking', 'Wi-Fi'],
  photos: [],
  room_types_count: 1,
  from_rate: '1000.25',
  rooms: [
    {
      id: 2,
      name: 'Deluxe',
      description: 'Forest view',
      rules: 'Quiet hours after 10 pm',
      amenities: ['Air conditioning'],
      photos: [],
      capacity: 2,
      nightly_rate: '1000.25',
    },
  ],
};
export const editableStay = {
  ...stay,
  description: publicStay.description,
  rules: publicStay.rules,
  amenities: publicStay.amenities,
  images: [],
  is_published: false,
  rooms: stay.rooms.map((r) => ({
    ...r,
    description: 'Forest view',
    rules: 'Quiet hours',
    amenities: ['Air conditioning'],
    images: [],
    is_published: false,
  })),
};
