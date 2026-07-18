import type { AppConfig } from './env.js';

export type TaskClass = 'fast' | 'balanced' | 'deep';

export interface ModelTiers {
  fast: string;
  balanced: string;
  deep: string;
}

/** Map a task class to a model id (design §6). */
export function routeModel(taskClass: TaskClass, tiers: ModelTiers): string {
  return tiers[taskClass];
}

/** Derive the model tiers from app config. */
export function modelTiersFromConfig(config: AppConfig): ModelTiers {
  return { fast: config.MODEL_FAST, balanced: config.MODEL_BALANCED, deep: config.MODEL_DEEP };
}
