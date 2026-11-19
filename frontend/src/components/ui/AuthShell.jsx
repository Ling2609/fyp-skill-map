import Logo from './Logo'
import { AuthIntro } from './AuthIntro'

// ── AuthShell: the frame the three entry screens share ───────────────────────
// 19 Nov (her approved mock review/auth-intro.html): left, the SkillMap story on one still map stage (AuthIntro);
// right, the card. A soft divider between them; typing in the card leans the split toward it. Sits on the page's own
// colour wash (index.css --grad-page), like every other screen.
// intro: { story: 's' | 'e', headline } — the employer story on Register when "Employer" is picked.
// formFirst: on a phone, the card comes before the story (Sign in: returning people never wait; Register shows the
// story first, so new people see what SkillMap does).
export function AuthShell({ title, sub, steps, step = 0, wide = false, intro, formFirst = false, children }) {
  const brand = (
    <>
      <Logo />
      <span>SkillMap</span>
    </>
  )
  return (
    <main className={`auth2 ${formFirst ? 'form-first' : ''}`}>
      <section className="auth2-intro" aria-label="What SkillMap does">
        <div className="auth2-brand">{brand}</div>
        <AuthIntro story={intro?.story} headline={intro?.headline ?? <>Your degree, mapped to <em>real jobs</em>.</>} />
      </section>

      <section className="auth2-form">
        <div className="auth2-brand auth2-mbrand">{brand}</div>
        <div className={`auth-card auth-rise flex w-full flex-col rounded-[24px] border border-white/90 bg-card p-5 pb-4 shadow-[0_2px_4px_rgb(20_30_60/.05),0_22px_44px_-22px_rgb(20_30_60/.32)] sm:p-7 sm:pb-5 ${wide ? 'max-w-[460px]' : 'max-w-[440px]'} lg:max-h-[calc(100dvh-2rem)]`}>
          <h2 className="m-0 font-display text-[30px] font-extrabold leading-[1.1] tracking-[-0.04em] text-ink">{title}</h2>
          {sub && <p className="m-0 mb-4 mt-1.5 text-body text-muted">{sub}</p>}
          {steps && (
            <p className="m-0 mb-4 font-mono text-label uppercase tracking-[0.08em] text-accent">
              Step {step + 1} of {steps.length} · {steps[step]}
            </p>
          )}
          <div className="flex min-h-0 flex-col gap-4 lg:-mr-1 lg:overflow-y-auto lg:pr-1">{children}</div>
        </div>
      </section>
    </main>
  )
}
