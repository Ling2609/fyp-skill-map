import { useState } from 'react'
import api from '../../api'
import { AddSkillChip, ConfirmDelete, CrossIcon, IconButton, Modal, PencilIcon, SkillChip } from './profileParts'
import { AwardForm, CertForm, ProjectForm } from './profileForms'
import { ADDED_BY_YOU, SELF_DECLARED_TIP, btnBlueCls, monthLabel, softBtnCls, sourcePillCls } from './profileUtils'
import ModulesEditor from './ModulesEditor'

// The four tabs of My Profile (9 Oct): Modules, Projects, Certificates, Awards, the places a student's skills come
// from. Each tab is one white panel: a title row with its buttons (fixed), then the list (scrolls inside the panel on
// wide screens, like the module lists). A row's ✎ and ✕ appear on hover and stay reachable with Tab.

function Panel({ title, actions, children }) {
  // Projects, certificates and awards are all self-declared (A6)
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:h-full min-h-0">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <span className={sourcePillCls} title={SELF_DECLARED_TIP}>Self-declared</span>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div tabIndex={0} aria-label={title}
        className="px-6 py-4 flex flex-col lg:flex-1 lg:min-h-0 lg:overflow-y-auto rounded-b-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300">
        {children}
      </div>
    </section>
  )
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

// An empty tab says what goes here and how to add the first one (NN/g, empty states), centred in the panel
function Empty({ icon, title, text }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-12 gap-3">
      <span aria-hidden="true" className="text-4xl">{icon}</span>
      <div className="max-w-sm">
        <p className="text-sm font-medium text-slate-700">{title}</p>
        <p className="text-sm text-slate-500 mt-1">{text}</p>
      </div>
    </div>
  )
}

// What every list tab shares: the open pop-up, the "Delete?" question, a note, and small chip actions that say when
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

// ── Modules ───────────────────────────────────────────────────────────────────
// The year-by-year grade grid itself (ModulesEditor.jsx). Programme and intake are in the page header (9 Oct).

export function ModulesTab({ onUnsavedChange, onSaved }) {
  return <div className="lg:h-full"><ModulesEditor onUnsavedChange={onUnsavedChange} onSaved={onSaved} /></div>
}

// ── Projects ──────────────────────────────────────────────────────────────────

export function ProjectsTab({ projects, onRefresh, onImport, importNote, onImportNoteClose }) {
  const s = useItems('/profile/projects', onRefresh)
  const done = (saved) => {
    s.close()
    const notes = [saved.skills_note, saved.github_note].filter(Boolean)
    s.setNote(notes.length ? `${saved.name}: ${notes.join(' ')}` : '')
    onRefresh()
  }
  const tooltip = (q) => !q ? undefined : q === ADDED_BY_YOU || q.startsWith('GitHub:') ? q : `“${q}”`
  const addButton = <button type="button" onClick={() => s.setEditing('new')} className={btnBlueCls}>+ Add project</button>

  return (
    <Panel title="Your projects" actions={<>
      <button type="button" onClick={onImport} className={softBtnCls}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v11m0 0l-4-4m4 4l4-4" />
        </svg>
        Import from GitHub
      </button>{addButton}
    </>}>
      <Note text={importNote} onClose={onImportNoteClose} />
      <Note text={s.note} onClose={() => s.setNote('')} />
      {projects.length === 0 ? (
        <Empty icon="🗂️" title="No projects yet" text="Add a project you built, or import your repositories from GitHub. SkillMap finds the skills you used." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {projects.map(p => (
            <li key={p.id} className="group py-4 first:pt-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                    {p.github_url && <a href={p.github_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">GitHub ↗</a>}
                  </div>
                  <p className="text-sm text-slate-600 mt-0.5 line-clamp-2">{p.description}</p>
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
    </Panel>
  )
}

// ── Certificates ──────────────────────────────────────────────────────────────

export function CertsTab({ certs, onRefresh }) {
  const s = useItems('/profile/certifications', onRefresh)
  const confirm = async (id) => {
    try { await api.post(`/profile/certifications/${id}/confirm`); onRefresh() }
    catch { s.setNote("Couldn't save that change. Please try again.") }
  }

  return (
    <Panel title="Your certificates" actions={<button type="button" onClick={() => s.setEditing('new')} className={btnBlueCls}>+ Add certificate</button>}>
      <Note text={s.note} onClose={() => s.setNote('')} />
      {certs.length === 0 ? (
        <Empty icon="🎓" title="No certificates yet" text="Add a certificate and the skills it lists, or let SkillMap suggest them from its name." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {certs.map(c => {
            const added = c.added_skills || []
            const estimated = c.skills_source == null || c.skills_source === 'estimated'
            const aiSkills = c.mapped_skills.filter(sk => !added.includes(sk))
            return (
              <li key={c.id} className="group py-4 first:pt-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm min-w-0">
                    <span className="font-semibold text-slate-800">{c.cert_name}</span>
                    <span className="text-slate-500"> · {c.issuer}</span>
                    {c.credly_url && <a href={c.credly_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline ml-2">Credly ↗</a>}
                  </p>
                  <RowActions what="certificate" onEdit={() => s.setEditing(c)} onDelete={() => s.setDeleting(c)} />
                </div>
                {estimated && aiSkills.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-2">
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
    </Panel>
  )
}

// ── Awards ────────────────────────────────────────────────────────────────────

export function AwardsTab({ awards, onRefresh }) {
  const s = useItems('/profile/awards', onRefresh)

  return (
    <Panel title="Your awards" actions={<button type="button" onClick={() => s.setEditing('new')} className={btnBlueCls}>+ Add award</button>}>
      <Note text={s.note} onClose={() => s.setNote('')} />
      {awards.length === 0 ? (
        <Empty icon="🏆" title="No awards yet" text="Add competition wins, scholarships or a dean's list. SkillMap suggests the skills each one shows." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {awards.map(a => {
            const added = a.added_skills || []
            return (
              <li key={a.id} className="group py-4 first:pt-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                    <p className="text-xs text-slate-500">{a.issuer}{a.award_date && ` · ${monthLabel(a.award_date)}`}</p>
                    {a.description && <p className="text-sm text-slate-600 mt-1">{a.description}</p>}
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
    </Panel>
  )
}
