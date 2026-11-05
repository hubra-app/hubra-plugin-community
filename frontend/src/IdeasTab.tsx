import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Box, Button, Checkbox, Group, Paper, Select, Stack, Text, TextInput, Textarea, UnstyledButton } from '@mantine/core'
import { IconBulb, IconChevronUp, IconPlus } from '@tabler/icons-react'
import { ConfirmModal, EmptyState, ErrorBanner, Field, LoadingSpinner, Modal, Seg, useT } from '@hubra/plugin-sdk'
import { QK, answerIdea, createIdea, deleteIdea, errorText, fmtDate, listIdeas, pollIdea, voteIdea, type Idea, type IdeaStatus, type Options } from './api'
import { useAction, useLocale } from './common'

const COLORS: Record<IdeaStatus, string> = { open: 'gray', planned: 'blue', done: 'green', declined: 'red' }

/** The idea box: members suggest and vote, the board answers. */
export function IdeasTab({ options }: { options: Options }) {
  const { t } = useT()
  const [status, setStatus] = useState('active')
  const ideas = useQuery({ queryKey: QK.ideas(status), queryFn: () => listIdeas(status === 'all' ? '' : status) })
  const [adding, setAdding] = useState(false)

  return (
    <>
      <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
        <Seg
          value={status}
          onChange={setStatus}
          options={[
            { value: 'active', label: t('community.ideas.filterActive') },
            { value: 'done', label: t('community.ideas.status.done') },
            { value: 'declined', label: t('community.ideas.status.declined') },
            { value: 'all', label: t('community.ideas.filterAll') },
          ]}
        />
        <Button leftSection={<IconPlus size={16} />} onClick={() => setAdding(true)}>
          {t('community.ideas.add')}
        </Button>
      </Group>
      {ideas.error ? (
        <ErrorBanner message={errorText(ideas.error)} onRetry={() => ideas.refetch()} />
      ) : ideas.isLoading ? (
        <LoadingSpinner />
      ) : !ideas.data?.length ? (
        <EmptyState icon={<IconBulb size={28} />} title={t('community.ideas.none')} description={t('community.ideas.noneHint')} />
      ) : (
        <Stack gap="sm">
          {ideas.data.map((i) => (
            <IdeaCard key={i.id} idea={i} manage={options.can.ideas} />
          ))}
        </Stack>
      )}
      {adding && <IdeaModal onClose={() => setAdding(false)} />}
    </>
  )
}

function IdeaCard({ idea, manage }: { idea: Idea; manage: boolean }) {
  const { t } = useT()
  const navigate = useNavigate()
  const locale = useLocale()
  const qc = useQueryClient()
  const { busy, run } = useAction()
  const [answering, setAnswering] = useState(false)
  const [polling, setPolling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: ['community', 'ideas'] })
  const closed = idea.status === 'done' || idea.status === 'declined'

  return (
    <Paper withBorder radius="md" p="md">
      <Group align="flex-start" wrap="nowrap" gap="md">
        <UnstyledButton
          onClick={() => run(() => voteIdea(idea.id).then(refresh))}
          disabled={busy || (closed && !idea.voted)}
          aria-pressed={idea.voted}
          aria-label={t('community.ideas.vote')}
          style={{
            width: 52,
            flexShrink: 0,
            borderRadius: 8,
            padding: '6px 0',
            textAlign: 'center',
            border: `1px solid ${idea.voted ? 'var(--mantine-color-violet-filled)' : 'var(--mantine-color-default-border)'}`,
            background: idea.voted ? 'var(--mantine-color-violet-light)' : undefined,
            color: idea.voted ? 'var(--mantine-color-violet-light-color)' : undefined,
            opacity: closed && !idea.voted ? 0.6 : 1,
          }}
        >
          <IconChevronUp size={18} style={{ display: 'block', margin: '0 auto' }} />
          <Text fw={700} size="sm">
            {idea.votes}
          </Text>
        </UnstyledButton>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" wrap="wrap" mb={4}>
            <Text fw={700}>{idea.title}</Text>
            <Badge size="sm" variant="light" color={COLORS[idea.status]} style={{ textTransform: 'none' }}>
              {t(`community.ideas.status.${idea.status}`)}
            </Badge>
          </Group>
          {idea.body && (
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }} mb={6}>
              {idea.body}
            </Text>
          )}
          <Text size="xs" c="dimmed">
            {[idea.author ?? t('community.ideas.anonymous'), fmtDate(idea.createdAt, locale)].join(' · ')}
          </Text>
          {idea.answer && (
            <Box mt="sm" p="sm" style={{ borderLeft: '3px solid var(--mantine-color-violet-filled)', background: 'var(--mantine-color-default-hover)', borderRadius: 4 }}>
              <Text size="xs" fw={600} mb={2}>
                {t('community.ideas.answerFrom', { name: idea.answeredBy ?? '' })}
              </Text>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {idea.answer}
              </Text>
            </Box>
          )}
          {(manage || idea.canDelete || idea.pollId) && (
            <Group gap="xs" mt="sm" wrap="wrap">
              {idea.pollId && (
                <Button size="xs" variant="light" onClick={() => navigate(`/app/operations/polls?poll=${idea.pollId}`)}>
                  {t('community.ideas.toPoll')}
                </Button>
              )}
              {manage && (
                <Button size="xs" variant="default" onClick={() => setAnswering(true)}>
                  {idea.answer ? t('community.ideas.editAnswer') : t('community.ideas.answer')}
                </Button>
              )}
              {manage && !idea.pollId && !closed && (
                <Button size="xs" variant="default" onClick={() => setPolling(true)}>
                  {t('community.ideas.startPoll')}
                </Button>
              )}
              {idea.canDelete && (
                <Button size="xs" variant="subtle" color="red" onClick={() => setDeleting(true)}>
                  {t('community.delete')}
                </Button>
              )}
            </Group>
          )}
        </Box>
      </Group>
      {answering && <AnswerModal idea={idea} onClose={() => setAnswering(false)} />}
      <ConfirmModal
        open={polling}
        title={t('community.ideas.pollTitle')}
        body={t('community.ideas.pollBody')}
        confirmLabel={t('community.ideas.startPoll')}
        onClose={() => setPolling(false)}
        onConfirm={async () => {
          setPolling(false)
          if (await run(() => pollIdea(idea.id, {}), t('community.ideas.pollStarted'))) refresh()
        }}
      />
      <ConfirmModal
        open={deleting}
        title={t('community.ideas.deleteTitle')}
        body={t('community.ideas.deleteBody')}
        confirmLabel={t('community.delete')}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          setDeleting(false)
          if (await run(() => deleteIdea(idea.id))) refresh()
        }}
      />
    </Paper>
  )
}

