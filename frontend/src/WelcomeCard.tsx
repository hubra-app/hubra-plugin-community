import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Anchor, Group, Paper, Text } from '@mantine/core'
import { IconChecklist } from '@tabler/icons-react'
import { useT } from '@hubra/plugin-sdk'
import { QK, getWelcome } from './api'
import { Checklist } from './WelcomeTab'

/** On a new member's own page: the welcome checklist until it is done. */
export function WelcomeCard() {
  const { t } = useT()
  const navigate = useNavigate()
  const welcome = useQuery({ queryKey: QK.welcome, queryFn: getWelcome })
  if (!welcome.data?.show) return null
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <IconChecklist size={22} />
          <Text fw={600}>{t('community.welcome.cardTitle')}</Text>
        </Group>
        <Anchor component="button" size="sm" onClick={() => navigate('/app/community/welcome')}>
          {t('community.welcome.open')}
        </Anchor>
      </Group>
      <Checklist welcome={welcome.data} compact />
    </Paper>
  )
}
