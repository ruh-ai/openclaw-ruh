#!/usr/bin/env python3
"""
memory-query.py — Query Hermes' vector memory with natural language.

Usage:
  python memory-query.py "auth failures in backend"
  python memory-query.py "what does prasanjit prefer" --type preference
  python memory-query.py "frontend agent issues" --agent frontend --top-k 3
"""

import argparse
import json
import os
import sys

try:
    from google import genai
    from google.genai import types
    import chromadb
except ImportError:
    print("Missing deps. Run: pip install google-genai chromadb")
    sys.exit(1)

COLLECTION = "hermes-memory"
DB_PATH = os.path.expanduser("~/.claude/vector-db")
DIM = 1536


def main():
    parser = argparse.ArgumentParser(description="Query Hermes' vector memory.")
    parser.add_argument("question", help="Natural language query")
    parser.add_argument("--type", default=None,
                        choices=["pattern", "pitfall", "preference", "decision", "debug", "refinement", "score"],
                        help="Filter by memory type")
    parser.add_argument("--agent", default=None, help="Filter by agent name")
    parser.add_argument("--top-k", type=int, default=5, help="Number of results")
    parser.add_argument("--json", action="store_true", dest="as_json", help="Output as JSON")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not set")
        sys.exit(1)

    client = genai.Client(api_key=api_key)
    chroma = chromadb.PersistentClient(path=DB_PATH)

    try:
        collection = chroma.get_collection(name=COLLECTION)
    except Exception:
        print(f"No memories yet. Collection '{COLLECTION}' doesn't exist.")
        print("Hermes will create memories as it works.")
        sys.exit(0)

    count = collection.count()
    if count == 0:
        print("No memories stored yet.")
        sys.exit(0)

    # Embed the query
    result = client.models.embed_content(
        model="gemini-embedding-2-preview",
        contents=args.question,
        config=types.EmbedContentConfig(output_dimensionality=DIM),
    )

    # Build where filter
    where = {}
    conditions = []
    if args.type:
        conditions.append({"type": args.type})
    if args.agent:
        conditions.append({"agent": args.agent})

    if len(conditions) == 1:
        where = conditions[0]
    elif len(conditions) > 1:
        where = {"$and": conditions}

    query_args = {
        "query_embeddings": [result.embeddings[0].values],
        "n_results": min(args.top_k, count),
        "include": ["documents", "metadatas", "distances"],
    }
    if where:
        query_args["where"] = where

    results = collection.query(**query_args)

    if not results["documents"][0]:
        print("No matching memories found.")
        sys.exit(0)

    if args.as_json:
        entries = []
        for doc, meta, dist in zip(results["documents"][0], results["metadatas"][0], results["distances"][0]):
            entries.append({
                "text": doc,
                "type": meta.get("type"),
                "agent": meta.get("agent"),
                "tags": meta.get("tags"),
                "created": meta.get("created"),
                "similarity": round(1 - dist, 3),
            })
        print(json.dumps(entries, indent=2))
    else:
        print(f"Query: {args.question}")
        print(f"Memories: {count} total")
        print("=" * 60)
        for i, (doc, meta, dist) in enumerate(zip(
            results["documents"][0], results["metadatas"][0], results["distances"][0]
        )):
            similarity = 1 - dist
            print(f"\n[{i+1}] ({meta.get('type', '?')}) {doc}")
            print(f"    Agent: {meta.get('agent', '?')}  |  Tags: {meta.get('tags', '-')}  |  Created: {meta.get('created', '?')[:10]}")
            print(f"    Similarity: {similarity:.3f}")


if __name__ == "__main__":
    main()
