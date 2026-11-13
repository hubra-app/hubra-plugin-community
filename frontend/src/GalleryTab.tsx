import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AspectRatio, Button, Group, Paper, SimpleGrid, Switch, Text, TextInput, Textarea } from '@mantine/core'
import { IconPhoto, IconPlus } from '@tabler/icons-react'
import { DateField, EmptyState, ErrorBanner, Field, LoadingSpinner, Modal, useT } from '@hubra/plugin-sdk'
import { QK, errorText, fmtDate, listAlbums, saveAlbum, setConsent, type Album, type Options } from './api'
import { Picture, useAction, useLocale } from './common'

export function GalleryTab({ options }: { options: Options }) {
  const { t } = useT()
  const navigate = useNavigate()
  const locale = useLocale()
  const qc = useQueryClient()
  const albums = useQuery({ queryKey: QK.albums, queryFn: listAlbums })
  const [adding, setAdding] = useState(false)
  const { busy, run } = useAction()

  const consent = (allowed: boolean) =>
    run(async () => {
      await setConsent(allowed)
      qc.invalidateQueries({ queryKey: QK.all })
    }, allowed ? t('community.gallery.consentOn') : t('community.gallery.consentOff'))

  if (albums.error) return <ErrorBanner message={errorText(albums.error)} onRetry={() => albums.refetch()} />
  if (albums.isLoading) return <LoadingSpinner />
  const list = albums.data ?? []

  return (
    <>
      <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
        <Switch
          checked={options.photosOfMe}
          disabled={busy}
          onChange={(e) => consent(e.currentTarget.checked)}
          label={t('community.gallery.consent')}
          description={t('community.gallery.consentHint')}
        />
        {options.can.galleries && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setAdding(true)}>
            {t('community.gallery.newAlbum')}
          </Button>
        )}
      </Group>
      {!list.length ? (
        <EmptyState
          icon={<IconPhoto size={28} />}
          title={t('community.gallery.none')}
          description={options.can.galleries ? t('community.gallery.noneHint') : undefined}
        />
      ) : (
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="md">
          {list.map((a) => (
            <Paper
              key={a.id}
              withBorder
              radius="md"
              style={{ overflow: 'hidden', cursor: 'pointer' }}
              onClick={() => navigate(`/app/community/albums/${a.id}`)}
            >
              <AspectRatio ratio={4 / 3}>
                <Picture id={a.coverPhotoId} alt={a.title} />
              </AspectRatio>
              <div style={{ padding: '10px 14px 12px' }}>
                <Text fw={700} truncate>
                  {a.title}
                </Text>
                <Text size="sm" c="dimmed">
                  {[a.takenOn ? fmtDate(a.takenOn, locale) : null, t('community.gallery.photos', { count: a.photos })]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </div>
            </Paper>
          ))}
        </SimpleGrid>
      )}
      {adding && <AlbumModal album={null} onClose={() => setAdding(false)} onDone={(a) => navigate(`/app/community/albums/${a.id}`)} />}
    </>
  )
}

export function AlbumModal({ album, onClose, onDone }: { album: Album | null; onClose: () => void; onDone?: (a: Album) => void }) {
  const { t } = useT()
  const qc = useQueryClient()
  const { busy, run } = useAction()
  const [title, setTitle] = useState(album?.title ?? '')
  const [description, setDescription] = useState(album?.description ?? '')
  const [takenOn, setTakenOn] = useState(album?.takenOn ?? '')
  const [membersUpload, setMembersUpload] = useState(album?.membersUpload ?? true)

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    let saved: Album | undefined
    const ok = await run(async () => {
      saved = await saveAlbum({ title, description: description || null, takenOn: takenOn || null, membersUpload }, album?.id)
    }, t('community.saved'))
    if (ok && saved) {
      qc.invalidateQueries({ queryKey: QK.albums })
      onDone?.(saved)
      onClose()
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      title={album ? t('community.gallery.editAlbum') : t('community.gallery.newAlbum')}
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            {t('community.cancel')}
          </Button>
          <Button type="submit" loading={busy} disabled={!title.trim()}>
            {t('community.save')}
          </Button>
        </>
      }
    >
      <Field label={t('community.gallery.albumTitle')}>
        <TextInput value={title} onChange={(e) => setTitle(e.currentTarget.value)} placeholder={t('community.gallery.albumExample')} data-autofocus />
      </Field>
      <Field label={t('community.gallery.takenOn')}>
        <DateField value={takenOn} onChange={setTakenOn} />
      </Field>
      <Field label={t('community.description')}>
        <Textarea autosize minRows={2} value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
      </Field>
      <Switch
        checked={membersUpload}
        onChange={(e) => setMembersUpload(e.currentTarget.checked)}
        label={t('community.gallery.membersUpload')}
        description={t('community.gallery.membersUploadHint')}
      />
    </Modal>
  )
}
