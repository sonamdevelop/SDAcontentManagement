import { CustomerError } from './api';
export function CustomerFailure({ error }: { error: unknown }) {
  return (
    <div role="alert">
      <p>
        {error instanceof TypeError
          ? 'Could not confirm the request. Please try again.'
          : error instanceof Error
            ? error.message
            : 'Could not confirm the request. Please try again.'}
      </p>
      {error instanceof CustomerError &&
        Object.entries(error.fields).map(([key, messages]) => (
          <p key={key}>
            {key.replaceAll('_', ' ')}: {messages.join(' ')}
          </p>
        ))}
    </div>
  );
}
