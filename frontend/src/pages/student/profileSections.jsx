import { useState } from 'react'
import api from '../../api'
import { AddSkillChip, ConfirmDelete, CrossIcon, IconButton, Modal, PencilIcon, SkillChip } from './profileParts'
import { AwardForm, CertForm, ProjectForm } from './profileForms'
import { ADDED_BY_YOU, monthLabel } from './profileUtils'

// The cards of My Profile (8 Oct, clean A mock-up): a heading, one action on the right, rows split by thin lines.
// A row's ✎ and ✕ appear on hover (and stay reachable with Tab). The rows keep the old tabs' skill chips: × removes a
// skill, "+ Add skill" adds one.

export function Card({ title, action, children }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {action && <div className="flex items-center gap-4">{action}</div>}
      </div>
      {children}
    </section>
  )
}

export function CardAction({ onClick, children }) {
  return <button type="button" onClick={onClick} className="text-xs font-medium text-blue-700 hover:underline">{children}</button>
}

function RowActions({ what, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
      <IconButton label={`Edit ${what}`} onClick={onEdit}><PencilIcon /></IconButton>
      <IconButton label={`Delete ${what}`} danger onClick={onDelete}><CrossIcon /></IconButton>
    </div>
  )
}

function Note({ text, onClose }) {
  if (!text) return null
  return (
    <p role="status" className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3 flex justify-between gap-3">
      <span>{text}</span><button type="button" onClick={onClose} aria-label="Dismiss" className="text-amber-500 hover:text-amber-800">×</button>
    </p>
  )
}

// What every list card shares: the open pop-up, the "Delete?" question, a note, and small chip actions that say when
// they fail (5 Oct audit). base = '/profile/projects' etc.
function useItems(base, onRefresh) {
  const [editing, setEditing] = useState(null)     // null | 'new' | the item
  const [deleting, setDeleting] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [note, setNote] = useState('')
  const close = () => { setEditing(null); setDirty(false) }
  const run = async (call) => {
    try { await call(); onRefresh() } catch { setNote("Couldn't save that change. Please try again.") }
  }
  return {
    editing, setEditing, deleting, setDeleting, dirty, setDirty, note, setNote, close,
    remove: async (id) => { await api.delete(`${base}/${id}`); setDeleting(null); onRefresh() },
    removeSkill: (id, skill) => run(() => api.post(`${base}/${id}/remove-skill`, { skill })),
    addSkill: async (id, skill) => { await api.post(`${base}/${id}/add-skill`, { skill }); onRefresh() },
  }
}

const Empty = ({ children }) => <p className="text-sm text-gray-500">{children}</p>

// ── Projects ──────────────────────────────────────────────────────────────────

