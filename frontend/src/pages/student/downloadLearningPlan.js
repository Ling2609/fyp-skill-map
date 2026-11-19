import api from '../../api'

export async function downloadLearningPlan(content, jobId) {
  const { data } = await api.post('/chatbot/plan-pdf', { content, job_id: jobId || null }, { responseType: 'blob' })
  const title = /Learning plan:[ \t]*(.+)/i.exec(content)?.[1] || ''
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skill'
  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = `learning-plan-${slug}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
