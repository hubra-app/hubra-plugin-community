import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { IconAward, IconBulb, IconChecklist, IconPhoto } from '@tabler/icons-react'
import { Button, Paper, Text } from '@mantine/core'
import { ErrorBanner, LoadingSpinner, PageHead, Tabs, useModules, useT } from '@hubra/plugin-sdk'
import { QK, errorText, getOptions } from './api'
import { GalleryTab } from './GalleryTab'
import { HonoursTab } from './HonoursTab'
import { IdeasTab } from './IdeasTab'
import { WelcomeTab } from './WelcomeTab'

/** Community: photos, the idea box, honours, welcome. */
export function CommunityScreen() {
  const { t } = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const options = useQuery({ queryKey: QK.options, queryFn: getOptions })
  // Photo albums moved to Documents (Fotos); the gallery points there.
  const moved = useModules().has('documents')
  const part = location.pathname.split('/app/community')[1]?.replace(/^\//, '').split('/')[0] ?? ''
  const tabs = [
    { id: 'gallery', label: t('community.tabs.gallery'), icon: <IconPhoto size={16} /> },
    { id: 'ideas', label: t('community.tabs.ideas'), icon: <IconBulb size={16} /> },
    { id: 'honours', label: t('community.tabs.honours'), icon: <IconAward size={16} /> },
    { id: 'welcome', label: t('community.tabs.welcome'), icon: <IconChecklist size={16} /> },
  ]
  const active = tabs.find((tb) => tb.id === part)?.id ?? 'gallery'

  if (options.isLoading) return <LoadingSpinner />
  if (options.error || !options.data) return <ErrorBanner message={errorText(options.error)} onRetry={() => options.refetch()} />

  return (
    <>
      <PageHead title={t('community.title')} desc={t('community.desc')} />
      <Tabs tabs={tabs} activeTab={active} onTabChange={(id) => navigate(id === 'gallery' ? '/app/community' : `/app/community/${id}`)} />
      {active === 'gallery' &&
        (moved ? (
          <Paper withBorder p="lg" radius="md">
            <Text fw={600} mb={4}>
              {t('community.gallery.movedTitle')}
            </Text>
            <Text size="sm" c="dimmed" mb="md">
              {t('community.gallery.moved')}
            </Text>
            <Button onClick={() => navigate('/app/documents?view=photos')}>{t('community.gallery.openPhotos')}</Button>
          </Paper>
        ) : (
          <GalleryTab options={options.data} />
        ))}
      {active === 'ideas' && <IdeasTab options={options.data} />}
      {active === 'honours' && <HonoursTab options={options.data} />}
      {active === 'welcome' && <WelcomeTab options={options.data} />}
    </>
  )
}
