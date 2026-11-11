import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionIcon, Badge, Button, Checkbox, Group, Paper, Progress, Select, Stack, Switch, Table, Text, TextInput, Textarea } from '@mantine/core'
import { IconChecklist, IconPencil, IconPlus } from '@tabler/icons-react'
import { EmptyState, Field, LoadingSpinner, Modal, useT } from '@hubra/plugin-sdk'
import { QK, deleteStep, fmtDate, getProgress, getWelcome, listSteps, saveStep, tickStep, type MyWelcome, type Options, type Step } from './api'
import { useAction, useLocale } from './common'

/** The caller's checklist, and for the board the steps and who is stuck. */
export function WelcomeTab({ options }: { options: Options }) {
  const { t } = useT()
  const mine = useQuery({ queryKey: QK.welcome, queryFn: getWelcome })
  if (mine.isLoading) return <LoadingSpinner />
  const steps = mine.data?.steps ?? []
  return (
    <Stack gap="xl">
      {steps.length > 0 ? (
        <section>
          <Text fw={700} mb="sm">
            {t('community.welcome.mine')}
          </Text>
          <Checklist welcome={mine.data!} />
        </section>
      ) : (
        !options.can.welcome && <EmptyState icon={<IconChecklist size={28} />} title={t('community.welcome.none')} />
      )}
      {options.can.welcome && <StepsEditor />}
      {options.can.welcome && <NewMembers />}
    </Stack>
  )
}

export function Checklist({ welcome, compact }: { welcome: MyWelcome; compact?: boolean }) {
  const { t } = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { busy, run } = useAction()
  const done = welcome.steps.filter((s) => s.done).length
  const tick = (id: number, value: boolean) =>
    run(async () => {
      qc.setQueryData(QK.welcome, await tickStep(id, value))
    })
  return (
    <Stack gap="xs">
      <Group gap="sm" wrap="nowrap">
        <Progress value={(done / Math.max(1, welcome.steps.length)) * 100} style={{ flex: 1 }} color="violet" />
        <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {t('community.welcome.count', { done, total: welcome.steps.length })}
        </Text>
      </Group>
      {welcome.steps.map((s) => (
        <Group key={s.id} justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
          <Checkbox
            checked={s.done}
            disabled={busy || !!s.auto}
            onChange={(e) => tick(s.id, e.currentTarget.checked)}
            label={
              <Text size="sm" td={s.done ? 'line-through' : undefined} c={s.done ? 'dimmed' : undefined}>
                {s.title}
              </Text>
            }
            description={!compact && (s.description || (s.auto ? t(`community.welcome.auto.${s.auto}`) : undefined))}
          />
          {s.link && !s.done && (
            <Button
              size="compact-xs"
              variant="light"
              onClick={() => (/^\/(?![/\\])/.test(s.link!) ? navigate(s.link!) : window.open(s.link!, '_blank', 'noopener,noreferrer'))}
            >
              {t('community.welcome.go')}
            </Button>
          )}
        </Group>
      ))}
    </Stack>
  )
}

