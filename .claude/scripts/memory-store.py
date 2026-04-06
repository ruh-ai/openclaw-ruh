#!/usr/bin/env python3
"""
memory-store.py — Store a text memory into ChromaDB for Hermes.

Usage:
  python memory-store.py "learned that auth middleware silently swallows 403s" \
    --type pitfall --agent backend --tags "auth,middleware"

Types: pattern, pitfall, preference, decision, debug, refinement, score
"""

import argparse
import os
import sys
import hashlib
from datetime import datetime

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
    parser = argparse.ArgumentParser(description="Store a text memory for Hermes.")
    parser.add_argument("text", help="The memory text to store")
    parser.add_argument("--type", required=True,
                        choices=["pattern", "pitfall", "preference", "decision", "debug", "refinement", "score"],
                        help="Memory type")
    parser.add_argument("--agent", default="hermes", help="Which agent this is about")
    parser.add_argument("--tags", default="", help="Comma-separated tags")
    parser.add_argument("--task", default="", help="Task context that produced this memory")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not set")
        sys.exit(1)

    client = genai.Client(api_key=api_key)
    chroma = chromadb.PersistentClient(path=DB_PATH)
    collection = chroma.get_or_create_collection(
        name=COLLECTION,
        metadata={"hnsw:space": "cosine"},
    )

    # Embed the memory text
    result = client.models.embed_content(
        model="gemini-embedding-2-preview",
        contents=args.text,
        config=types.EmbedContentConfig(output_dimensionality=DIM),
    )

    # Generate a stable ID from content + type
    doc_id = hashlib.sha256(f"{args.type}:{args.text}".encode()).hexdigest()[:16]
    now = datetime.now().isoformat()

    metadata = {
        "type": args.type,
        "agent": args.agent,
        "tags": args.tags,
        "task": args.task,
        "created": now,
        "source": "hermes",
    }

    collection.upsert(
        embeddings=[result.embeddings[0].values],
        documents=[args.text],
        metadatas=[metadata],
        ids=[doc_id],
    )

    print(f"Stored [{args.type}] memory (id={doc_id})")
    print(f"  Agent: {args.agent}")
    print(f"  Tags: {args.tags or '(none)'}")
    print(f"  Total memories: {collection.count()}")


if __name__ == "__main__":
    main()
