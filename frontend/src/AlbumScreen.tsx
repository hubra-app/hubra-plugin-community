import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionIcon, Anchor, AspectRatio, Badge, Button, FileButton, Group, Menu, Pill, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconArrowLeft, IconChevronLeft, IconChevronRight, IconDots, IconPencil, IconPhoto, IconTrash, IconUpload } from '@tabler/icons-react'
import { ConfirmModal, EmptyState, ErrorBanner, Field, LoadingSpinner, MemberPicker, Modal, PageHead, useT, useToast } from '@hubra/plugin-sdk'
import {
  QK,
  deleteAlbum,
  deletePhoto,
  errorText,
  fmtDate,
  getAlbum,
  getOptions,
  saveAlbum,
  untagMe,
  updatePhoto,
  uploadPhotos,
  type AlbumDetail,
  type Photo,
} from './api'
import { Picture, useAction, useLocale } from './common'
import { AlbumModal } from './GalleryTab'

export function AlbumScreen() {
  const { t } = useT()
  const navigate = useNavigate()
  const locale = useLocale()
  const qc = useQueryClient()
  const { notify } = useToast()
  const id = Number(useParams().id)
  const album = useQuery({ queryKey: QK.album(id), queryFn: () => getAlbum(id) })
  const options = useQuery({ queryKey: QK.options, queryFn: getOptions })
  const [open, setOpen] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const { run } = useAction()

  if (album.error) return <ErrorBanner message={errorText(album.error)} onRetry={() => album.refetch()} />
  if (album.isLoading || !album.data) return <LoadingSpinner />
  const a = album.data

  const upload = async (files: File[]) => {
    if (!files.length) return
    setUploading(true)
    try {
      for (let i = 0; i < files.length; i += 20) {
        const done = await uploadPhotos(a.id, files.slice(i, i + 20))
        if (done.added.length) notify('success', t('community.gallery.uploaded', { count: done.added.length }))
        for (const f of done.failed) notify('error', `${f.name}: ${f.reason}`)
      }
    } catch (err) {
      notify('error', errorText(err))
    } finally {
      setUploading(false)
      qc.invalidateQueries({ queryKey: QK.albums })
    }
  }

  const index = open === null ? -1 : a.items.findIndex((p) => p.id === open)

  return (
    <>
      <PageHead
        title={a.title}
        desc={[a.takenOn ? fmtDate(a.takenOn, locale) : null, t('community.gallery.photos', { count: a.items.length })].filter(Boolean).join(' · ')}
        back={
          <Anchor component="button" size="sm" onClick={() => navigate('/app/community')}>
            <Group gap={4}>
              <IconArrowLeft size={14} /> {t('community.tabs.gallery')}
            </Group>
          </Anchor>
        }
        actions={
          <Group gap="xs">
            {a.canUpload && (
              <FileButton onChange={upload} accept="image/jpeg,image/png,image/webp,image/gif" multiple>
                {(props) => (
                  <Button {...props} leftSection={<IconUpload size={16} />} loading={uploading}>
                    {t('community.gallery.upload')}
                  </Button>
                )}
              </FileButton>
            )}
            {a.canEdit && (
              <Menu position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="default" size="lg" aria-label={t('community.more')}>
                    <IconDots size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditing(true)}>
                    {t('community.gallery.editAlbum')}
                  </Menu.Item>
                  <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => setDeleting(true)}>
                    {t('community.gallery.deleteAlbum')}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        }
      />
      {a.description && (
        <Text size="sm" mb="md" style={{ whiteSpace: 'pre-wrap' }}>
          {a.description}
        </Text>
      )}
      {!a.items.length ? (
        <EmptyState icon={<IconPhoto size={28} />} title={t('community.gallery.empty')} description={a.canUpload ? t('community.gallery.emptyHint') : undefined} />
      ) : (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing={6}>
          {a.items.map((p) => (
            <UnstyledButton key={p.id} onClick={() => setOpen(p.id)} aria-label={p.caption || t('community.gallery.photo')} style={{ borderRadius: 6, overflow: 'hidden' }}>
              <AspectRatio ratio={1}>
                <Picture id={p.id} alt={p.caption ?? ''} />
              </AspectRatio>
            </UnstyledButton>
          ))}
        </SimpleGrid>
      )}
      {index >= 0 && (
        <PhotoModal
          album={a}
          photo={a.items[index]}
          me={options.data?.memberId ?? 0}
          onClose={() => setOpen(null)}
          onStep={(d) => setOpen(a.items[(index + d + a.items.length) % a.items.length].id)}
        />
      )}
      {editing && <AlbumModal album={a} onClose={() => setEditing(false)} onDone={() => qc.invalidateQueries({ queryKey: QK.album(a.id) })} />}
      <ConfirmModal
        open={deleting}
        title={t('community.gallery.deleteAlbumTitle')}
        body={t('community.gallery.deleteAlbumBody', { count: a.items.length })}
        confirmLabel={t('community.delete')}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          setDeleting(false)
          if (await run(() => deleteAlbum(a.id))) {
            qc.invalidateQueries({ queryKey: QK.albums })
            navigate('/app/community')
          }
        }}
      />
    </>
  )
}

