import { PageLayout } from '../components/layout/PageLayout'
import { Alert } from '../components/ui/Alert'
import { Card } from '../components/ui/Card'
import { LinkButton } from '../components/ui/LinkButton'

type SectionPlaceholderPageProps = {
  title: string
  description: string
}

export function SectionPlaceholderPage({ title, description }: SectionPlaceholderPageProps) {
  return (
    <PageLayout eyebrow="TOPLULUK" title={title} description={description}>
      <Card className="max-w-2xl">
        <Alert variant="info" title="Bu bölüm hazırlanıyor">Bu hizmet henüz kullanıma açılmadı. Hazır olduğunda buradan ulaşabileceksin.</Alert>
        <LinkButton to="/" variant="secondary" className="mt-6">Ana sayfaya dön</LinkButton>
      </Card>
    </PageLayout>
  )
}
