import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { ensureSlug } from '../hooks/ensureSlug'
import { slugField } from 'payload'

export const Categories: CollectionConfig = {
  slug: 'categories',
  // The starter calls these categories; WUWF's word is topics. The slug stays so the plugins and
  // components built on it keep working. A topic is reader navigation and is never underwritten.
  labels: { singular: 'Topic', plural: 'Topics' },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    group: 'Editorial',
    useAsTitle: 'title',
  },
  hooks: { beforeValidate: [ensureSlug('title')] },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    slugField({
      position: undefined,
    }),
  ],
}