export function ProjectsCard({ projects, onRefresh, onImport, importNote, onImportNoteClose }) {
  const s = useItems('/profile/projects', onRefresh)
  const done = (saved) => {
    s.close()
    const notes = [saved.skills_note, saved.github_note].filter(Boolean)
    s.setNote(notes.length ? `${saved.name}: ${notes.join(' ')}` : '')
    onRefresh()
  }
  const tooltip = (q) => !q ? undefined : q === ADDED_BY_YOU || q.startsWith('GitHub:') ? q : `“${q}”`

  return (
    <Card title="Projects" action={<>
      <CardAction onClick={onImport}>Import from GitHub</CardAction>
      <CardAction onClick={() => s.setEditing('new')}>+ Add</CardAction>
    </>}>
      <Note text={importNote} onClose={onImportNoteClose} />
      <Note text={s.note} onClose={() => s.setNote('')} />
      {projects.length === 0 ? <Empty>No projects yet. Add one, or import your repositories from GitHub.</Empty> : (
        <ul className="divide-y divide-gray-100">
          {projects.map(p => (
            <li key={p.id} className="group py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                    {p.github_url && <a href={p.github_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">GitHub ↗</a>}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{p.description}</p>
                </div>
                <RowActions what="project" onEdit={() => s.setEditing(p)} onDelete={() => s.setDeleting(p)} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {(p.extracted_skills || []).map((sk, i) => (
                  <SkillChip key={i} skill={sk} title={tooltip(p.skill_quotes?.[sk])} added={p.skill_quotes?.[sk] === ADDED_BY_YOU}
                    onRemove={() => s.removeSkill(p.id, sk)} />
                ))}
                <AddSkillChip onAdd={(sk) => s.addSkill(p.id, sk)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {s.deleting && <ConfirmDelete name={s.deleting.name} onCancel={() => s.setDeleting(null)} onDelete={() => s.remove(s.deleting.id)} />}
      {s.editing && (
        <Modal title={s.editing === 'new' ? 'Add a project' : 'Edit project'} dirty={s.dirty} onClose={s.close}>
          <ProjectForm project={s.editing === 'new' ? null : s.editing} onDone={done} onDirty={s.setDirty} onCancel={s.close} />
        </Modal>
      )}
    </Card>
  )
}

// ── Certifications ────────────────────────────────────────────────────────────

export function CertsCard({ certs, onRefresh }) {
  const s = useItems('/profile/certifications', onRefresh)
  const confirm = async (id) => {
    try { await api.post(`/profile/certifications/${id}/confirm`); onRefresh() }
    catch { s.setNote("Couldn't save that change. Please try again.") }
  }

  return (
    <Card title="Certifications" action={<CardAction onClick={() => s.setEditing('new')}>+ Add</CardAction>}>
      <Note text={s.note} onClose={() => s.setNote('')} />
      {certs.length === 0 ? <Empty>No certifications yet.</Empty> : (
        <ul className="divide-y divide-gray-100">
          {certs.map(c => {
            const added = c.added_skills || []
            const estimated = c.skills_source == null || c.skills_source === 'estimated'
            const aiSkills = c.mapped_skills.filter(sk => !added.includes(sk))
            return (
              <li key={c.id} className="group py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm min-w-0">
                    <span className="font-semibold text-gray-800">{c.cert_name}</span>
                    <span className="text-gray-500"> · {c.issuer}</span>
                    {c.credly_url && <a href={c.credly_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline ml-2">Credly ↗</a>}
                  </p>
                  <RowActions what="certificate" onEdit={() => s.setEditing(c)} onDelete={() => s.setDeleting(c)} />
                </div>
                {/* An AI estimate says so, with one click to confirm it after checking (unchanged from the old tab) */}
                {estimated && aiSkills.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1.5 flex flex-wrap items-center gap-2">
                    Suggested by AI from the certificate name. Remove any that don't apply.
                    <button type="button" onClick={() => confirm(c.id)}
                      className="font-medium text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 hover:bg-blue-50">Confirm skills</button>
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {c.mapped_skills.map((sk, i) => (
                    <SkillChip key={i} skill={sk} added={added.includes(sk)} estimated={estimated && !added.includes(sk)}
                      title={added.includes(sk) ? ADDED_BY_YOU : estimated ? 'Suggested by AI' : undefined}
                      onRemove={() => s.removeSkill(c.id, sk)} />
                  ))}
                  <AddSkillChip onAdd={(sk) => s.addSkill(c.id, sk)} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {s.deleting && <ConfirmDelete name={s.deleting.cert_name} onCancel={() => s.setDeleting(null)} onDelete={() => s.remove(s.deleting.id)} />}
      {s.editing && (
        <Modal title={s.editing === 'new' ? 'Add a certificate' : 'Edit certificate'} dirty={s.dirty} onClose={s.close}>
          <CertForm cert={s.editing === 'new' ? null : s.editing} onDirty={s.setDirty}
            onDone={() => { s.close(); onRefresh() }} onCancel={s.close} />
        </Modal>
      )}
    </Card>
  )
}

// ── Honours & awards ──────────────────────────────────────────────────────────

export function AwardsCard({ awards, onRefresh }) {
  const s = useItems('/profile/awards', onRefresh)

  return (
    <Card title="Honours & awards" action={<CardAction onClick={() => s.setEditing('new')}>+ Add</CardAction>}>
      <Note text={s.note} onClose={() => s.setNote('')} />
      {awards.length === 0 ? <Empty>No awards yet: competition wins, scholarships or a dean's list.</Empty> : (
        <ul className="divide-y divide-gray-100">
          {awards.map(a => {
            const added = a.added_skills || []
            return (
              <li key={a.id} className="group py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{a.title}</p>
                    <p className="text-xs text-gray-500">{a.issuer}{a.award_date && ` · ${monthLabel(a.award_date)}`}</p>
                    {a.description && <p className="text-sm text-gray-600 mt-1">{a.description}</p>}
                  </div>
                  <RowActions what="award" onEdit={() => s.setEditing(a)} onDelete={() => s.setDeleting(a)} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {a.mapped_skills.map((sk, i) => (
                    <SkillChip key={i} skill={sk} added={added.includes(sk)} title={added.includes(sk) ? ADDED_BY_YOU : undefined}
                      onRemove={() => s.removeSkill(a.id, sk)} />
                  ))}
                  <AddSkillChip onAdd={(sk) => s.addSkill(a.id, sk)} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {s.deleting && <ConfirmDelete name={s.deleting.title} onCancel={() => s.setDeleting(null)} onDelete={() => s.remove(s.deleting.id)} />}
      {s.editing && (
        <Modal title={s.editing === 'new' ? 'Add an award' : 'Edit award'} dirty={s.dirty} onClose={s.close}>
          <AwardForm award={s.editing === 'new' ? null : s.editing} onDirty={s.setDirty}
            onDone={() => { s.close(); onRefresh() }} onCancel={s.close} />
        </Modal>
      )}
    </Card>
  )
}
