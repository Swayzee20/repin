export default function HomePage() {
  return (
    <main>
      <h1>RepIn API</h1>
      <p>
        Health check: <a href="/api/health">/api/health</a>
      </p>
      <p>
        Database health check: <a href="/api/db-health">/api/db-health</a>
      </p>
      <p>Authenticated user: GET /api/me with a Supabase bearer token</p>
      <p>Groups: GET/POST /api/groups and GET /api/groups/:id</p>
      <p>Workouts: GET/POST /api/groups/:id/workouts</p>
      <p>Home: GET /api/home</p>
    </main>
  );
}
