from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


APP_URL = os.environ.get("RUH_APP_URL", "http://localhost:4001/#/login?redirect_url=/")
SCREENSHOT_PATH = Path(
    os.environ.get(
        "RUH_APP_SCREENSHOT",
        "/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/test-results/ruh-app-browser-startup.png",
    )
)


def main() -> int:
    errors: list[str] = []
    logs: list[dict[str, object]] = []
    failed_requests: list[dict[str, str]] = []
    dom_summary: dict[str, object] = {}

    with sync_playwright() as playwright:
      browser = playwright.chromium.launch(
          headless=True,
          executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      )
      page = browser.new_page(viewport={"width": 1440, "height": 1024})

      def handle_console(msg) -> None:
          entry = {"type": msg.type, "text": msg.text}
          logs.append(entry)
          text = msg.text or ""
          if "Uncaught error" in text or "Assertion failed" in text:
              errors.append(text)

      page.on("console", handle_console)
      page.on(
          "pageerror",
          lambda err: errors.append(f"pageerror: {err}"),
      )
      page.on(
          "requestfailed",
          lambda req: failed_requests.append(
              {
                  "url": req.url,
                  "error": req.failure.error_text if req.failure else "unknown",
              }
          ),
      )

      response = page.goto(APP_URL, wait_until="load", timeout=30000)
      page.wait_for_timeout(8000)
      dom_summary = page.evaluate(
          """
() => ({
  title: document.title,
  bodyText: document.body.innerText,
  hasFlutterView: !!document.querySelector('flutter-view'),
  flutterViews: document.querySelectorAll('flutter-view, flt-glass-pane, flt-semantics-host').length,
  inputs: document.querySelectorAll('input').length,
  buttons: document.querySelectorAll('button').length,
})
"""
      )
      SCREENSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
      page.screenshot(path=str(SCREENSHOT_PATH), full_page=True)
      browser.close()

    if not bool(dom_summary.get("hasFlutterView")):
        errors.append("No Flutter view was mounted in the browser page")

    report = {
        "url": APP_URL,
        "http_status": response.status if response else None,
        "errors": errors,
        "failed_requests": failed_requests,
        "dom_summary": dom_summary,
        "logs": logs,
        "screenshot": str(SCREENSHOT_PATH),
    }
    print(json.dumps(report, indent=2))

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
