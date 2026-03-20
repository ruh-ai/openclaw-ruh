---
name: clawhub-search
version: 1.0.0
description: "Search ClawHub and skills.sh for existing OpenClaw skills by keyword."
user-invocable: false
metadata:
  openclaw:
    requires:
      bins: [curl]
---

# ClawHub Search

Search ClawHub (2857+ skills) and skills.sh (57000+ skills) for matching capabilities.

## Usage
1. Extract 2-5 keywords from capability description
2. Search: curl https://hub.openclaw.dev/api/skills/search?q=keywords
3. Search: curl https://skills.sh/api/search?q=keywords
4. Return top results with name, downloads, rating, required env vars
