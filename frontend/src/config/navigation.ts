import type { ComponentType } from 'react'
import { TripsPage } from '../features/trips/TripsPage'
import { HousingPage } from '../features/housing/HousingPage'
import { ForumPage } from '../features/forum/ForumPage'
import { ProfilePage } from '../features/profiles/ProfilePage'

type Section = { path: string; title: string; description: string; symbol: string; accent: string; page?: ComponentType }
export const sections: Section[] = [
  {
    path: '/yolculuklar',
    page: TripsPage,
    title: 'Yol arkadaşlığı',
    description: 'İstanbul’a giden ya da İstanbul’dan yola çıkan İTÜ’lülerle yolunu paylaş.',
    symbol: '↗',
    accent: 'bg-emerald-100 text-emerald-900',
  },
  {
    path: '/askida-bilet',
    title: 'Askıda bilet',
    description: 'Bir öğrencinin yolculuğuna anonim olarak destek ol. Dayanışma yola çıksın.',
    symbol: '♡',
    accent: 'bg-amber-100 text-amber-900',
  },
  {
    path: '/barinma',
    page: HousingPage,
    title: 'Ev ve oda arkadaşı',
    description: 'İstanbul’da bir oda veya aynı evi paylaşacağın bir İTÜ’lü bul.',
    symbol: '⌂',
    accent: 'bg-sky-100 text-sky-900',
  },
  {
    path: '/forum',
    page: ForumPage,
    title: 'Öğrenci forumu',
    description: 'Derslerden kampüs yaşamına, sorularını ve bildiklerini toplulukla paylaş.',
    symbol: '☰',
    accent: 'bg-violet-100 text-violet-900',
  },
  {
    path: '/profil',
    page: ProfilePage,
    title: 'Profilim',
    description: 'Profilini düzenle, yolculuk geçmişini ve değerlendirmelerini gör.',
    symbol: '◎',
    accent: 'bg-slate-100 text-slate-900',
  },
]
