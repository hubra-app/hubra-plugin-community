import { registerPlugin } from '@hubra/plugin-sdk'
import { IconUsersGroup } from '@tabler/icons-react'
import { AlbumScreen } from './AlbumScreen'
import { CommunityScreen } from './CommunityScreen'
import { WelcomeCard } from './WelcomeCard'
import translations from './translations.json'

registerPlugin({
  id: 'community',
  routes: [
    { path: 'community', module: 'community', component: CommunityScreen },
    { path: 'community/skills', module: 'community', component: CommunityScreen },
    { path: 'community/ideas', module: 'community', component: CommunityScreen },
    { path: 'community/honours', module: 'community', component: CommunityScreen },
    { path: 'community/welcome', module: 'community', component: CommunityScreen },
    { path: 'community/albums/:id', module: 'community', component: AlbumScreen },
  ],
  slots: [{ slot: 'account.cards', module: 'community', component: WelcomeCard }],
  // The nav entry in hubra_community/__init__.py names this icon.
  icons: { 'users-group': IconUsersGroup },
  translations,
})
