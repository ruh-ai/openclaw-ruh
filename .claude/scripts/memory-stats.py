#!/usr/bin/env python3
"""
memory-stats.py — Show stats about Hermes' vector memory.

Usage: python memory-stats.py [--full]
"""

import argparse
import os
import sys
from collections import Counter

try:
    import chromadb
except ImportError:
    print("Missing deps. Run: pip install chromadb")
    sys.exit(1)

COLLECTION = "hermes-memory"
DB_PATH = os.path.expanduser("~/.claude/vector-db")


def main():
    parser = argparse.ArgumentParser(description="Hermes memory stats.")
    parser.add_argument("--full", action="store_true", help="Show all memories")
    args = parser.parse_args()

    chroma = chromadb.PersistentClient(path=DB_PATH)

    try:
        collection = chroma.get_collection(name=COLLECTION)
    except Exception:
        print("No memories yet.")
        sys.exit(0)

    count = collection.count()
    if count == 0:
        print("No memories stored.")
        sys.exit(0)

    # Get all memories
    all_data = collection.get(include=["documents", "metadatas"])

    type_counts = Counter()
    agent_counts = Counter()
    tag_counts = Counter()

    for meta in all_data["metadatas"]:
        type_counts[meta.get("type", "unknown")] += 1
        agent_counts[meta.get("agent", "unknown")] += 1
        for tag in meta.get("tags", "").split(","):
            tag = tag.strip()
            if tag:
                tag_counts[tag] += 1

    print(f"Hermes Memory Store")
    print(f"{'=' * 40}")
    print(f"Total memories: {count}")
    print()

    print("By type:")
    for t, c in type_counts.most_common():
        print(f"  {t:15s} {c}")

    print("\nBy agent:")
    for a, c in agent_counts.most_common():
        print(f"  {a:15s} {c}")

    if tag_counts:
        print("\nTop tags:")
        for t, c in tag_counts.most_common(10):
            print(f"  {t:15s} {c}")

    if args.full:
        print(f"\n{'=' * 40}")
        print("All memories:\n")
        for doc, meta in zip(all_data["documents"], all_data["metadatas"]):
            print(f"  [{meta.get('type', '?')}] {doc[:100]}")
            print(f"    agent={meta.get('agent', '?')}  tags={meta.get('tags', '-')}  created={meta.get('created', '?')[:10]}")
            print()


if __name__ == "__main__":
    main()
