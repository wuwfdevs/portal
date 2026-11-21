import React from 'react'

/**
 * The station's wordmark, small, beside the breadcrumbs. The wordmark rather than the browser-tab mark: that file is a single black shape
 * (a favicon), and the wordmark carries the station's blue and green. Same file as the sign-in screen and the public site's header.
 */
export const AdminIcon: React.FC = () => (
  // eslint-disable-next-line @next/next/no-img-element
  <img alt="WUWF 88.1" height={24} src="/wuwf-logo.png" width={57} />
)

export default AdminIcon
