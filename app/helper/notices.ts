// System notices: the one line of news in the top bar. The first entry is
// the one shown; closing it hides it for a day, and a new notice (put it at
// the top, with a new id) shows again for everyone at once.
import {playUrl} from '~/helper/play'

export interface SystemNotice {
  id: string
  icon?: string
  iconColor?: string
  /** i18n keys */
  text: string
  cta?: string
  href?: string
}

export const SYSTEM_NOTICES: SystemNotice[] = [
  {
    id: 'android-launch',
    icon: 'icon-android',
    iconColor: '#3ddc84',
    text: 'c_AndroidApp.news',
    cta: 'c_AndroidApp.freeDownload',
    href: playUrl('topbar'),
  },
]
