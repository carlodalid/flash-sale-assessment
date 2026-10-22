import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ProductCard } from './components/ProductCard';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="page">
      <ProductCard />
    </main>
  </StrictMode>,
);
