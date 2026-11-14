import { PageLayout } from '../components/layout/PageLayout'
import { Alert } from '../components/ui/Alert'
import { Card } from '../components/ui/Card'
import { LinkButton } from '../components/ui/LinkButton'
import { sections } from '../config/navigation'

export function HomePage() {
  return (
    <PageLayout eyebrow="İTÜ ÖĞRENCİ TOPLULUĞU" title="Birlikte daha kolay." description="Yolunu paylaş, bir yolculuğa destek ol, ev arkadaşını bul. İTÜ’lülerin birbirine yakın olduğu bir topluluk.">
      <section aria-labelledby="welcome-title" className="mb-10 grid overflow-hidden rounded-3xl bg-brand text-white md:grid-cols-[1.35fr_1fr]">
        <div className="p-7 sm:p-10">
          <p className="mb-5 text-xs font-semibold tracking-[0.16em] text-mint">AYNI KAMPÜS. ORTAK YOLLAR.</p>
          <h2 id="welcome-title" className="max-w-md text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">Paylaştıkça yol kısalır,<br />dayanışma büyür.</h2>
          <p className="mt-5 max-w-md leading-relaxed text-slate-200">İstanbul’dan başlayan veya İstanbul’a uzanan yolculuklarda bir İTÜ’lü sana eşlik etsin.</p>
          <LinkButton to="/yolculuklar" variant="secondary" className="mt-7 border-transparent">Yol arkadaşlığına göz at <span aria-hidden="true">↗</span></LinkButton>
        </div>
        <div aria-hidden="true" className="relative hidden min-h-72 items-center justify-center border-l border-white/10 bg-white/5 md:flex">
          <div className="absolute size-64 rounded-full border border-mint/20" />
          <div className="absolute size-44 rounded-full border border-mint/30" />
          <div className="relative rotate-[-12deg] rounded-2xl bg-mint px-9 py-7 text-brand shadow-lg">
            <p className="text-xs font-bold tracking-[0.2em]">BİRLİKTE</p>
            <p className="mt-2 text-5xl font-bold">İTÜ ↗</p>
            <div className="mt-5 border-t border-brand/25 pt-3 text-sm font-medium">Yolumuz ortak.</div>
          </div>
        </div>
      </section>
      <section aria-labelledby="discover-title">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="discover-title" className="text-xl font-bold text-ink sm:text-2xl">Topluluğu keşfet</h2>
          <p className="text-sm text-muted">Kampüsün ötesinde de bir aradayız.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sections.map((section) => (
            <Card key={section.path} className="flex flex-col items-start">
              <span aria-hidden="true" className={`mb-6 flex size-11 items-center justify-center rounded-xl text-2xl ${section.accent}`}>{section.symbol}</span>
              <h3 className="text-lg font-bold text-ink">{section.title}</h3>
              <p className="mt-3 mb-5 text-sm leading-relaxed text-muted">{section.description}</p>
              <LinkButton to={section.path} variant="ghost" className="mt-auto -ml-3 px-3" aria-label={`${section.title} bölümünü keşfet`}>Keşfet <span aria-hidden="true">→</span></LinkButton>
            </Card>
          ))}
        </div>
      </section>
      <div className="mt-7">
        <Alert variant="info" title="İTÜ’lüler için ortak bir alan">Platformdaki hizmetler, e-posta adresi doğrulanmış @itu.edu.tr hesaplarına yöneliktir. Bölümler şu anda hazırlanıyor.</Alert>
      </div>
    </PageLayout>
  )
}
