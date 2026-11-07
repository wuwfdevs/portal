import type { Field, GlobalConfig } from 'payload'

import { link } from '@/fields/link'
import { requirePermission } from '@/access/permissions'
import { validateHeaderHref } from '@/lib/nav/header'
import { revalidateHeader } from './hooks/revalidateHeader'

const isMenu = (_: unknown, sibling: { kind?: string }) => sibling?.kind === 'menu'
const isLink = (_: unknown, sibling: { kind?: string }) => sibling?.kind !== 'menu'

/** A header button the editors can show or hide and relabel. */
const action = (name: string, label: string, defaultLabel: string, extra: Field[] = []): Field => ({
  name,
  type: 'group',
  label,
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'show', type: 'checkbox', defaultValue: true, admin: { width: '30%' } },
        { name: 'label', type: 'text', defaultValue: defaultLabel, maxLength: 24, admin: { width: '70%' } },
      ],
    },
    ...extra,
  ],
})

/**
 * The site header (boards 27 and 27b). Everything in it is set here: which items appear across the top, in what order,
 * whether each is a plain link or a menu that opens a panel, and which buttons sit on the right. Nothing is fixed in code
 * except the logo.
 */
export const Header: GlobalConfig = {
  slug: 'header',
  admin: { group: 'Site settings', livePreview: { url: '/' } },
  access: {
    read: () => true,
    update: requirePermission('content.publish'),
  },
  fields: [
    {
      // Kept under its original name so the links already entered stay put: each is now an item of kind "link".
      name: 'navItems',
      label: 'Header items',
      labels: { singular: 'Item', plural: 'Items' },
      type: 'array',
      maxRows: 10,
      admin: {
        description:
          'Left to right, after the logo. Each item is a plain link, or a menu that opens a panel of links under the header (board 27: News, Shows, Watch, Community, About). Drag to reorder.',
        initCollapsed: true,
        components: { RowLabel: '@/Header/RowLabel#RowLabel' },
      },
      fields: [
        {
          name: 'kind',
          type: 'radio',
          required: true,
          defaultValue: 'link',
          options: [
            { label: 'Link', value: 'link' },
            { label: 'Menu', value: 'menu' },
          ],
          admin: { layout: 'horizontal' },
        },
        link({ appearances: false, overrides: { admin: { condition: isLink, hideGutter: true } } }),
        {
          name: 'label',
          type: 'text',
          maxLength: 24,
          admin: { condition: isMenu, description: 'The word in the header, e.g. "News".' },
          validate: (value: string | null | undefined, { siblingData }: { siblingData?: { kind?: string } }) =>
            siblingData?.kind === 'menu' && !value?.trim() ? 'A menu needs a label.' : true,
        },
        {
          name: 'heading',
          type: 'text',
          maxLength: 60,
          admin: { condition: isMenu, description: 'The panel’s title, e.g. "Shows and podcasts". Empty uses the label.' },
        },
        { name: 'blurb', type: 'textarea', maxLength: 200, admin: { condition: isMenu, description: 'One sentence under the title. Optional.' } },
        {
          name: 'links',
          type: 'array',
          maxRows: 20,
          labels: { singular: 'Link', plural: 'Links' },
          fields: [link({ appearances: false })],
          admin: { condition: isMenu, initCollapsed: true, components: { RowLabel: '@/Header/RowLabel#LinkRowLabel' } },
          validate: (value: unknown, { siblingData }: { siblingData?: { kind?: string } }) =>
            siblingData?.kind === 'menu' && (!Array.isArray(value) || value.length === 0) ? 'A menu needs at least one link.' : true,
        },
      ],
    },
    {
      name: 'actions',
      type: 'group',
      label: 'Buttons on the right',
      admin: { description: 'Each can be hidden or relabelled. Sign in shows only while audience sign-in is set up.' },
      fields: [
        action('search', 'Search', 'Search'),
        action('signIn', 'Sign in', 'Sign in'),
        action('donate', 'Donate', 'Donate', [
          {
            name: 'href',
            type: 'text',
            defaultValue: '/support',
            validate: validateHeaderHref,
            admin: { description: 'Where Donate goes: a page on this site ("/support") or a full https:// address.' },
          },
        ]),
      ],
    },
    {
      name: 'sections',
      type: 'array',
      fields: [link({ appearances: false })],
      maxRows: 12,
      admin: {
        description:
          'An optional second row: fellowships, series and topics to feature. Empty hides the row.',
        initCollapsed: true,
        components: { RowLabel: '@/Header/RowLabel#LinkRowLabel' },
      },
    },
  ],
  hooks: {
    afterChange: [revalidateHeader],
  },
}
