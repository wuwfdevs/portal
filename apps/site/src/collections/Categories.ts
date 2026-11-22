import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { requirePermission } from '../access/permissions'
import { ensureSlug } from '../hooks/ensureSlug'
import { slugField } from 'payload'

import { PUBLIC_ID_MESSAGE, publicIdFromInput } from '../lib/listening/placement'
import { revalidateTopic } from './hooks/revalidateTopic'

export const Categories: CollectionConfig = {
  slug: 'categories',
  // The starter calls these categories; WUWF's word is topics. The slug stays so the plugins and
  // components built on it keep working. A topic is reader navigation and is never underwritten.
  labels: { singular: 'Topic', plural: 'Topics' },
  access: {
    create: requirePermission('content.write'),
    delete: requirePermission('content.write'),
    read: anyone,
    update: requirePermission('content.write'),
  },
  admin: {
    useAsTitle: 'title',
  },
  hooks: { beforeValidate: [ensureSlug('title')], afterChange: [revalidateTopic] },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    slugField({
      position: undefined,
    }),
    {
      name: 'listeningQuestion',
      type: 'text',
      label: 'Listening question',
      admin: {
        position: 'sidebar',
        components: { Field: '@/components/admin/ListeningQuestion#ListeningQuestion' },
        description: 'Optional. A WUWF Listens question to ask at the head of this topic’s page: choose one from the Portal or write a new one here. Shows nothing once the question closes.',
      },
      validate: (value: string | null | undefined) => (!value?.trim() || publicIdFromInput(value) ? true : PUBLIC_ID_MESSAGE),
    },
  ],
}
