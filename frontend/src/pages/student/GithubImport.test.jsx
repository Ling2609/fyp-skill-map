import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api'
import GithubImport from './GithubImport'

// 16 Nov: the Retry button when the GitHub repository list cannot be loaded (UC09 E1). The network is replaced by
// api.get; a failed list and "GitHub not connected yet" are different answers and must look different.
vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal()),
  default: { get: vi.fn(), post: vi.fn() },
}))

const REPOS = { repos: [{ name: 'skillmap-demo', url: 'https://github.com/ling/skillmap-demo', account: 'ling', added: false }] }
const serverError = () => Promise.reject({ response: { status: 500, data: { detail: 'boom' } } })
const notConnected = () => Promise.reject({ response: { status: 400, data: { detail: 'Connect your GitHub account first.' } } })
const repos = () => Promise.resolve({ data: REPOS })

const open = () => render(<GithubImport onClose={() => {}} onDone={() => {}} />)

beforeEach(() => { vi.resetAllMocks() })

describe('Import from GitHub: when the repository list cannot be loaded', () => {
  it('says so with an alert and a Retry button', async () => {
    api.get.mockImplementation(serverError)
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your GitHub repositories. Please try again.")
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText('Connect your GitHub first')).not.toBeInTheDocument()
  })

  it('Retry asks the server again and then lists the repositories, with the message gone', async () => {
    api.get.mockImplementation(serverError)
    open()
    const retry = await screen.findByRole('button', { name: 'Retry' })

    api.get.mockImplementation(repos)                      // GitHub answers this time
    await userEvent.click(retry)

    expect(await screen.findByText('skillmap-demo')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.get).toHaveBeenLastCalledWith('/profile/github/repos')
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Couldn't load your GitHub repositories/)).not.toBeInTheDocument()
  })

  it('a failed Retry shows the message again and keeps the button', async () => {
    api.get.mockImplementation(serverError)
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText("Couldn't load your GitHub repositories. Please try again.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledTimes(2)               // it really asked again, not just kept the old message
  })

  it('"not connected yet" is a different answer: it offers Connect, not Retry', async () => {
    api.get.mockImplementation(notConnected)
    open()
    expect(await screen.findByText('Connect your GitHub first')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Couldn't load your GitHub repositories/)).not.toBeInTheDocument()
  })
})
