import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionIcon, Anchor, Badge, Button, Group, Paper, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconPencil, IconPlus, IconSearch, IconTools } from '@tabler/icons-react'
import { EmptyState, ErrorBanner, Field, LoadingSpinner, Modal, useModules, useNav, useT } from '@hubra/plugin-sdk'
import { QK, deleteSkill, errorText, listSkills, saveSkill, type Skill } from './api'
import { useAction } from './common'

/** Who lends what. What members can do is a qualification ("Wer kann
 *  was"), so it lives with the qualifications, not here. */
export function SkillsTab() {
  const { t } = useT()
  const { has } = useModules()
  const { go } = useNav()
  const [q, setQ] = useState('')
  const [search] = useDebouncedValue(q.trim(), 250)
  const skills = useQuery({ queryKey: QK.skills(search, 'lend'), queryFn: () => listSkills(search, 'lend') })
  const [editing, setEditing] = useState<Skill | 'new' | null>(null)

  return (
    <>
      <Text size="sm" c="dimmed" mb="md">
        {t('community.skills.intro')}{' '}
        {has('inventory.guides') && (
          <Anchor component="button" type="button" size="sm" onClick={() => go('/app/skills')}>
            {t('community.skills.canDoMoved')}
          </Anchor>
        )}
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
                    <Badge size="sm" variant="light" color="teal" style={{ textTransform: 'none', flexShrink: 0 }}>
                      {t('community.skills.lendBadge')}
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
  const [title, setTitle] = useState(skill?.title ?? '')
  const [description, setDescription] = useState(skill?.description ?? '')
  const done = () => {
    qc.invalidateQueries({ queryKey: ['community', 'skills'] })
    onClose()
  }
  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (await run(() => saveSkill({ kind: 'lend', title, description: description || null }, skill?.id), t('community.saved'))) done()
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
      <Field label={t('community.skills.title')}>
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          placeholder={t('community.skills.lendExample')}
          data-autofocus
        />
      </Field>
      <Field label={t('community.description')} hint={t('community.skills.descriptionHint')}>
        <Textarea autosize minRows={2} value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
      </Field>
    </Modal>
  )
}
