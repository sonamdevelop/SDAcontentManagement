import { readFileSync } from 'node:fs';
export async function capturedMailLink(
  email: string,
  purpose: 'verify' | 'reset' | 'change-email',
) {
  const file = process.env.SDA_ACCEPTANCE_MAIL_LOG || '';
  if (!/\/\.runtime\/acceptance\/[0-9a-f]+-mail\.log$/.test(file))
    throw new Error('Isolated acceptance mail capture is required.');
  for (let i = 0; i < 40; i++) {
    try {
      // Laravel log transport renders the HTML body directly; do not decode literal token hex as MIME escapes.
      const text = readFileSync(file, 'utf8');
      const links = [...text.matchAll(/href="([^"\n]+)"/g)].map((m) =>
        m[1].replaceAll('&amp;', '&'),
      );
      const found = links.reverse().find((link) => {
        try {
          const u = new URL(link);
          return (
            u.origin === 'http://127.0.0.1:5174' &&
            u.pathname === '/account/' + purpose &&
            new URLSearchParams(u.hash.slice(1)).get('email') === email &&
            /^[a-f0-9]{64}$/.test(new URLSearchParams(u.hash.slice(1)).get('token') || '')
          );
        } catch {
          return false;
        }
      });
      if (found) return found;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Expected synthetic email was not captured.');
}
