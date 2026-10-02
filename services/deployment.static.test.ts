import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import * as routeModule from '../app/api/cron/check/route';
import { MAX_CONCURRENCY } from './scheduler';

describe('Deployment Static Verification Tests (Phase 7E-D)', () => {
  const rootDir = process.cwd();

  // =========================================================================
  // STAT-001: Route Export Invariants
  // =========================================================================
  describe('STAT-001: Route Export Invariants', () => {
    it('exports POST and does not export GET, PUT, DELETE, or PATCH', () => {
      // Must export POST as an async function
      expect(typeof routeModule.POST).toBe('function');

      // Must NOT export other HTTP verbs (Next.js App Router method restriction)
      const moduleRecord = routeModule as Record<string, unknown>;
      expect(moduleRecord.GET).toBeUndefined();
      expect(moduleRecord.PUT).toBeUndefined();
      expect(moduleRecord.DELETE).toBeUndefined();
      expect(moduleRecord.PATCH).toBeUndefined();
    });
  });

  // =========================================================================
  // STAT-002: Concurrency Ceiling Constant
  // =========================================================================
  describe('STAT-002: Concurrency Ceiling Constant', () => {
    it('guarantees MAX_CONCURRENCY is strictly bounded at 5', () => {
      expect(MAX_CONCURRENCY).toBe(5);
    });
  });

  // =========================================================================
  // STAT-003: Absence of In-Process Background Schedulers
  // =========================================================================
  describe('STAT-003: Absence of In-Process Background Schedulers', () => {
    it('verifies scheduling code contains no setInterval or node-cron loops', () => {
      const schedulerPath = path.resolve(rootDir, 'services/scheduler.ts');
      const routePath = path.resolve(rootDir, 'app/api/cron/check/route.ts');

      const schedulerContent = fs.readFileSync(schedulerPath, 'utf8');
      const routeContent = fs.readFileSync(routePath, 'utf8');

      // Neither file may invoke setInterval
      expect(schedulerContent).not.toMatch(/\bsetInterval\s*\(/);
      expect(routeContent).not.toMatch(/\bsetInterval\s*\(/);

      // Neither file may import node-cron
      expect(schedulerContent).not.toMatch(/['"]node-cron['"]/);
      expect(routeContent).not.toMatch(/['"]node-cron['"]/);
    });
  });

  // =========================================================================
  // STAT-004: Absence of Unauthorized Queue and Lock Dependencies
  // =========================================================================
  describe('STAT-004: Absence of Unauthorized Queue and Lock Dependencies', () => {
    it('verifies package.json does not declare heavy queue or distributed lock libraries', () => {
      const packageJsonPath = path.resolve(rootDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      const allDeps = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
      };

      const forbidden = [
        'redis',
        'ioredis',
        'bullmq',
        'bull',
        'kafka-node',
        'kafkajs',
        'amqplib',
        'redlock',
        'node-cron',
      ];

      for (const pkg of forbidden) {
        expect(allDeps[pkg]).toBeUndefined();
      }
    });
  });

  // =========================================================================
  // STAT-005: Environment Variable & Secret Hygiene
  // =========================================================================
  describe('STAT-005: Environment Variable & Secret Hygiene', () => {
    it('verifies CRON_SECRET is loaded from process.env with zero hardcoded default fallback', () => {
      const routePath = path.resolve(rootDir, 'app/api/cron/check/route.ts');
      const routeContent = fs.readFileSync(routePath, 'utf8');

      // Must access process.env.CRON_SECRET
      expect(routeContent).toContain('process.env.CRON_SECRET');

      // Must NOT contain fallback defaults like: process.env.CRON_SECRET || 'secret' or ?? 'secret'
      expect(routeContent).not.toMatch(/process\.env\.CRON_SECRET\s*\|\|\s*['"][^'"]+['"]/);
      expect(routeContent).not.toMatch(/process\.env\.CRON_SECRET\s*\?\?\s*['"][^'"]+['"]/);
    });

    it('verifies .env.example documents DATABASE_URL and CRON_SECRET with safe placeholders', () => {
      const examplePath = path.resolve(rootDir, '.env.example');
      expect(fs.existsSync(examplePath)).toBe(true);

      const content = fs.readFileSync(examplePath, 'utf8');
      expect(content).toContain('DATABASE_URL=');
      expect(content).toContain('CRON_SECRET=');

      // Verify DATABASE_URL and CRON_SECRET are defined with empty placeholders
      expect(content).toMatch(/DATABASE_URL=\s*(\r?\n|$)/);
      expect(content).toMatch(/CRON_SECRET=\s*(\r?\n|$)/);
    });

    it('verifies .gitignore protects local environment files', () => {
      const gitignorePath = path.resolve(rootDir, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);

      const content = fs.readFileSync(gitignorePath, 'utf8');
      expect(content).toMatch(/\.env(\*\.local|\.local)/);
    });
  });
});
