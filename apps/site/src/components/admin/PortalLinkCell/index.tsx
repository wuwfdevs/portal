import type { DefaultServerCellComponentProps } from 'payload'
import React from 'react'

import { portalLinkLabel } from '@/lib/portal/account-kind'

/**
 * The staff list's "Portal profile" column: the stored value is the Portal profile's id, which means nothing to read, so the cell says whether the account is linked to one.
 * A local account (the break-glass administrator, or one made by hand) is "None (local password)": it keeps its own roles and cannot write listening queries.
 */
export const PortalLinkCell: React.FC<DefaultServerCellComponentProps> = ({ cellData }) => <span>{portalLinkLabel(typeof cellData === 'string' ? cellData : null)}</span>
