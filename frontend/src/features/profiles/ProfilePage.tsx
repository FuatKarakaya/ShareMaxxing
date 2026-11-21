import { useState } from 'react'
import { Route, Routes, useParams } from 'react-router-dom'
import { PageLayout } from '../../components/layout/PageLayout'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Form } from '../../components/ui/Form'
import { Input, Textarea } from '../../components/ui/FormControls'
import { NotFoundPage } from '../../pages/NotFoundPage'
import { ResourceState } from '../content/ContentControls'
import { StudentSignIn } from '../content/StudentSignIn'
import { useAction, useResource } from '../content/hooks'
import { clearStudentSession, contentRequest, updateStudentName, useStudentSession } from '../content/session'

type ProfileFields = { id: string; displayName: string; bio: string | null }
type Profile = ProfileFields & {
  ridesAsDriver: number
  ridesAsPassenger: number
  ratingCount: number
  averageRating: number | null
  recentRatings: { score: number; review: string | null }[]
}

function ProfileEditor({ profile, onSave }: { profile: ProfileFields; onSave: (fields: ProfileFields) => void }) {
  const [name, setName] = useState(profile.displayName)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [saved, setSaved] = useState(false)
  const action = useAction()
  return <Form aria-label="Profili düzenle" onChange={() => setSaved(false)} onSubmit={event => {
    event.preventDefault()
    setSaved(false)
    void action.run(async () => {
      const result = await contentRequest<{ profile: ProfileFields }>('/profiles/me', {
        method: 'PATCH', body: JSON.stringify({ displayName: name, bio }),
      })
      setName(result.profile.displayName)
      setBio(result.profile.bio ?? '')
      updateStudentName(result.profile.id, result.profile.displayName)
      onSave(result.profile)
      setSaved(true)
    })
  }}>
    <Input label="Görünen ad" value={name} onChange={e => setName(e.target.value)} required maxLength={100} disabled={action.busy} />
    <Textarea label="Hakkımda" value={bio} onChange={e => setBio(e.target.value)} maxLength={500} disabled={action.busy} />
    <Button type="submit" loading={action.busy}>Değişiklikleri kaydet</Button>
    {action.error && <p role="alert">{action.error}</p>}
    {saved && <p role="status">Profiliniz kaydedildi.</p>}
  </Form>
}

function ProfileDetails({ id, own }: { id: string; own: boolean }) {
  const resource = useResource<{ profile: Profile }>(`/profiles/${encodeURIComponent(id)}`)
  const [edits, setEdits] = useState<ProfileFields | null>(null)
  const profile = resource.data && { ...resource.data.profile, ...edits }
  return <PageLayout title={own ? 'Profilim' : 'Öğrenci profili'}>
    <ResourceState {...resource} />
    {profile && <div className="max-w-2xl space-y-5 break-words">
      <Card>
        <h2 className="mb-3 text-2xl font-bold">{profile.displayName}</h2>
        {own ? <ProfileEditor profile={profile} onSave={setEdits} /> :
          profile.bio && <p className="whitespace-pre-wrap">{profile.bio}</p>}
      </Card>
      <Card>
        <h2 className="mb-3 text-xl font-bold">Tamamlanan yolculuklar</h2>
        <p>Sürücü olarak: {profile.ridesAsDriver}</p>
        <p>Yolcu olarak: {profile.ridesAsPassenger}</p>
      </Card>
      <Card>
        <h2 className="mb-3 text-xl font-bold">Değerlendirmeler</h2>
        {profile.averageRating === null ? <p>Henüz yayımlanmış değerlendirme yok.</p> :
          <p>{profile.averageRating.toLocaleString('tr-TR')} / 5 · {profile.ratingCount} değerlendirme</p>}
        <ul className="divide-y divide-line">{profile.recentRatings.map((rating, index) =>
          <li className="py-2" key={index}><strong>{rating.score} / 5</strong>
            {rating.review && <p className="whitespace-pre-wrap">{rating.review}</p>}
          </li>)}</ul>
      </Card>
      {own && <Button variant="secondary" onClick={clearStudentSession}>Çıkış yap</Button>}
    </div>}
  </PageLayout>
}

function ProfileRoute() {
  const session = useStudentSession()
  const { id } = useParams()
  if (!session) return <PageLayout title={id ? 'Öğrenci profili' : 'Profilim'}><StudentSignIn /></PageLayout>
  const profileId = id ?? session.user.id
  return <ProfileDetails key={profileId} id={profileId} own={profileId === session.user.id} />
}

export function ProfilePage() {
  return <Routes>
    <Route index element={<ProfileRoute />} />
    <Route path=":id" element={<ProfileRoute />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
}
