/**
 * Decision log — canonical Zod schemas exposed for cross-module reuse.
 *
 * The DecisionType enum is referenced by the pipeline manifest (binding
 * the type to a metadata schema) and by any future module that wants to
 * validate against the canonical decision-type list. We keep the runtime
 * source of truth in `DECISION_TYPES` (types.ts) and build the schema
 * around it so adding a type to the union automatically extends the
 * schema.
 */

import { z } from "zod";
import type { DecisionType } from "./types";
import { DECISION_TYPES } from "./types";

/**
 * Zod enum over every canonical DecisionType. Rejects typos at parse time.
 * The cast is the standard zod pattern for building an enum out of a
 * runtime const array.
 */
export const DecisionTypeSchema = z.enum(
  DECISION_TYPES as unknown as readonly [DecisionType, ...DecisionType[]],
);

const _check: z.infer<typeof DecisionTypeSchema> extends DecisionType
  ? true
  : false = true;
void _check;
