import type { PathTransition, TopPath } from '@/api/generated/Api';

// ── Few-nodes fixture ─────────────────────────────────────────────────────────
// 3 steps: Landing → [Product, Blog] → [Sign Up, Contact]

export const FEW_TRANSITIONS: PathTransition[] = [
  { step: 0, source: '/', target: '/product', person_count: 420 },
  { step: 0, source: '/', target: '/blog', person_count: 180 },
  { step: 1, source: '/product', target: '/signup', person_count: 210 },
  { step: 1, source: '/product', target: '/contact', person_count: 90 },
  { step: 1, source: '/blog', target: '/signup', person_count: 60 },
  { step: 1, source: '/blog', target: '/contact', person_count: 40 },
];

export const FEW_TOP_PATHS: TopPath[] = [
  { path: ['/', '/product', '/signup'], person_count: 210 },
  { path: ['/', '/product', '/contact'], person_count: 90 },
  { path: ['/', '/blog', '/signup'], person_count: 60 },
  { path: ['/', '/blog', '/contact'], person_count: 40 },
];

// ── Many-nodes fixture ────────────────────────────────────────────────────────
// 4 steps with many branches — stresses the Sankey layout engine.

export const MANY_TRANSITIONS: PathTransition[] = [
  { step: 0, source: '/', target: '/features', person_count: 800 },
  { step: 0, source: '/', target: '/pricing', person_count: 600 },
  { step: 0, source: '/', target: '/blog', person_count: 400 },
  { step: 0, source: '/', target: '/docs', person_count: 300 },
  { step: 0, source: '/', target: '/about', person_count: 150 },

  { step: 1, source: '/features', target: '/pricing', person_count: 320 },
  { step: 1, source: '/features', target: '/signup', person_count: 200 },
  { step: 1, source: '/features', target: '/docs', person_count: 180 },
  { step: 1, source: '/features', target: '/contact', person_count: 100 },
  { step: 1, source: '/pricing', target: '/signup', person_count: 280 },
  { step: 1, source: '/pricing', target: '/features', person_count: 140 },
  { step: 1, source: '/pricing', target: '/contact', person_count: 80 },
  { step: 1, source: '/blog', target: '/features', person_count: 160 },
  { step: 1, source: '/blog', target: '/pricing', person_count: 120 },
  { step: 1, source: '/blog', target: '/docs', person_count: 90 },
  { step: 1, source: '/docs', target: '/signup', person_count: 110 },
  { step: 1, source: '/docs', target: '/features', person_count: 90 },
  { step: 1, source: '/about', target: '/contact', person_count: 70 },
  { step: 1, source: '/about', target: '/signup', person_count: 50 },

  { step: 2, source: '/signup', target: '/onboarding', person_count: 480 },
  { step: 2, source: '/signup', target: '/dashboard', person_count: 160 },
  { step: 2, source: '/pricing', target: '/signup', person_count: 200 },
  { step: 2, source: '/features', target: '/signup', person_count: 140 },
  { step: 2, source: '/docs', target: '/signup', person_count: 90 },
  { step: 2, source: '/contact', target: '/', person_count: 110 },

  { step: 3, source: '/onboarding', target: '/dashboard', person_count: 400 },
  { step: 3, source: '/onboarding', target: '/invite', person_count: 80 },
  { step: 3, source: '/dashboard', target: '/settings', person_count: 120 },
  { step: 3, source: '/dashboard', target: '/invite', person_count: 90 },
  { step: 3, source: '/signup', target: '/onboarding', person_count: 200 },
];

export const MANY_TOP_PATHS: TopPath[] = [
  {
    path: ['/', '/features', '/pricing', '/signup', '/onboarding', '/dashboard'],
    person_count: 320,
  },
  {
    path: ['/', '/pricing', '/signup', '/onboarding', '/dashboard'],
    person_count: 280,
  },
  {
    path: ['/', '/features', '/signup', '/onboarding', '/dashboard'],
    person_count: 200,
  },
  {
    path: ['/', '/docs', '/signup', '/onboarding', '/dashboard'],
    person_count: 110,
  },
  {
    path: ['/', '/blog', '/features', '/signup', '/onboarding'],
    person_count: 90,
  },
  {
    path: ['/', '/pricing', '/features', '/signup', '/onboarding'],
    person_count: 80,
  },
  {
    path: ['/', '/about', '/signup', '/onboarding', '/invite'],
    person_count: 50,
  },
];
