import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../src/App';

describe('AppRoutes', () => {
  it('renders the Turkish home page shell on /', () => {
    render(
      <MemoryRouter
        initialEntries={['/']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'İTÜ ShareMaxxing' })).toBeInTheDocument();
    expect(screen.getByText('Yolculuk Paylaşımı')).toBeInTheDocument();
    expect(screen.getByText('Askıda Bilet')).toBeInTheDocument();
  });

  it('renders the 404 fallback on unknown routes', () => {
    render(
      <MemoryRouter
        initialEntries={['/olmayan-sayfa']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Sayfa bulunamadı' })).toBeInTheDocument();
  });
});
