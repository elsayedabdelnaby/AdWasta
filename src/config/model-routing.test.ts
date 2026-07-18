import { describe, it, expect } from 'vitest';
import { routeModel } from './model-routing.js';

const models = { fast: 'm-fast', balanced: 'm-balanced', deep: 'm-deep' };

describe('routeModel (design §6)', () => {
  it('routes each task class to its configured model', () => {
    expect(routeModel('fast', models)).toBe('m-fast');
    expect(routeModel('balanced', models)).toBe('m-balanced');
    expect(routeModel('deep', models)).toBe('m-deep');
  });
});
