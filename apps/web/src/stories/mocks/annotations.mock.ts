import type { Annotation } from '@/api/generated/Api';

/**
 * First annotation — a marketing campaign event.
 * The date is set 10 days ago to appear in the middle of a 14-day chart.
 */
function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export const ANNOTATION_1: Annotation = {
  id: 'ann-1',
  project_id: 'proj-1',
  created_by: 'user-1',
  date: daysAgo(10),
  label: 'Marketing Campaign',
  description: 'Launched Q1 paid campaign across Google and social.',
  color: 'hsl(200 80% 60%)',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/** Second annotation — a feature launch event. */
export const ANNOTATION_2: Annotation = {
  id: 'ann-2',
  project_id: 'proj-1',
  created_by: 'user-1',
  date: daysAgo(5),
  label: 'New Feature Launch',
  description: 'Launched dark mode and improved onboarding flow.',
  color: 'hsl(120 60% 50%)',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/** Convenience array containing both annotations. */
export const ANNOTATIONS_PAIR: Annotation[] = [ANNOTATION_1, ANNOTATION_2];
