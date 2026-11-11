import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, Group, Paper, Select, SimpleGrid, Stack, Table, Text } from '@mantine/core'
import { IconAward, IconCake, IconExternalLink, IconStar } from '@tabler/icons-react'
import { EmptyState, ErrorBanner, LoadingSpinner, useT } from '@hubra/plugin-sdk'
import { QK, fmtDate, errorText, listHonours, listJubilees, setHonourTier, settleLegacyHonours, type Honours, type Options } from './api'
import { useAction, useLocale } from './common'

/** Honorary members (a membership tier) for everyone; coming jubilees and
 *  the choice of tier for whoever keeps honours. */
export function HonoursTab({ options }: { options: Options }) {
  const { t } = useT()
  const locale = useLocale()
  const navigate = useNavigate()
  const manage = options.can.honours
  const honours = useQuery({ queryKey: QK.honours, queryFn: listHonours })
  const jubilees = useQuery({ queryKey: QK.jubilees, queryFn: () => listJubilees(90), enabled: manage })

  if (honours.error) return <ErrorBanner message={errorText(honours.error)} onRetry={() => honours.refetch()} />
  if (honours.isLoading || !honours.data) return <LoadingSpinner />
  const data = honours.data
  const list = data.members

  return (
    <Stack gap="xl">
      {manage && (
        <section>
          <Text fw={700} mb={4}>
            {t('community.honours.jubilees')}
          </Text>
          <Text size="sm" c="dimmed" mb="sm">
            {t('community.honours.jubileesHint')}
          </Text>
          {jubilees.isLoading ? (
            <LoadingSpinner />
          ) : !jubilees.data?.length ? (
            <Text size="sm" c="dimmed">
              {t('community.honours.noJubilees')}
            </Text>
          ) : (
            <Paper withBorder radius="md" style={{ overflowX: 'auto' }}>
              <Table verticalSpacing="xs" horizontalSpacing="md">
                <Table.Tbody>
                  {jubilees.data.map((j) => (
                    <Table.Tr key={`${j.memberId}-${j.kind}`}>
                      <Table.Td w={130} style={{ whiteSpace: 'nowrap' }}>
                        {fmtDate(j.date, locale, false)}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          {j.name}
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>
                        <Group gap={6} wrap="nowrap">
                          {j.kind === 'member' ? <IconStar size={16} color="var(--mantine-color-yellow-filled)" /> : <IconCake size={16} color="var(--mantine-color-pink-filled)" />}
                          <Text size="sm">
                            {j.kind === 'member' ? t('community.honours.yearsMember', { count: j.years }) : t('community.honours.turns', { count: j.years })}
                          </Text>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}
        </section>
      )}
      <section>
        <Group justify="space-between" mb="sm" wrap="wrap" gap="sm">
          <Group gap="xs">
            <Text fw={700}>{t('community.honours.title')}</Text>
            {data.tier && (
              <Badge size="sm" variant="light" color="yellow" style={{ textTransform: 'none' }}>
                {data.tier.name}
              </Badge>
            )}
          </Group>
          {manage && data.tier && (
            <Button size="sm" variant="default" leftSection={<IconExternalLink size={16} />} onClick={() => navigate(`/app/members/tiers/${data.tier!.id}`)}>
              {t('community.honours.openTier')}
            </Button>
          )}
        </Group>
        {manage && <TierPicker data={data} />}
        {!list.length ? (
          <EmptyState
            icon={<IconAward size={28} />}
            title={t('community.honours.none')}
            description={manage ? t(data.tier ? 'community.honours.noneHint' : 'community.honours.noTierHint') : undefined}
          />
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
            {list.map((h) => (
              <Paper key={h.memberId} withBorder radius="md" p="md">
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                  <IconAward size={26} color="var(--mantine-color-yellow-filled)" style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <Text fw={700} truncate>
                      {h.name}
                    </Text>
                    {h.since && (
                      <Text size="xs" c="dimmed">
                        {t('community.honours.memberSince', { date: fmtDate(h.since, locale) })}
                      </Text>
                    )}
                  </div>
                </Group>
              </Paper>
            ))}
          </SimpleGrid>
        )}
      </section>
      {manage && !!data.legacy?.length && <LegacyHonours data={data} />}
    </Stack>
  )
}

/** Which tier holds the honorary members. */
function TierPicker({ data }: { data: Honours }) {
  const { t } = useT()
  const qc = useQueryClient()
  const { busy, run } = useAction()
  const choose = async (value: string | null) => {
    let fresh: Honours | undefined
    if (await run(async () => (fresh = await setHonourTier(value ? Number(value) : null)), t('community.saved'))) {
      qc.setQueryData(QK.honours, fresh)
    }
  }
  return (
    <Paper withBorder radius="md" p="md" mb="sm">
      <Select
        label={t('community.honours.tier')}
        description={t(data.canSetTier ? 'community.honours.tierHint' : 'community.honours.tierNeedsMembers')}
        placeholder={t('community.honours.pickTier')}
        data={(data.tiers ?? []).map((tier) => ({
          value: String(tier.id),
          label: t('community.honours.tierOption', { name: tier.name, count: tier.members }),
        }))}
        value={data.tier ? String(data.tier.id) : null}
        onChange={choose}
        disabled={busy || !data.canSetTier}
        clearable
        searchable
        maw={420}
      />
    </Paper>
  )
}

/** Honours kept with 1.0: move those members onto the tier, or drop them. */
function LegacyHonours({ data }: { data: Honours }) {
  const { t } = useT()
  const locale = useLocale()
  const qc = useQueryClient()
  const { busy, run } = useAction()
  const legacy = data.legacy ?? []
  const settle = async (action: 'move' | 'discard') => {
    let fresh: Honours | undefined
    if (await run(async () => (fresh = await settleLegacyHonours(action)), t('community.saved'))) {
      qc.setQueryData(QK.honours, fresh)
    }
  }
  return (
    <section>
      <Alert color="yellow" variant="light" title={t('community.honours.legacyTitle')} mb="sm">
        <Text size="sm">{t(data.tier ? 'community.honours.legacyHint' : 'community.honours.legacyNoTier', { tier: data.tier?.name })}</Text>
        <Group gap="xs" mt="sm">
          <Button size="xs" onClick={() => settle('move')} loading={busy} disabled={!data.tier || !data.canSetTier}>
            {t('community.honours.legacyMove', { count: legacy.length })}
          </Button>
          <Button size="xs" variant="subtle" color="red" onClick={() => settle('discard')} loading={busy}>
            {t('community.honours.legacyDiscard')}
          </Button>
        </Group>
      </Alert>
      <Paper withBorder radius="md" style={{ overflowX: 'auto' }}>
        <Table verticalSpacing="xs" horizontalSpacing="md">
          <Table.Tbody>
            {legacy.map((h) => (
              <Table.Tr key={h.id}>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    {h.name}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{h.title}</Text>
                </Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  <Text size="sm" c="dimmed">
                    {h.awardedOn ? fmtDate(h.awardedOn, locale) : ''}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {h.note}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </section>
  )
}
