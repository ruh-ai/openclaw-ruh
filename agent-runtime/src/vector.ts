/**
 * Vector store — embedded vector search using SQLite.
 *
 * Stores embeddings as binary BLOBs (Float32Array) in a vectors table.
 * Search is brute-force cosine similarity — fast enough for per-agent scale
 * (thousands of vectors, not millions).
 *
 * Usage:
 *   import { vectorStore } from "./vector";
 *   await vectorStore.upsert("memory", "conv-123", "User prefers dark mode", embedding);
 *   const results = vectorStore.search("memory", queryEmbedding, 5);
 */

import { getDb } from "./db";

// ── Types ───────────────────────────────────────────────────────────────────

export interface VectorRecord {
  id: string;
  collection: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SearchResult extends VectorRecord {
  score: number;
}

// ── Math ────────────────────────────────────────────────────────────────────

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function toBuffer(arr: Float32Array | number[]): Buffer {
  const f32 = arr instanceof Float32Array ? arr : new Float32Array(arr);
  return Buffer.from(f32.buffer);
}

function fromBuffer(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

// ── Store ───────────────────────────────────────────────────────────────────

export const vectorStore = {
  /**
   * Insert or update a vector in a collection.
   */
  upsert(
    collection: string,
    id: string,
    content: string,
    embedding: Float32Array | number[],
    metadata: Record<string, unknown> = {},
  ): void {
    const db = getDb();
    db.prepare(
      `INSERT INTO vectors (id, collection, content, embedding, metadata)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         content = excluded.content,
         embedding = excluded.embedding,
         metadata = excluded.metadata,
         created_at = datetime('now')`,
    ).run(id, collection, content, toBuffer(embedding), JSON.stringify(metadata));
  },

  /**
   * Search a collection by cosine similarity.
   */
  search(
    collection: string,
    queryEmbedding: Float32Array | number[],
    topK = 5,
    minScore = 0.0,
  ): SearchResult[] {
    const db = getDb();
    const query = queryEmbedding instanceof Float32Array
      ? queryEmbedding
      : new Float32Array(queryEmbedding);

    const rows = db
      .prepare("SELECT id, collection, content, embedding, metadata, created_at FROM vectors WHERE collection = ?")
      .all(collection) as Array<{
        id: string;
        collection: string;
        content: string;
        embedding: Buffer;
        metadata: string;
        created_at: string;
      }>;

    const scored = rows
      .map((row) => ({
        id: row.id,
        collection: row.collection,
        content: row.content,
        metadata: JSON.parse(row.metadata) as Record<string, unknown>,
        created_at: row.created_at,
        score: cosineSimilarity(query, fromBuffer(row.embedding)),
      }))
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  },

  /**
   * Delete a vector by ID.
   */
  delete(id: string): void {
    getDb().prepare("DELETE FROM vectors WHERE id = ?").run(id);
  },

  /**
   * Delete all vectors in a collection.
   */
  deleteCollection(collection: string): void {
    getDb().prepare("DELETE FROM vectors WHERE collection = ?").run(collection);
  },

  /**
   * Count vectors in a collection (or all collections).
   */
  count(collection?: string): number {
    const db = getDb();
    if (collection) {
      return (db.prepare("SELECT COUNT(*) as count FROM vectors WHERE collection = ?").get(collection) as { count: number }).count;
    }
    return (db.prepare("SELECT COUNT(*) as count FROM vectors").get() as { count: number }).count;
  },

  /**
   * List all collections with their vector counts.
   */
  collections(): Array<{ collection: string; count: number }> {
    return getDb()
      .prepare("SELECT collection, COUNT(*) as count FROM vectors GROUP BY collection")
      .all() as Array<{ collection: string; count: number }>;
  },
};