function PhotoModal({
  album,
  photo,
  me,
  onClose,
  onStep,
}: {
  album: AlbumDetail
  photo: Photo
  me: number
  onClose: () => void
  onStep: (d: number) => void
}) {
  const { t } = useT()
  const qc = useQueryClient()
  const { busy, run } = useAction()
  const [caption, setCaption] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: QK.album(album.id) })
    qc.invalidateQueries({ queryKey: QK.albums })
  }
  const tags = photo.tags.map((tg) => tg.memberId)
  const setTags = (next: number[]) => run(async () => qc.setQueryData(QK.album(album.id), await updatePhoto(photo.id, { tags: next })))
  const tagged = tags.includes(me)

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={photo.caption || album.title}
      footer={
        <Group justify="space-between" w="100%" wrap="wrap" gap="xs">
          <Group gap="xs">
            <ActionIcon variant="default" size="lg" onClick={() => onStep(-1)} aria-label={t('community.gallery.previous')}>
              <IconChevronLeft size={18} />
            </ActionIcon>
            <ActionIcon variant="default" size="lg" onClick={() => onStep(1)} aria-label={t('community.gallery.next')}>
              <IconChevronRight size={18} />
            </ActionIcon>
          </Group>
          <Group gap="xs">
            {album.canEdit && album.coverPhotoId !== photo.id && (
              <Button variant="default" onClick={() => run(() => saveAlbum({ coverPhotoId: photo.id }, album.id).then(refresh), t('community.gallery.coverSet'))}>
                {t('community.gallery.makeCover')}
              </Button>
            )}
            {photo.canEdit && (
              <Button variant="subtle" color="red" onClick={() => setConfirm(true)}>
                {t('community.delete')}
              </Button>
            )}
          </Group>
        </Group>
      }
    >
      <Stack gap="sm">
        <div style={{ height: 'min(50vh, 480px)', borderRadius: 8, overflow: 'hidden' }}>
          <Picture id={photo.id} size="full" fit="contain" alt={photo.caption ?? ''} />
        </div>
        {photo.uploadedBy && (
          <Text size="xs" c="dimmed">
            {t('community.gallery.by', { name: photo.uploadedBy })}
          </Text>
        )}
        {photo.canEdit ? (
          <Field label={t('community.gallery.caption')}>
            <TextInput
              value={caption ?? photo.caption ?? ''}
              onChange={(e) => setCaption(e.currentTarget.value)}
              onBlur={() => {
                if (caption !== null && caption !== (photo.caption ?? '')) run(() => updatePhoto(photo.id, { caption: caption || null }).then(refresh))
                setCaption(null)
              }}
            />
          </Field>
        ) : null}
        <div>
          <Text size="sm" fw={600} mb={6}>
            {t('community.gallery.onPhoto')}
          </Text>
          <Group gap={6} wrap="wrap">
            {photo.tags.length === 0 && (
              <Text size="sm" c="dimmed">
                {t('community.gallery.nobodyTagged')}
              </Text>
            )}
            {photo.tags.map((tg) =>
              photo.canEdit ? (
                <Pill key={tg.memberId} withRemoveButton onRemove={() => setTags(tags.filter((m) => m !== tg.memberId))} size="md">
                  {tg.name}
                </Pill>
              ) : (
                <Badge key={tg.memberId} variant="light" color="gray" style={{ textTransform: 'none' }}>
                  {tg.name}
                </Badge>
              ),
            )}
          </Group>
          {photo.canEdit && (
            <MemberPicker
              mt="xs"
              value={null}
              placeholder={t('community.gallery.tagSomeone')}
              exclude={tags.map(String)}
              disabled={busy}
              onChange={(mid) => mid && setTags([...tags, Number(mid)])}
            />
          )}
          {tagged && !photo.canEdit && (
            <Button mt="xs" size="xs" variant="subtle" onClick={() => run(() => untagMe(photo.id).then(refresh), t('community.gallery.untagged'))}>
              {t('community.gallery.untagMe')}
            </Button>
          )}
        </div>
      </Stack>
      <ConfirmModal
        open={confirm}
        title={t('community.gallery.deletePhotoTitle')}
        body={t('community.gallery.deletePhotoBody')}
        confirmLabel={t('community.delete')}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false)
          if (await run(() => deletePhoto(photo.id))) {
            refresh()
            onClose()
          }
        }}
      />
    </Modal>
  )
}
