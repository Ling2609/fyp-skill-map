export default function Dashboard() {
  const logout = () => {
    localStorage.removeItem('token')
    window.location.href = '/login'
  }
  return (
    <div style={{ maxWidth: 600, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h2>Dashboard</h2>
      <p>You are logged in. Sprint 2 coming soon.</p>
      <button onClick={logout}>Logout</button>
    </div>
  )
}