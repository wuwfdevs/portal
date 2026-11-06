import { ValidationError, type CollectionBeforeChangeHook, type CollectionConfig } from 'payload'

import { requirePermission } from '../access/permissions'
import { normalizeEmail } from '../lib/audience/rules'
import { siteOrigin } from '../lib/audience/origin'
import { mailer } from '../lib/email/mailer'
import { claimEmail, claimExpiry, newClaimToken } from '../lib/members/entitlement'

const staff = requirePermission('membership.manage')

/**
 * Normalizes the address; when "Send the claim email" is ticked, makes a single-use claim link, emails it, and stores only its
 * hash. The email goes before the save, so a failed send saves nothing and staff see why.
 */
const claimOnSave: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  if (data.email !== undefined) {
    const email = normalizeEmail(data.email)
    if (!email) throw new ValidationError({ collection: 'memberships', errors: [{ message: 'Enter the email address on the membership.', path: 'email' }] }, req.t)
    data.email = email
  }
  if (data.sendClaimEmail !== true) return data
  data.sendClaimEmail = false

  const claimed = data.account ?? originalDoc?.account
  if (claimed) {
    throw new ValidationError({ collection: 'memberships', errors: [{ message: 'This membership is already connected to an account. Remove the account first to send a new claim link.', path: 'sendClaimEmail' }] }, req.t)
  }
  const m = mailer()
  if (!m.isConfigured()) {
    throw new ValidationError({ collection: 'memberships', errors: [{ message: 'Email is not set up on this server yet (RESEND_API_KEY and RESEND_FROM_EMAIL), so the claim link cannot be sent.', path: 'sendClaimEmail' }] }, req.t)
  }
  const to = (data.email ?? originalDoc?.email) as string | undefined
  const name = ((data.name ?? originalDoc?.name) as string | undefined)?.trim() || 'WUWF member'
  if (!to) throw new ValidationError({ collection: 'memberships', errors: [{ message: 'Enter the email address on the membership.', path: 'email' }] }, req.t)

  const now = new Date()
  const { token, hash } = newClaimToken()
  const url = new URL('/account/claim', siteOrigin())
  url.searchParams.set('token', token)
  const sent = await m.send({ to, ...claimEmail({ name, url: url.toString() }) })
  if (!sent.ok) {
    throw new ValidationError({ collection: 'memberships', errors: [{ message: 'The claim email could not be sent. Nothing was saved; please try again.', path: 'sendClaimEmail' }] }, req.t)
  }
  return { ...data, claim: { ...(originalDoc?.claim ?? {}), ...(data.claim ?? {}), tokenHash: hash, expiresAt: claimExpiry(now), sentAt: now.toISOString(), claimedAt: null } }
}

/**
 * A WUWF sustaining membership at the station's qualifying level, as Member Services records it (phase 7c). It carries members'
 * listening on every WUWF original until its end date (plus a short grace period). It is not the ledger and not a donor record:
 * gifts stay in WUWF's membership database, and nothing here is a payment.
 *
 * A reader's account is connected only by the claim link sent to the address on the membership, never by matching addresses.
 */
export const Memberships: CollectionConfig = {
  slug: 'memberships',
  labels: { singular: "Members' listening", plural: "Members' listening" },
  access: { read: staff, create: staff, update: staff, delete: staff },
  admin: {
    group: 'Membership',
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'endsOn', 'account', 'updatedAt'],
    listSearchableFields: ['name', 'email'],
    description:
      "Sustaining members at the station's qualifying level, with members' listening on wuwf.org. Add one, tick \"Send the claim email\", and the member gets a link that connects the membership to their wuwf.org account. Access ends 14 days after the end date.",
  },
  hooks: { beforeChange: [claimOnSave] },
  fields: [
    { name: 'name', type: 'text', required: true, admin: { description: 'As on the membership. Used to greet them in the claim email.' } },
    { name: 'email', type: 'email', required: true, index: true, admin: { description: 'The address on the membership. The claim link goes here; it is never used to connect an account by itself.' } },
    {
      name: 'endsOn',
      type: 'date',
      required: true,
      index: true,
      admin: { date: { pickerAppearance: 'dayOnly' }, description: 'The last day the membership is paid through. Move it forward when it renews.' },
    },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'manual',
      options: [
        { label: 'Recorded by Member Services', value: 'manual' },
        { label: 'From the membership database', value: 'sync' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'note', type: 'textarea', admin: { description: 'For Member Services only.' } },
    {
      name: 'sendClaimEmail',
      type: 'checkbox',
      label: 'Send the claim email when I save',
      defaultValue: false,
      admin: { position: 'sidebar', description: 'Emails a single-use link (good for 14 days) to the address above. Sending again replaces any earlier link.' },
    },
    {
      name: 'account',
      type: 'relationship',
      relationTo: 'audience-profiles',
      admin: { position: 'sidebar', description: 'Set when the member opens the claim link. Clear it to disconnect the account.' },
    },
    {
      name: 'claim',
      type: 'group',
      admin: { position: 'sidebar' },
      fields: [
        { name: 'sentAt', type: 'date', label: 'Claim email sent', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'expiresAt', type: 'date', label: 'Link works until', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'claimedAt', type: 'date', label: 'Connected', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        // Only the hash of the link's token is kept, and nobody reads it through the admin or the API (the hash alone claims nothing).
        { name: 'tokenHash', type: 'text', index: true, access: { read: () => false }, admin: { hidden: true } },
      ],
    },
  ],
}
