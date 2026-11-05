import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionIcon, Badge, Button, Group, Paper, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconPencil, IconPlus, IconSearch, IconTools } from '@tabler/icons-react'
import { EmptyState, ErrorBanner, Field, LoadingSpinner, Modal, Seg, useT } from '@hubra/plugin-sdk'
import { QK, deleteSkill, errorText, listSkills, saveSkill, type Skill } from './api'
import { useAction } from './common'

/** Who in the club can do what, and who lends what. */
export function SkillsTab() {
  const { t } = useT()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('all')
  const [search] = useDebouncedValue(q.trim(), 250)
  const skills = useQuery({ queryKey: QK.skills(search, kind), queryFn: () => listSkills(search, kind) })
  const [editing, setEditing] = useState<Skill | 'new' | null>(null)

  return (
    <>
      <Text size="sm" c="dimmed" mb="md">
        {t('community.skills.intro')}
      </Text>
      <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
        <Group gap="sm" wrap="wrap" style={{ flex: 1 }}>
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder={t('community.skills.search')}
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 200, maxWidth: 360 }}
          />
          <Seg
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: t('community.skills.all') },
              { value: 'skill', label: t('community.skills.kindSkill') },
              { value: 'lend', label: t('community.skills.kindLend') },
            ]}
          />
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>
          {t('community.skills.add')}
        </Button>
      </Group>
      {skills.error ? (
        <ErrorBanner message={errorText(skills.error)} onRetry={() => skills.refetch()} />
      ) : skills.isLoading ? (
        <LoadingSpinner />
      ) : !skills.data?.length ? (
        <EmptyState icon={<IconTools size={28} />} title={search ? t('community.skills.noMatch') : t('community.skills.none')} description={search ? undefined : t('community.skills.noneHint')} />
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          {skills.data.map((s) => (
            <Paper key={s.id} withBorder radius="md" p="md">
              <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                <Stack gap={4} style={{ minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap">
                    <Text fw={700} truncate>
                      {s.title}
                    </Text>
                    <Badge size="sm" variant="light" color={s.kind === 'lend' ? 'teal' : 'violet'} style={{ textTransform: 'none', flexShrink: 0 }}>
                      {s.kind === 'lend' ? t('community.skills.lendBadge') : t('community.skills.skillBadge')}
                    </Badge>
                  </Group>
                  {s.description && (
                    <Text size="sm" c="dimmed" lineClamp={3}>
                      {s.description}
                    </Text>
                  )}
                  <Text size="sm">{s.name}</Text>
                </Stack>
                {s.mine && (
                  <ActionIcon variant="subtle" onClick={() => setEditing(s)} aria-label={t('community.edit')}>
                    <IconPencil size={16} />
                  </ActionIcon>
                )}
              </Group>
            </Paper>
          ))}
        </SimpleGrid>
      )}
      {editing && <SkillModal skill={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function SkillModal({ skill, onClose }: { skill: Skill | null; onClose: () => void }) {
  const { t } = useT()
  const qc = useQueryClient()
  const { busy, run } = useAction()
  const [kind, setKind] = useState<string>(skill?.kind ?? 'skill')
  const [title, setTitle] = useState(skill?.title ?? '')
  const [description, setDescription] = useState(skill?.description ?? '')
  const done = () => {
    qc.invalidateQueries({ queryKey: ['community', 'skills'] })
    onClose()
  }
  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (await run(() => saveSkill({ kind, title, description: description || null }, skill?.id), t('community.saved'))) done()
  }
  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      title={skill ? t('community.skills.edit') : t('community.skills.add')}
      footer={
        <Group justify="space-between" w="100%">
          <div>
            {skill && (
              <Button variant="subtle" color="red" onClick={async () => (await run(() => deleteSkill(skill.id))) && done()}>
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
      <Field label={t('community.skills.kind')}>
        <Seg
          value={kind}
          onChange={setKind}
          options={[
            { value: 'skill', label: t('community.skills.kindSkill') },
            { value: 'lend', label: t('community.skills.kindLend') },
          ]}
        />
      </Field>
      <Field label={t('community.skills.title')}>
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          placeholder={kind === 'lend' ? t('community.skills.lendExample') : t('community.skills.skillExample')}
          data-autofocus
        />
      </Field>
      <Field label={t('community.description')} hint={t('community.skills.descriptionHint')}>
        <Textarea autosize minRows={2} value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
      </Field>
    </Modal>
  )
}
