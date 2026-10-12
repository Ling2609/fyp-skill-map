import { MyJobs } from './EmployerHome'

// Employer > My jobs (12 Oct: its own page, /employer/jobs, now that the Dashboard is the employer's home)
export default function EmployerJobs() {
  return <div className="flex flex-col min-h-screen"><MyJobs /></div>
}