function IdeaModal({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const qc = useQueryClient()
  const { busy, run } = useAction()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (await run(() => createIdea({ title, body: body || null, anonymous }), t('community.ideas.added'))) {
      qc.invalidateQueries({ queryKey: ['community', 'ideas'] })
      onClose()
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      title={t('community.ideas.add')}
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            {t('community.cancel')}
          </Button>
          <Button type="submit" loading={busy} disabled={!title.trim()}>
            {t('community.ideas.submit')}
          </Button>
        </>
      }
    >
      <Field label={t('community.ideas.title')}>
        <TextInput value={title} onChange={(e) => setTitle(e.currentTarget.value)} placeholder={t('community.ideas.titleExample')} data-autofocus />
      </Field>
      <Field label={t('community.ideas.body')}>
        <Textarea autosize minRows={3} value={body} onChange={(e) => setBody(e.currentTarget.value)} />
      </Field>
      <Checkbox
        checked={anonymous}
        onChange={(e) => setAnonymous(e.currentTarget.checked)}
        label={t('community.ideas.anonymousLabel')}
        description={t('community.ideas.anonymousHint')}
      />
    </Modal>
  )
}

function AnswerModal({ idea, onClose }: { idea: Idea; onClose: () => void }) {
  const { t } = useT()
  const qc = useQueryClient()
  const { busy, run } = useAction()
  const [status, setStatus] = useState<IdeaStatus>(idea.status)
  const [answer, setAnswer] = useState(idea.answer ?? '')
  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (await run(() => answerIdea(idea.id, { status, answer: answer || null }), t('community.saved'))) {
      qc.invalidateQueries({ queryKey: ['community', 'ideas'] })
      onClose()
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      title={idea.title}
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            {t('community.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {t('community.save')}
          </Button>
        </>
      }
    >
      <Field label={t('community.ideas.statusLabel')}>
        <Select
          aria-label={t('community.ideas.statusLabel')}
          value={status}
          onChange={(v) => v && setStatus(v as IdeaStatus)}
          allowDeselect={false}
          data={(['open', 'planned', 'done', 'declined'] as const).map((s) => ({ value: s, label: t(`community.ideas.status.${s}`) }))}
        />
      </Field>
      <Field label={t('community.ideas.answerLabel')} hint={t('community.ideas.answerHint')}>
        <Textarea autosize minRows={3} value={answer} onChange={(e) => setAnswer(e.currentTarget.value)} />
      </Field>
    </Modal>
  )
}
