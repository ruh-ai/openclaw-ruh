"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[GlobalError]", {
    message: error.message,
    digest: error.digest,
    timestamp: new Date().toISOString(),
    service: "agent-builder-ui",
  });

  return (
    <html>
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#fafaf8", color: "#1a1a1a" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
          <div style={{ maxWidth: "400px", textAlign: "center" }}>
            <div style={{
              width: "56px", height: "56px", borderRadius: "16px",
              background: "#fef2f2", border: "1px solid #fecaca",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px"
            }}>
              <span style={{ fontSize: "24px" }}>&#9888;&#65039;</span>
            </div>
            <h1 style={{ fontSize: "18px", fontWeight: "bold", margin: "0 0 8px" }}>
              Application Error
            </h1>
            <p style={{ fontSize: "14px", color: "#4b5563", margin: "0 0 20px" }}>
              A critical error occurred. Please try refreshing the page.
            </p>
            {error.digest && (
              <p style={{ fontSize: "10px", fontFamily: "monospace", color: "#8a8a8a", margin: "0 0 16px" }}>
                Error ID: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                padding: "10px 20px", fontSize: "14px", fontWeight: "bold",
                color: "white", background: "#ae00d0", border: "none",
                borderRadius: "8px", cursor: "pointer",
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
