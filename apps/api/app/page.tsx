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
    </main>
  );
}
