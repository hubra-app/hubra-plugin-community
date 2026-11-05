import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionIcon, Badge, Button, Group, Paper, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core'
import { IconAward, IconCake, IconPencil, IconPlus, IconStar } from '@tabler/icons-react'
import { EmptyState, ErrorBanner, Field, LoadingSpinner, MemberPicker, Modal, useT } from '@hubra/plugin-sdk'
import { QK, deleteHonour, errorText, fmtDate, listHonours, listJubilees, saveHonour, type Honour, type Options } from './api'
import { useAction, useLocale } from './common'

/** Honorary members for everyone; coming jubilees for whoever keeps them. */
export function HonoursTab({ options }: { options: Options }) {
  const { t } = useT()
  const locale = useLocale()
  const manage = options.can.honours
  const honours = useQuery({ queryKey: QK.honours, queryFn: listHonours })
  const jubilees = useQuery({ queryKey: QK.jubilees, queryFn: () => listJubilees(90), enabled: manage })
  const [editing, setEditing] = useState<Honour | 'new' | null>(null)

  if (honours.error) return <ErrorBanner message={errorText(honours.error)} onRetry={() => honours.refetch()} />
  if (honours.isLoading) return <LoadingSpinner />
  const list = honours.data ?? []

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
          <Text fw={700}>{t('community.honours.title')}</Text>
          {manage && (
            <Button size="sm" leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>
              {t('community.honours.add')}
            </Button>
          )}
        </Group>
        {!list.length ? (
          <EmptyState icon={<IconAward size={28} />} title={t('community.honours.none')} />
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
            {list.map((h) => (
              <Paper key={h.id} withBorder radius="md" p="md">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                    <IconAward size={26} color="var(--mantine-color-yellow-filled)" style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <Text fw={700} truncate>
                        {h.name}
                      </Text>
                      <Group gap={6}>
                        <Badge size="sm" variant="light" color="yellow" style={{ textTransform: 'none' }}>
                          {h.title}
                        </Badge>
                        {h.awardedOn && (
                          <Text size="xs" c="dimmed">
                            {t('community.honours.since', { date: fmtDate(h.awardedOn, locale) })}
                          </Text>
                        )}
                      </Group>
                      {h.note && (
                        <Text size="xs" c="dimmed" mt={4}>
                          {h.note}
                        </Text>
                      )}
                    </div>
                  </Group>
                  {manage && (
                    <ActionIcon variant="subtle" onClick={() => setEditing(h)} aria-label={t('community.edit')}>
                      <IconPencil size={16} />
                    </ActionIcon>
                  )}
                </Group>
              </Paper>
            ))}
          </SimpleGrid>
        )}
      </section>
      {editing && <HonourModal honour={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Stack>
  )
}

function HonourModal({ honour, onClose }: { honour: Honour | null; onClose: () => void }) {
  const { t } = useT()
  const qc = useQueryClient()
  const { busy, run } = useAction()
  const [memberId, setMemberId] = useState<string | null>(honour ? String(honour.memberId) : null)
  const [title, setTitle] = useState(honour?.title ?? t('community.honours.defaultTitle'))
  const [awardedOn, setAwardedOn] = useState(honour?.awardedOn ?? '')
  const [note, setNote] = useState(honour?.note ?? '')
  const done = () => {
    qc.invalidateQueries({ queryKey: QK.honours })
    onClose()
  }
  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (await run(() => saveHonour({ memberId: Number(memberId), title, awardedOn: awardedOn || null, note: note || null }, honour?.id), t('community.saved'))) done()
  }
  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      title={honour ? t('community.honours.edit') : t('community.honours.add')}
      footer={
        <Group justify="space-between" w="100%">
          <div>
            {honour && (
              <Button variant="subtle" color="red" onClick={async () => (await run(() => deleteHonour(honour.id))) && done()}>
                {t('community.delete')}
              </Button>
            )}
          </div>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              {t('community.cancel')}
            </Button>
            <Button type="submit" loading={busy} disabled={!memberId || !title.trim()}>
              {t('community.save')}
            </Button>
          </Group>
        </Group>
      }
    >
      <Field label={t('community.honours.member')}>
        <MemberPicker value={memberId} onChange={(id) => setMemberId(id)} />
      </Field>
      <Field label={t('community.honours.honourTitle')}>
        <TextInput value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
      </Field>
      <Field label={t('community.honours.awardedOn')}>
        <TextInput type="date" value={awardedOn} onChange={(e) => setAwardedOn(e.currentTarget.value)} />
      </Field>
      <Field label={t('community.honours.note')} hint={t('community.honours.noteHint')}>
        <TextInput value={note} onChange={(e) => setNote(e.currentTarget.value)} />
      </Field>
    </Modal>
  )
}