function StepsEditor() {
  const { t } = useT()
  const steps = useQuery({ queryKey: QK.steps, queryFn: listSteps })
  const [editing, setEditing] = useState<Step | 'new' | null>(null)
  return (
    <section>
      <Group justify="space-between" mb={4} wrap="wrap" gap="sm">
        <Text fw={700}>{t('community.welcome.steps')}</Text>
        <Button size="sm" leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>
          {t('community.welcome.addStep')}
        </Button>
      </Group>
      <Text size="sm" c="dimmed" mb="sm">
        {t('community.welcome.stepsHint')}
      </Text>
      {steps.isLoading ? (
        <LoadingSpinner />
      ) : !steps.data?.length ? (
        <Text size="sm" c="dimmed">
          {t('community.welcome.noSteps')}
        </Text>
      ) : (
        <Paper withBorder radius="md">
          {steps.data.map((s, i) => (
            <Group key={s.id} justify="space-between" wrap="nowrap" px="md" py="sm" style={{ borderTop: i ? '1px solid var(--mantine-color-default-border)' : undefined }}>
              <div style={{ minWidth: 0 }}>
                <Group gap={6} wrap="wrap">
                  <Text size="sm" fw={600} c={s.active ? undefined : 'dimmed'}>
                    {i + 1}. {s.title}
                  </Text>
                  {s.auto && (
                    <Badge size="xs" variant="light" style={{ textTransform: 'none' }}>
                      {t('community.welcome.autoBadge')}
                    </Badge>
                  )}
                  {!s.active && (
                    <Badge size="xs" variant="light" color="gray" style={{ textTransform: 'none' }}>
                      {t('community.welcome.off')}
                    </Badge>
                  )}
                </Group>
                {s.description && (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {s.description}
                  </Text>
                )}
              </div>
              <ActionIcon variant="subtle" onClick={() => setEditing(s)} aria-label={t('community.edit')}>
                <IconPencil size={16} />
              </ActionIcon>
            </Group>
          ))}
        </Paper>
      )}
      {editing && <StepModal step={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

function StepModal({ step, onClose }: { step: Step | null; onClose: () => void }) {
  const { t } = useT()
  const qc = useQueryClient()
  const { busy, run } = useAction()
  const [title, setTitle] = useState(step?.title ?? '')
  const [description, setDescription] = useState(step?.description ?? '')
  const [link, setLink] = useState(step?.link ?? '')
  const [auto, setAuto] = useState<string>(step?.auto ?? 'manual')
  const [position, setPosition] = useState(String(step?.position ?? ''))
  const [active, setActive] = useState(step?.active ?? true)
  const done = () => {
    qc.invalidateQueries({ queryKey: QK.all })
    onClose()
  }
  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    const body: Record<string, unknown> = { title, description: description || null, link: link || null, auto: auto === 'manual' ? null : auto, active }
    if (position !== '') body.position = Number(position)
    if (await run(() => saveStep(body, step?.id), t('community.saved'))) done()
  }
  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      title={step ? t('community.welcome.editStep') : t('community.welcome.addStep')}
      footer={
        <Group justify="space-between" w="100%">
          <div>
            {step && (
              <Button variant="subtle" color="red" onClick={async () => (await run(() => deleteStep(step.id))) && done()}>
                {t('community.delete')}
              </Button>
            )}
          </div>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              {t('community.cancel')}
            </Button>
            <Button type="submit" loading={busy} disabled={!title.trim()}>
              {t('community.save')}
            </Button>
          </Group>
        </Group>
      }
    >
      <Field label={t('community.welcome.stepTitle')}>
        <TextInput value={title} onChange={(e) => setTitle(e.currentTarget.value)} placeholder={t('community.welcome.stepExample')} data-autofocus />
      </Field>
      <Field label={t('community.description')}>
        <Textarea autosize minRows={2} value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
      </Field>
      <Field label={t('community.welcome.link')} hint={t('community.welcome.linkHint')}>
        <TextInput value={link} onChange={(e) => setLink(e.currentTarget.value)} placeholder="/app/events" />
      </Field>
      <Group grow align="flex-start">
        <Field label={t('community.welcome.ticks')}>
          <Select
            aria-label={t('community.welcome.ticks')}
            value={auto}
            onChange={(v) => v && setAuto(v)}
            allowDeselect={false}
            data={[
              { value: 'manual', label: t('community.welcome.tickManual') },
              { value: 'fee', label: t('community.welcome.tickFee') },
              { value: 'photo', label: t('community.welcome.tickPhoto') },
            ]}
          />
        </Field>
        <Field label={t('community.welcome.position')}>
          <TextInput type="number" min={0} value={position} onChange={(e) => setPosition(e.currentTarget.value)} />
        </Field>
      </Group>
      <Switch checked={active} onChange={(e) => setActive(e.currentTarget.checked)} label={t('community.welcome.active')} />
    </Modal>
  )
}

function NewMembers() {
  const { t } = useT()
  const locale = useLocale()
  const progress = useQuery({ queryKey: QK.progress, queryFn: getProgress })
  if (progress.isLoading) return <LoadingSpinner />
  const rows = progress.data?.members ?? []
  if (!progress.data?.steps.length) return null
  return (
    <section>
      <Text fw={700} mb={4}>
        {t('community.welcome.newMembers')}
      </Text>
      <Text size="sm" c="dimmed" mb="sm">
        {t('community.welcome.newMembersHint')}
      </Text>
      {!rows.length ? (
        <Text size="sm" c="dimmed">
          {t('community.welcome.noNewMembers')}
        </Text>
      ) : (
        <Paper withBorder radius="md" style={{ overflowX: 'auto' }}>
          <Table verticalSpacing="xs" horizontalSpacing="md" miw={520}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('community.welcome.member')}</Table.Th>
                <Table.Th>{t('community.welcome.joined')}</Table.Th>
                <Table.Th w={140}>{t('community.welcome.progress')}</Table.Th>
                <Table.Th>{t('community.welcome.missing')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.memberId}>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {r.name}
                    </Text>
                  </Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.joined, locale)}</Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Progress value={(r.done / Math.max(1, r.total)) * 100} style={{ flex: 1 }} color={r.done === r.total ? 'green' : 'violet'} />
                      <Text size="xs" c="dimmed">
                        {r.done}/{r.total}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={r.missing.length ? undefined : 'green'}>
                      {r.missing.length ? r.missing.join(', ') : t('community.welcome.allDone')}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </section>
  )
}
