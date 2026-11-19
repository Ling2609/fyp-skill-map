import { createElement } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
import ConfirmationDialog from './ConfirmationDialog'

export function useUnsavedChanges(dirty, { includeSearch = false, onDiscard } = {}) {
  useBeforeUnload(event => {
    if (!dirty) return
    event.preventDefault()
    event.returnValue = ''
  })

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && (
    !(nextLocation.pathname === '/logout' && nextLocation.state?.expiredReason) && (
      currentLocation.pathname !== nextLocation.pathname ||
      (includeSearch && (currentLocation.search !== nextLocation.search || currentLocation.hash === nextLocation.hash))
    )
  ))
  if (blocker.state !== 'blocked') return null

  const loggingOut = blocker.location.pathname === '/logout' && blocker.location.state?.logout === true
  return createElement(ConfirmationDialog, {
    wording: {
      title: loggingOut ? 'Log out with unsaved changes?' : 'Leave without saving?',
      message: loggingOut ? 'Logging out will discard your unsaved edits.' : 'Leaving this page will discard your unsaved edits.',
      confirmLabel: loggingOut ? 'Discard edits and log out' : 'Discard edits and leave',
      cancelLabel: 'Keep editing',
      danger: true,
    },
    onAnswer(accepted) {
      if (!accepted) {
        blocker.reset()
        return
      }
      onDiscard?.()
      blocker.proceed()
    },
  })
}
