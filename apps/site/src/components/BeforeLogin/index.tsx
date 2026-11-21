import React from 'react'

/** Shown above the sign-in form. Staff normally arrive already signed in from the WUWF Tools Portal; this form is for the break-glass administrator. */
const BeforeLogin: React.FC = () => {
  return (
    <div className="wuwf-login-note">
      <h1>WUWF.org admin</h1>
      <p>
        Staff open this from the WUWF Tools Portal, which signs you in. This form is only for the local administrator account.
      </p>
    </div>
  )
}

export default BeforeLogin
