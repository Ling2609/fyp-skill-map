import api from '../../api'

// Start GitHub's sign-in (14 Oct, Connect GitHub); afterwards GitHub sends her to /github/callback, which comes back
// to `returnTo` (the pop-up she started from)
export async function startGithubConnect(returnTo) {
  const res = await api.get('/profile/github/connect-url')
  try { sessionStorage.setItem('githubReturn', returnTo) } catch { /* storage blocked: back to My Profile */ }
  window.location.href = res.data.url
}
