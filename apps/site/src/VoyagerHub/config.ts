import type { GlobalConfig } from 'payload'

import { requirePermission } from '@/access/permissions'
import { validateSupportHref } from '@/lib/support-link'

import { revalidateVoyagerHub } from './hooks/revalidate'

/**
 * The Voyager hub (`/voyager`, board 13): the UWF student newspaper, published on the WUWF platform. Student editors make its
 * editorial decisions, so the stories, bylines and sections are theirs; this only says which publishing identity is The Voyager,
 * which sections head the page, who is on staff, and the invitation to join. Stories are found by their publishing identity.
 */
export const VoyagerHub: GlobalConfig = {
  slug: 'voyager-hub',
  admin: { group: 'Pages & hubs', livePreview: { url: '/voyager' } },
  label: 'The Voyager hub',
  access: { read: () => true, update: requirePermission('content.publish') },
  hooks: { afterChange: [revalidateVoyagerHub] },
  fields: [
    {
      name: 'identity',
      type: 'relationship',
      relationTo: 'publishing-identities',
      admin: { description: 'The "The Voyager" publishing identity. Stories with this identity fill the hub. Until it is chosen, the hub says it is not set up.' },
    },
    { name: 'tagline', type: 'text', defaultValue: 'The student newspaper of the University of West Florida' },
    {
      name: 'featured',
      type: 'relationship',
      relationTo: 'posts',
      admin: { description: 'The large story at the top. Empty means the newest Voyager story.' },
      filterOptions: { _status: { equals: 'published' } },
    },
    {
      name: 'sections',
      type: 'relationship',
      relationTo: 'sections',
      hasMany: true,
      maxRows: 6,
      admin: { description: 'Up to six sections, in order (e.g. Campus, Sports, Arts & Life, Opinion). Each shows its newest two Voyager stories.' },
    },
    {
      name: 'podcast',
      type: 'relationship',
      relationTo: 'productions',
      admin: { description: 'A Voyager podcast to show in the Multimedia band. Optional.' },
    },
    {
      name: 'staff',
      type: 'array',
      labels: { singular: 'Staff member', plural: 'Staff' },
      admin: { description: 'Who is on staff this term. Everyone here needs a contributor record (add one for a new student).' },
      fields: [
        { name: 'person', type: 'relationship', relationTo: 'contributors', required: true },
        { name: 'role', type: 'text', admin: { description: 'Their role this term, e.g. "News editor". Empty uses their title.' } },
      ],
    },
    {
      name: 'join',
      type: 'group',
      label: 'Join the newsroom',
      fields: [
        { name: 'heading', type: 'text', defaultValue: 'Write for The Voyager' },
        { name: 'text', type: 'textarea', admin: { description: 'Say only what is true this term (who can join, whether editor roles are paid).' } },
        { name: 'href', type: 'text', label: 'Link', validate: validateSupportHref, admin: { description: 'Where "Join the newsroom" goes. Empty hides the button.' } },
      ],
    },
    {
      name: 'footnote',
      type: 'textarea',
      defaultValue: 'The Voyager is written and edited by UWF students, with faculty advising from the Department of Communication. It is published on the WUWF platform; student editors make its editorial decisions.',
    },
  ],
}
