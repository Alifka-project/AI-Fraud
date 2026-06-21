"use client";

// Catches errors in the root layout itself. Must render its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#f0f4fa",
          color: "#0a1f3d",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: 480 }}>
          <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>
            InvestorShield UAE
          </h1>
          <p style={{ color: "#475569", marginBottom: "1.5rem" }}>
            A critical error occurred. Please reload the application.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "linear-gradient(135deg,#0a1f3d,#0d9488)",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "0.7rem 1.4rem",
              fontSize: "0.95rem",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error?.digest ? (
            <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: "#94a3b8" }}>
              Ref: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
