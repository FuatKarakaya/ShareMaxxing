import { BrowserRouter, Route, Routes } from 'react-router-dom';

function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          İTÜ ShareMaxxing
        </h1>
        <p className="mt-2 text-base text-slate-600">
          Doğrulanmış İTÜ öğrencileri için şehirlerarası yolculuk paylaşımı, askıda bilet,
          ev/oda arkadaşı ilanları ve öğrenci forumu.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Yolculuk Paylaşımı</h2>
          <p className="mt-1 text-sm text-slate-600">
            İstanbul çıkışlı veya varışlı şehirlerarası yolculukları arayın ya da ilan açın.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Askıda Bilet</h2>
          <p className="mt-1 text-sm text-slate-600">
            İhtiyaç sahibi öğrencilerin yolculuk taleplerini anonim olarak destekleyin.
          </p>
        </div>
      </section>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Sayfa bulunamadı</h1>
      <p className="mt-2 text-sm text-slate-600">Aradığınız sayfa mevcut değil.</p>
    </main>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </BrowserRouter>
  );
}
