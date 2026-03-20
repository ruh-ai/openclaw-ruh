#!/usr/bin/env python3
"""telegram_report_sender

Sends the daily narrative to Telegram.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List

import requests


def main(argv: List[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--text", required=True)
    args = ap.parse_args(argv)

    token = os.environ.get("TELEGRAM_BOT_TOKEN") or ""
    chat_id = os.environ.get("TELEGRAM_CHAT_ID") or ""

    out: Dict[str, Any] = {"run_id": args.run_id, "ok": False}

    if not token or not chat_id:
        out["error"] = "Missing TELEGRAM_BOT_TOKEN and/or TELEGRAM_CHAT_ID"
        print(json.dumps(out))
        return 0

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {"chat_id": chat_id, "text": args.text, "disable_web_page_preview": True}

    try:
        resp = requests.post(url, json=payload, timeout=30)
        out["status_code"] = resp.status_code
        try:
            out["telegram"] = resp.json()
        except Exception:
            out["telegram"] = {"raw": resp.text}
        out["ok"] = resp.status_code < 400 and bool(out.get("telegram", {}).get("ok", True))
    except Exception as e:
        out["error"] = str(e)

    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
