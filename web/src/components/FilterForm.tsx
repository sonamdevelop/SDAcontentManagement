import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { filterError, type Filters } from '../domain/filters';
import { label, PROPERTY_TYPES } from '../domain/property';
import { Icon } from './Icon';
export function FilterForm({
  filters,
  apply,
}: {
  filters: Filters;
  apply: (filters: Filters) => void;
}) {
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(filters);
    setError(null);
  }, [filters]);
  const change = (key: keyof Filters, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  function submit(event: FormEvent) {
    event.preventDefault();
    const error = filterError(draft);
    setError(error);
    if (!error) apply({ ...draft, page: 1 });
  }
  return (
    <form className="filter-form" aria-label="Filter properties" onSubmit={submit}>
      <div className="filter-grid">
        <label className="search-field">
          Search properties
          <input
            name="q"
            type="search"
            maxLength={255}
            value={draft.q}
            onChange={(e) => change('q', e.target.value)}
            placeholder="A name, neighbourhood or keyword"
          />
        </label>
        <label>
          City
          <input
            name="city"
            maxLength={100}
            value={draft.city}
            onChange={(e) => change('city', e.target.value)}
            placeholder="Any city"
          />
        </label>
        <label>
          Looking to
          <select
            name="purpose"
            value={draft.purpose}
            onChange={(e) => change('purpose', e.target.value)}
          >
            <option value="">Buy or rent</option>
            <option value="sale">Buy a property</option>
            <option value="rent">Rent a property</option>
          </select>
        </label>
        <label className="type-field">
          Property type
          <select
            name="property_type"
            value={draft.property_type}
            onChange={(e) => change('property_type', e.target.value)}
          >
            <option value="">All types</option>
            {PROPERTY_TYPES.map((t) => (
              <option value={t} key={t}>
                {label(t)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Minimum price
          <input
            name="min_price"
            inputMode="decimal"
            value={draft.min_price}
            onChange={(e) => change('min_price', e.target.value)}
            placeholder="No minimum"
            aria-describedby={error ? 'filter-error' : undefined}
          />
        </label>
        <label>
          Maximum price
          <input
            name="max_price"
            inputMode="decimal"
            value={draft.max_price}
            onChange={(e) => change('max_price', e.target.value)}
            placeholder="No maximum"
            aria-describedby={error ? 'filter-error' : undefined}
          />
        </label>
        <div className="filter-actions">
          <button className="button primary" type="submit">
            <Icon name="search" />
            Find properties
          </button>
          <Link className="text-link" to="/properties">
            Reset filters
          </Link>
        </div>
      </div>
      {error && (
        <p id="filter-error" role="alert" className="field-error">
          {error}
        </p>
      )}
    </form>
  );
}
