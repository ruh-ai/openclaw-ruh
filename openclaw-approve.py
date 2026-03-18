#!/usr/bin/env python3
"""
Approve pending OpenClaw device pairing requests for a Daytona sandbox.

Usage:
  python3 openclaw-approve.py <sandbox-id>

Polls for pending pairing requests and approves them as they arrive.
Press Ctrl+C to stop.
"""

import os
import sys
import time
from dotenv import load_dotenv

load_dotenv()

try:
    from daytona import Daytona, DaytonaConfig
except ImportError:
    print("ERROR: daytona SDK not installed. Run: pip install daytona")
    sys.exit(1)

DAYTONA_API_KEY = "dtn_b0e5d224fa81949ea928de53347a08ca0228b7cb09b9b72996508b27546b594f"
DAYTONA_API_URL = "https://app.daytona.io/api"


def main() -> None:
    if not DAYTONA_API_KEY:
        print("ERROR: DAYTONA_API_KEY not set in environment or .env")
        sys.exit(1)

    if len(sys.argv) < 2:
        print("Usage: python3 openclaw-approve.py <sandbox-id>")
        sys.exit(1)

    sandbox_id = sys.argv[1]

    config = DaytonaConfig(api_key=DAYTONA_API_KEY, api_url=DAYTONA_API_URL)
    daytona = Daytona(config)
    sandbox = daytona.get(sandbox_id)

    print(f"Connected to sandbox: {sandbox_id}")
    print("Watching for pending device pairing requests... (Ctrl+C to stop)\n")

    approved_ids: set[str] = set()

    try:
        while True:
            result = sandbox.process.exec("openclaw devices approve --latest 2>&1")
            output = result.result.strip()

            if "Approved" in output:
                # Extract the device ID from "Approved <device_id> (<request_id>)"
                for line in output.splitlines():
                    if "Approved" in line and line not in approved_ids:
                        approved_ids.add(line)
                        print(f"  [approved] {line}")
                        print("  → Click 'Connect' in the browser now.\n")

            time.sleep(3)
    except KeyboardInterrupt:
        print(f"\nStopped. Approved {len(approved_ids)} device(s) total.")


if __name__ == "__main__":
    main()
