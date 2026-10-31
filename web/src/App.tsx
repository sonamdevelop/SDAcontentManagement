import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CatalogPage } from './pages/CatalogPage';
import { DetailPage } from './pages/DetailPage';
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/properties" replace />} />
        <Route path="properties" element={<CatalogPage />} />
        <Route path="properties/:id" element={<DetailPage />} />
        <Route
          path="*"
          element={
            <div className="container empty-state">
              <h1>Page not found.</h1>
              <p>Let’s help you find a place instead.</p>
              <Link className="button primary" to="/properties">
                Explore properties
              </Link>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
