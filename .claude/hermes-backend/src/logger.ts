/**
 * Hermes backend logger — structured JSON logging via @ruh/logger (Pino).
 *
 * Usage:
 *   import { logger } from './logger';          // root logger
 *   import { workers } from './logger';          // module loggers
 *
 *   logger.info('Starting up...');
 *   workers.info({ count: 6 }, 'Workers started');
 */

import { createLogger, createModuleLogger } from '@ruh/logger';

export const logger = createLogger({ service: 'hermes-backend' });

// Module-scoped child loggers — one per subsystem
export const workers   = createModuleLogger(logger, 'workers');
export const memory    = createModuleLogger(logger, 'memory');
export const sync      = createModuleLogger(logger, 'sync');
export const circuit   = createModuleLogger(logger, 'circuit');
export const linear    = createModuleLogger(logger, 'linear-sync');
export const evolution = createModuleLogger(logger, 'evolution');
export const learning  = createModuleLogger(logger, 'learning');
export const analyst   = createModuleLogger(logger, 'analyst');
export const factory   = createModuleLogger(logger, 'factory');
export const execution = createModuleLogger(logger, 'execution');
export const ingestion = createModuleLogger(logger, 'ingestion');
export const strategist = createModuleLogger(logger, 'strategist');
export const skills    = createModuleLogger(logger, 'skills');
