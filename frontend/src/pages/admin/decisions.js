// The three admin decisions that open the reason pop-up (ReasonDialog). Approve needs no reason and no pop-up.
export const DECISIONS = {
  deactivate: {
    title: name => `Deactivate ${name}?`,
    message: "They are signed out at once and can't sign in. Nothing is deleted, and you can reactivate the account later.",
    example: 'Duplicate account',
    action: 'Deactivate account', required: true, danger: true,
  },
  reactivate: {
    title: name => `Reactivate ${name}?`,
    message: 'They can sign in again with their existing password.',
    example: 'Student asked to keep this account',
    action: 'Reactivate account', required: true, danger: false,
  },
  reject: {
    title: name => `Reject ${name}?`,
    message: "They can still sign in but can't post jobs. You can approve them later.",
    example: 'Company not registered with SSM',
    action: 'Reject employer', required: false, danger: true,
  },
}
