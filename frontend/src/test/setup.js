// Vitest set-up (27 Oct): jest-dom's matchers (toBeInTheDocument, toHaveFocus ...) and a clean page for every test.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()                 // remove what the test drew
  localStorage.clear()      // no token or saved answer leaks into the next test
  sessionStorage.clear()
})
