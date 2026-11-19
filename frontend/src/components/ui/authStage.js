// The intro stage's drawing (19 Nov, approved mock review/auth-intro.html), kept as the mock's own markup so nothing is
// lost in a hand conversion. Decorative: AuthIntro renders it inside an aria-hidden box; every word it shows is also
// said by the chapter captions. Static text only (no user data), so innerHTML is safe here.
export const STAGE_HTML = `
          <svg width="0" height="0" style="position:absolute">
            <symbol id="sm-grad" viewBox="0 0 46 60"><path d="M5 58c0-14 8-26 18-26s18 12 18 26Z" fill="#2557c4" stroke="#fff" stroke-width="2.5"/><circle cx="23" cy="18" r="10" fill="#2557c4" stroke="#fff" stroke-width="2.5"/><path d="M10 10 23 4l13 6-13 6Z" fill="#16142b" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><path d="M34 11v7" stroke="#16142b" stroke-width="1.8" stroke-linecap="round"/></symbol>
            <symbol id="sm-emp" viewBox="0 0 46 60"><path d="M5 58c0-14 8-26 18-26s18 12 18 26Z" fill="#13998c" stroke="#fff" stroke-width="2.5"/><circle cx="23" cy="18" r="10" fill="#13998c" stroke="#fff" stroke-width="2.5"/><rect x="15.5" y="43" width="15" height="10" rx="2" fill="#fff"/><path d="M19.5 43v-2.5h7V43" fill="none" stroke="#fff" stroke-width="1.8"/></symbol>
          </svg>

          <!-- ── STUDENT · 1 modules ── -->
          <div class="el s mod card m1"><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg></i><span><b>Database Systems</b><small>Grade <span class="g">A</span></small></span></div>
          <div class="el s mod card m2"><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 14l-2 2 2 2M16 14l2 2-2 2"/></svg></i><span><b>Web Development</b><small>Grade <span class="g">A−</span></small></span></div>
          <div class="el s mod card m3"><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18l-6-6 6-6M15 6l6 6-6 6"/></svg></i><span><b>Final-year project</b><small>On GitHub · 3 repos</small></span></div>
          <svg class="el s links" viewBox="0 0 560 400" aria-hidden="true"><path class="link" d="M228 100 C238 100 240 92 250 92"/><path class="link" d="M228 200 C238 200 240 178 250 176M228 200 C238 200 240 218 250 220"/><path class="link" d="M228 300 C238 300 240 304 250 304"/></svg>
          <span class="el s k k1 chip have" style="--x0:200px;--y0:78px;--x1:252px;--y1:77px;--x2:316px;--y2:200px"><span class="tick">✓</span>SQL</span>
          <span class="el s k k2 chip have" style="--x0:200px;--y0:162px;--x1:252px;--y1:161px;--x2:418px;--y2:200px"><span class="tick">✓</span>HTML</span>
          <span class="el s k k3 chip have" style="--x0:200px;--y0:205px;--x1:252px;--y1:205px;--x2:316px;--y2:238px"><span class="tick">✓</span>CSS</span>
          <span class="el s k k4 chip have" style="--x0:200px;--y0:289px;--x1:252px;--y1:289px;--x2:418px;--y2:238px"><span class="tick">✓</span>Java</span>

          <!-- ── STUDENT · 2 the job ad ── -->
          <div class="el s ad card">
            <div class="eyebrow">Job ad · live</div>
            <h3>Graduate Software Engineer</h3>
            <div class="meta">Kuala Lumpur · posted today</div>
            <div class="asks eyebrow">Asks for</div>
            <span class="slot chip miss" style="left:16px;top:220px">REST APIs</span>
            <span class="slot chip miss" style="left:118px;top:220px">Docker</span>
            <div class="sum">You have <b>4/6</b></div>
          </div>

          <!-- ── STUDENT · 3 where you stand ── -->
          <div class="el s score"><b>4</b><span>/6</span></div>
          <div class="el s standtxt">You have 4 of the 6 skills this job asks for.</div>
          <div class="el s next card">
            <div class="eyebrow">Still to learn</div>
            <div class="row"><span>REST APIs</span><span style="color:var(--miss-strong)">+4 jobs</span></div><div class="bar"><i style="--w:80%"></i></div>
            <div class="row"><span>Docker</span><span style="color:var(--miss-strong)">+2 jobs</span></div><div class="bar"><i style="--w:40%"></i></div>
          </div>
          <svg class="el s trail" viewBox="0 0 520 110" aria-hidden="true">
            <path d="M24 60 C110 20 170 96 260 58 S410 30 470 52" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
            <path d="M24 60 C110 20 170 96 260 58 S410 30 470 52" fill="none" stroke="#5b6b8a" stroke-width="2" stroke-dasharray="3 6" stroke-linecap="round"/>
            <use href="#sm-grad" x="7" y="22" width="34" height="44"/><text x="10" y="86">You</text>
            <g class="step" style="transition-delay:.3s"><g transform="translate(86 42) rotate(-28)"><ellipse rx="7" ry="10" fill="#13998c"/><circle cx="-4" cy="-13" r="2.4" fill="#13998c"/><circle cx="1" cy="-14.5" r="2.4" fill="#13998c"/><circle cx="5.5" cy="-12" r="2.2" fill="#13998c"/></g></g>
            <g class="step" style="transition-delay:.5s"><g transform="translate(150 54) rotate(30)"><ellipse rx="7" ry="10" fill="#13998c"/><circle cx="-4" cy="-13" r="2.4" fill="#13998c"/><circle cx="1" cy="-14.5" r="2.4" fill="#13998c"/><circle cx="5.5" cy="-12" r="2.2" fill="#13998c"/></g></g>
            <g class="step" style="transition-delay:.7s"><g transform="translate(212 72) rotate(-10)"><ellipse rx="7" ry="10" fill="#13998c"/><circle cx="-4" cy="-13" r="2.4" fill="#13998c"/><circle cx="1" cy="-14.5" r="2.4" fill="#13998c"/><circle cx="5.5" cy="-12" r="2.2" fill="#13998c"/></g></g>
            <g class="step" style="transition-delay:.9s"><g transform="translate(276 52) rotate(40)"><ellipse rx="7" ry="10" fill="#13998c"/><circle cx="-4" cy="-13" r="2.4" fill="#13998c"/><circle cx="1" cy="-14.5" r="2.4" fill="#13998c"/><circle cx="5.5" cy="-12" r="2.2" fill="#13998c"/></g></g>
            <g class="step" style="transition-delay:1.1s"><g transform="translate(346 34) rotate(60)"><ellipse rx="7" ry="10" fill="#fff" stroke="#e9795a" stroke-width="2" stroke-dasharray="3 3"/><circle cx="-4" cy="-13" r="2.4" fill="#fff" stroke="#e9795a" stroke-width="1.4"/><circle cx="1" cy="-14.5" r="2.4" fill="#fff" stroke="#e9795a" stroke-width="1.4"/><circle cx="5.5" cy="-12" r="2.2" fill="#fff" stroke="#e9795a" stroke-width="1.4"/></g></g>
            <g class="step" style="transition-delay:1.3s"><g transform="translate(410 46) rotate(95)"><ellipse rx="7" ry="10" fill="#fff" stroke="#e9795a" stroke-width="2" stroke-dasharray="3 3"/><circle cx="-4" cy="-13" r="2.4" fill="#fff" stroke="#e9795a" stroke-width="1.4"/><circle cx="1" cy="-14.5" r="2.4" fill="#fff" stroke="#e9795a" stroke-width="1.4"/><circle cx="5.5" cy="-12" r="2.2" fill="#fff" stroke="#e9795a" stroke-width="1.4"/></g></g>
            <g class="step" style="transition-delay:1.5s"><path d="M470 52V18" stroke="#16142b" stroke-width="2.5"/><path d="M471 18h22l-6 7 6 7h-22Z" fill="#16142b"/><text x="440" y="84">Job ready</text></g>
          </svg>

          <!-- ── EMPLOYER · 1 post a job ── -->
          <div class="el e ad card">
            <div class="eyebrow">New job ad</div>
            <h3>Junior Data Analyst</h3>
            <span class="typed" style="--w:96%"></span><span class="typed" style="--w:88%"></span><span class="typed" style="--w:60%"></span>
            <div class="asks eyebrow">SkillMap found</div>
          </div>
          <span class="el e k k1 chip ask" style="--x0:60px;--y0:140px;--x1:46px;--y1:212px">SQL</span>
          <span class="el e k k2 chip ask" style="--x0:60px;--y0:140px;--x1:112px;--y1:212px">Python</span>
          <span class="el e k k3 chip ask" style="--x0:60px;--y0:140px;--x1:46px;--y1:250px">Excel</span>
          <span class="el e k k4 chip ask" style="--x0:60px;--y0:140px;--x1:120px;--y1:250px">Power BI</span>

          <!-- ── EMPLOYER · 2 graduates who fit · 3 evidence ── -->
          <div class="el e grad card g1" style="--y:66px"><span class="av">AR</span><span><b>Graduate · BSc IT</b><small>Ready Jan 2027</small></span><span class="fit">4/4<small>skills</small></span></div>
          <div class="el e grad card g2" style="--y:142px"><span class="av">TJ</span><span><b>Graduate · BSc CS</b><small>Ready now</small></span><span class="fit">3/4<small>skills</small></span></div>
          <div class="el e grad card g3" style="--y:218px"><span class="av">NK</span><span><b>Graduate · BSc SE</b><small>Ready now</small></span><span class="fit">3/4<small>skills</small></span></div>
          <div class="el e evid card">
            <div class="eyebrow">Where each skill comes from</div>
            <div class="r"><span class="chip have">SQL</span><span class="src">Database Systems · A</span></div>
            <div class="r"><span class="chip have">Python</span><span class="src">GitHub · 2 repos</span></div>
            <div class="r"><span class="chip have">Excel</span><span class="src">Internship · 3 months</span></div>
          </div>

          <!-- ── STUDENT · 4 the AI Assistant helps with the gap ── -->
          <div class="el s chat card">
            <div class="hd"><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4Z"/></svg></i>AI Assistant<small>Skill Development</small></div>
            <div class="bub me">How do I learn REST APIs?</div>
            <div class="bub ai typing"><span class="dots"><b></b><b></b><b></b></span></div>
            <div class="bub ai full">Here is a 3-step plan:<ol><li>A free course, about 6 hours</li><li>Add an API to your Web Development project</li><li>Put it on your profile</li></ol></div>
          </div>
          <div class="el s gap">
            <div class="eyebrow">Your gap</div>
            <div class="swap"><span class="chip miss">REST APIs</span><span class="chip have">✓ REST APIs</span></div>
            <div class="now"><b><i class="n4">4</i><i class="n5">5</i></b><span>/6</span></div>
            <div class="was">skills this job asks for</div>
            <span class="plus">+4 more jobs open</span>
          </div>

          <!-- ── BOTH · 5 meet ── -->
          <svg class="el meetmap" viewBox="0 0 520 150" aria-hidden="true">
            <path d="M40 120 C150 30 220 150 260 82 S380 20 480 110" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
            <path d="M40 120 C150 30 220 150 260 82 S380 20 480 110" fill="none" stroke="#2557c4" stroke-opacity=".35" stroke-width="2" stroke-dasharray="3 6" stroke-linecap="round"/>
            <g class="pin you"><use href="#sm-grad" x="28" y="26" width="46" height="60"/><text x="51" y="104" text-anchor="middle" fill="#1d469f" font-family="Plus Jakarta Sans" font-weight="800" font-size="12">Graduate</text></g>
            <g class="pin emp"><use href="#sm-emp" x="446" y="26" width="46" height="60"/><text x="469" y="104" text-anchor="middle" fill="#0a6c62" font-family="Plus Jakarta Sans" font-weight="800" font-size="12">Employer</text></g>
            <g class="hello"><circle cx="260" cy="30" r="15" fill="#fff" stroke="#e3e6ee"/><path d="M252 30l5 5 11-11" fill="none" stroke="#13998c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>
          </svg>
          <div class="el app card">
            <div class="top"><span><b class="s-only">Graduate Software Engineer</b><b class="e-only">Graduate · BSc IT</b><small class="s-only">Your application</small><small class="e-only">Invited to Junior Data Analyst</small></span><span class="badge">Shortlisted</span></div>
            <div class="track"><span class="fill"></span><div style="--d:1s">Applied</div><div style="--d:1.6s">Viewed</div><div style="--d:2.2s">Shortlisted</div><div>Decided</div></div>
          </div>`
