import type { CSSProperties } from 'react';
const paths = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  search: 'm21 21-4.5-4.5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  bed: 'M3 18V7m18 11V9M3 14h18M3 9h8v5M11 9h10M3 18v3m18-3v3',
  bath: 'M3 13h18M5 13V5a3 3 0 0 1 6 0M5 13v4a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4v-4M8 21v2m8-2v2',
  area: 'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6M3 3l6 6m6 6 6 6',
  house: 'm3 10 9-7 9 7v11H3V10Zm6 11v-7h6v7',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'm5 5 14 14M5 19 19 5',
  check: 'm5 12 4 4L19 6',
  chevron: 'm9 5 7 7-7 7',
  mail: 'M3 5h18v14H3V5Zm0 0 9 8 9-8',
};
export function Icon({ name, style }: { name: keyof typeof paths; style?: CSSProperties }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
