import React from 'react'

/**
 * The WUWF 88.1 wordmark on the sign-in screen. The file is 450×190 and is the same one the public site's header uses
 * (`components/Logo`); a plain `<img>` here because the admin does not run through the site's image settings.
 */
export const AdminLogo: React.FC = () => (
  // eslint-disable-next-line @next/next/no-img-element
  <img alt="WUWF 88.1" height={95} src="/wuwf-logo.png" style={{ display: 'block', height: 'auto', maxWidth: '100%' }} width={225} />
)

export default AdminLogo
