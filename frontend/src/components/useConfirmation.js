import { createElement, useState } from 'react'
import ConfirmationDialog from './ConfirmationDialog'

export function useConfirmation() {
  const [request, setRequest] = useState(null)

  const confirm = wording => {
    if (request) return Promise.resolve(false)
    return new Promise(resolve => setRequest({ wording, resolve }))
  }
  const answer = accepted => {
    setRequest(null)
    request?.resolve(accepted)
  }
  return {
    confirm,
    confirmation: request && createElement(ConfirmationDialog, { wording: request.wording, onAnswer: answer }),
  }
}
