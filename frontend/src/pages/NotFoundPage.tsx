import { PageLayout } from '../components/layout/PageLayout'
import { Alert } from '../components/ui/Alert'
import { Card } from '../components/ui/Card'
import { LinkButton } from '../components/ui/LinkButton'

export function NotFoundPage() {
  return (
    <PageLayout eyebrow="404" title="Sayfa bulunamadı" description="Aradığın sayfanın adresi değişmiş veya bağlantı hatalı olabilir.">
      <Card className="max-w-2xl">
        <Alert variant="error" title="Bu adreste bir sayfa yok">Ana sayfadan devam ederek aradığın bölüme ulaşabilirsin.</Alert>
        <LinkButton to="/" className="mt-6">Ana sayfaya dön</LinkButton>
      </Card>
    </PageLayout>
  )
}
