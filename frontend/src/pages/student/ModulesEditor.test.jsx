import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api'
import ModulesEditor from './ModulesEditor'

// 16 Nov: the Retry button on the Modules tab (UC07 E4). The network is replaced by api.get, so each test decides what
// the server answers and nothing leaves the test.
vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal()),
  default: { get: vi.fn(), post: vi.fn() },
}))

const MODULES = [{ code: 'CT001', name: 'Programming Fundamentals', level: 1, type: 'common', skills: ['Python'] }]
const answers = ({ modules, grades }) => (url) =>
  url === '/modules/' ? modules() : grades()
const ok = (data) => () => Promise.resolve({ data })
const fail = () => Promise.reject(new Error('Network Error'))

beforeEach(() => { vi.resetAllMocks() })

describe('Modules tab: when the modules and grades cannot be loaded', () => {
  it('says so with an alert and a Retry button, instead of failing silently', async () => {
    api.get.mockImplementation(answers({ modules: fail, grades: ok({ grades: [] }) }))
    render(<ModulesEditor />)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your modules and grades. Please try again.")
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText('Programming Fundamentals')).not.toBeInTheDocument()
  })

  it('Retry loads again and then shows the modules, with the message gone', async () => {
    api.get.mockImplementation(answers({ modules: fail, grades: ok({ grades: [] }) }))
    render(<ModulesEditor />)
    const retry = await screen.findByRole('button', { name: 'Retry' })

    // the server is back by the time she presses Retry
    api.get.mockImplementation(answers({ modules: ok(MODULES), grades: ok({ grades: [{ module_code: 'CT001', grade: 4 }] }) }))
    await userEvent.click(retry)

    expect(await screen.findByText('Programming Fundamentals')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/modules/')
    expect(api.get).toHaveBeenCalledWith('/profile/modules')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('a failed Retry shows the message again and keeps the button', async () => {
    api.get.mockImplementation(answers({ modules: fail, grades: fail }))
    render(<ModulesEditor />)
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your modules and grades")
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledTimes(4)               // two calls at first, two more for the Retry
  })
})
