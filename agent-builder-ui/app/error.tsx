"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ErrorBoundary]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack?.split("\n").slice(0, 5).join("\n"),
      timestamp: new Date().toISOString(),
      service: "agent-builder-ui",
    });
  }, [error]);

  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-base font-bold text-[#1a1a1a]">Something went wrong</h2>
        <p className="mt-2 text-sm text-[#4b5563]">
          An unexpected error occurred. You can try again or return to the home page.
        </p>
        {error.digest && (
          <p className="mt-1 text-[10px] font-mono text-[#8a8a8a]">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center gap-3 mt-5">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm font-medium text-white bg-[#ae00d0] rounded-lg hover:opacity-90 transition-colors"
          >
            Try Again
          </button>
          <a
            href="/"
            className="px-4 py-2 text-sm font-medium text-[#4b5563] border border-[#e5e7eb] rounded-lg hover:bg-[#f5f5f3] transition-colors"
          >
            Home
          </a>
        </div>
      </div>
    </div>
  );
}
