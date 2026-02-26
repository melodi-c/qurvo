import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { Event } from '@qurvo/clickhouse';
import { BaseScenario, type ScenarioOutput, type EventDefinitionInput, type PropertyDefinitionInput } from '../base.scenario';

interface Student {
  email: string;
  name: string;
  country: string;
  plan: 'free' | 'pro';
  age_group: '18-24' | '25-34' | '35-44';
  signup_date: Date;
}

interface Course {
  name: string;
  category: string;
  price: number;
  lessons: { number: number; title: string }[];
}

const COURSES: Course[] = [
  {
    name: 'Python для начинающих',
    category: 'programming',
    price: 49,
    lessons: [
      { number: 1, title: 'Введение в Python' },
      { number: 2, title: 'Переменные и типы данных' },
      { number: 3, title: 'Условия и циклы' },
      { number: 4, title: 'Функции' },
      { number: 5, title: 'Списки и словари' },
      { number: 6, title: 'Файлы и исключения' },
      { number: 7, title: 'Итоговый проект' },
    ],
  },
  {
    name: 'Основы UX-дизайна',
    category: 'design',
    price: 79,
    lessons: [
      { number: 1, title: 'Что такое UX' },
      { number: 2, title: 'Исследование пользователей' },
      { number: 3, title: 'Wireframing' },
      { number: 4, title: 'Прототипирование' },
      { number: 5, title: 'Юзабилити-тестирование' },
      { number: 6, title: 'Итоговый проект' },
    ],
  },
  {
    name: 'Английский с нуля',
    category: 'languages',
    price: 39,
    lessons: [
      { number: 1, title: 'Алфавит и произношение' },
      { number: 2, title: 'Базовые фразы' },
      { number: 3, title: 'Present Simple' },
      { number: 4, title: 'Past Simple' },
      { number: 5, title: 'Числа и время' },
      { number: 6, title: 'Разговорная практика' },
      { number: 7, title: 'Итоговый тест' },
    ],
  },
];

const SOURCES = ['google', 'referral', 'direct'];
const PAGE_PATHS = [
  { path: '/', title: 'LearnFlow — главная' },
  { path: '/courses', title: 'Каталог курсов' },
  { path: '/courses/python', title: 'Python для начинающих' },
  { path: '/courses/ux-design', title: 'Основы UX-дизайна' },
  { path: '/courses/english', title: 'Английский с нуля' },
  { path: '/pricing', title: 'Тарифы' },
  { path: '/blog', title: 'Блог' },
  { path: '/about', title: 'О нас' },
  { path: '/dashboard', title: 'Личный кабинет' },
];

const REFERRERS = [
  'https://google.com',
  'https://yandex.ru',
  'https://t.me/learnflow',
  '',
  '',
  '',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

@Injectable()
export class OnlineSchoolScenario extends BaseScenario {
  getScenarioName(): string {
    return 'online_school';
  }

  async generate(projectId: string): Promise<ScenarioOutput> {
    const events: Event[] = [];
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;

    // Build 18 students
    const students: Student[] = this.buildStudents(now);

    const eventNames = new Set<string>();
    const propertyNames = new Set<string>();

    const addEvent = (
      student: Student,
      eventName: string,
      timestamp: Date,
      properties: Record<string, string | number | boolean | null>,
    ) => {
      eventNames.add(eventName);
      Object.keys(properties).forEach((k) => propertyNames.add(k));

      const userProps: Record<string, string | number | boolean | null> = {
        name: student.name,
        email: student.email,
        country: student.country,
        plan: student.plan,
        age_group: student.age_group,
        signup_date: student.signup_date.toISOString(),
      };

      events.push({
        event_id: randomUUID(),
        project_id: projectId,
        person_id: this.makePersonId(projectId, student.email),
        distinct_id: student.email,
        event_name: eventName,
        event_type: 'custom',
        properties: JSON.stringify(properties),
        user_properties: JSON.stringify(userProps),
        timestamp: timestamp.toISOString(),
        sdk_name: 'demo',
        sdk_version: '1.0.0',
      });
    };

    // Track enrollment per student for funnel
    const enrolledCourses = new Map<string, Course[]>();

    for (const student of students) {
      enrolledCourses.set(student.email, []);

      const signupTs = student.signup_date;
      const source = pick(SOURCES);

      // --- signed_up ---
      addEvent(student, 'signed_up', this.jitter(signupTs, 0.5), {
        source,
        plan: student.plan,
      });

      // Pageviews before signup (1-3 pageviews before signing up)
      const preSignupPageviews = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < preSignupPageviews; i++) {
        const page = pick(PAGE_PATHS);
        const ts = new Date(signupTs.getTime() - (preSignupPageviews - i) * 30 * 60 * 1000);
        addEvent(student, '$pageview', ts, {
          page_path: page.path,
          page_title: page.title,
          referrer: pick(REFERRERS),
        });
      }

      // Post-signup pageviews spread over 60 days
      const postPageviewCount = 5 + Math.floor(Math.random() * 8);
      const postDates = this.spreadOverDays(postPageviewCount, 60);
      for (const d of postDates) {
        if (d <= signupTs) continue;
        const page = pick(PAGE_PATHS);
        addEvent(student, '$pageview', this.jitter(d, 2), {
          page_path: page.path,
          page_title: page.title,
          referrer: pick(REFERRERS),
        });
      }

      // ~85% of signed_up → course_viewed
      if (Math.random() < 0.85) {
        // View 1-3 courses
        const viewCount = 1 + Math.floor(Math.random() * 3);
        const viewedCourses = [...COURSES].sort(() => Math.random() - 0.5).slice(0, viewCount);

        for (const course of viewedCourses) {
          const viewTs = new Date(signupTs.getTime() + (1 + Math.floor(Math.random() * 5)) * dayMs);
          addEvent(student, 'course_viewed', this.jitter(viewTs, 2), {
            course_name: course.name,
            category: course.category,
            price: course.price,
          });

          // ~45% of course_viewed → course_enrolled
          if (Math.random() < 0.45) {
            const enrollTs = addMinutes(viewTs, 10 + Math.floor(Math.random() * 60));
            addEvent(student, 'course_enrolled', enrollTs, {
              course_name: course.name,
              category: course.category,
              price: course.price,
            });

            // payment_made on enrollment (for paid courses)
            if (course.price > 0 && Math.random() < 0.85) {
              addEvent(student, 'payment_made', addMinutes(enrollTs, 2), {
                amount: course.price,
                currency: 'USD',
                course_name: course.name,
              });
            }

            enrolledCourses.get(student.email)!.push(course);

            // ~60% of enrolled → lesson completions
            if (Math.random() < 0.6) {
              const completedLessons = Math.ceil(course.lessons.length * (0.4 + Math.random() * 0.6));
              let lessonTs = addMinutes(enrollTs, 30 + Math.floor(Math.random() * 120));

              for (let li = 0; li < Math.min(completedLessons, course.lessons.length); li++) {
                const lesson = course.lessons[li];

                // lesson_started
                addEvent(student, 'lesson_started', lessonTs, {
                  course_name: course.name,
                  lesson_number: lesson.number,
                  lesson_title: lesson.title,
                });

                // lesson_completed (after some minutes)
                const durationSeconds = 600 + Math.floor(Math.random() * 2400);
                const completedTs = addMinutes(lessonTs, Math.ceil(durationSeconds / 60));
                addEvent(student, 'lesson_completed', completedTs, {
                  course_name: course.name,
                  lesson_number: lesson.number,
                  duration_seconds: durationSeconds,
                });

                // quiz_taken for some lessons
                if (Math.random() < 0.5) {
                  const score = Math.floor(Math.random() * 100);
                  addEvent(student, 'quiz_taken', addMinutes(completedTs, 5), {
                    course_name: course.name,
                    score,
                    passed: score >= 60,
                  });
                }

                // Move to next lesson: 1-3 days later
                lessonTs = new Date(lessonTs.getTime() + (1 + Math.floor(Math.random() * 3)) * dayMs);
              }

              // ~35% of lesson_completed → certificate_earned
              if (completedLessons >= course.lessons.length && Math.random() < 0.35) {
                const completionTimeDays = Math.floor(
                  (lessonTs.getTime() - enrollTs.getTime()) / dayMs,
                );
                addEvent(student, 'certificate_earned', this.jitter(lessonTs, 1), {
                  course_name: course.name,
                  completion_time_days: Math.max(1, completionTimeDays),
                });
              }
            }
          }
        }
      }

      // ~25% of free users upgrade to pro
      if (student.plan === 'free' && Math.random() < 0.25) {
        const upgradeTs = new Date(
          signupTs.getTime() + (7 + Math.floor(Math.random() * 30)) * dayMs,
        );
        const amount = pickWeighted([9.99, 19.99, 49.99], [2, 3, 1]);
        addEvent(student, 'subscription_upgraded', upgradeTs, {
          from_plan: 'free',
          to_plan: 'pro',
          amount,
        });
        // Update plan in student object so future events reflect upgrade
        student.plan = 'pro';
      }
    }

    // Build definitions
    const definitions: EventDefinitionInput[] = Array.from(eventNames).map((name) => ({
      eventName: name,
    }));

    const propertyDefinitions: PropertyDefinitionInput[] = Array.from(propertyNames).map((name) => ({
      eventName: '', // cross-event property
      propertyName: name,
    }));

    return { events, definitions, propertyDefinitions };
  }

  private buildStudents(now: Date): Student[] {
    const countries = ['RU', 'US', 'DE', 'BR', 'TR'];
    const ageGroups: Student['age_group'][] = ['18-24', '25-34', '35-44'];
    const firstNames = [
      'Алексей', 'Maria', 'Hans', 'Carlos', 'Elif',
      'Ирина', 'Jennifer', 'Klaus', 'Ana', 'Mehmet',
      'Дмитрий', 'Sarah', 'Petra', 'Lucas', 'Ayse',
      'Olga', 'Michael', 'Diego',
    ];
    const lastNames = [
      'Petrov', 'Silva', 'Mueller', 'Santos', 'Yilmaz',
      'Ivanova', 'Johnson', 'Fischer', 'Ferreira', 'Kaya',
      'Smirnov', 'Williams', 'Schneider', 'Oliveira', 'Celik',
      'Kozlova', 'Brown', 'Gomez',
    ];

    const dayMs = 24 * 60 * 60 * 1000;

    return Array.from({ length: 18 }, (_, i) => {
      const firstName = firstNames[i % firstNames.length];
      const lastName = lastNames[i % lastNames.length];
      const country = countries[i % countries.length];
      const email = `${firstName.toLowerCase().replace(/[^a-z]/g, '')}.${lastName.toLowerCase()}@example.com`;
      const plan: 'free' | 'pro' = i < 14 ? 'free' : 'pro';
      const age_group = ageGroups[i % ageGroups.length];
      // Spread signups over 60 days
      const daysAgo = 5 + Math.floor((i / 18) * 55) + Math.floor(Math.random() * 5);
      const signup_date = new Date(now.getTime() - daysAgo * dayMs);

      return { email, name: `${firstName} ${lastName}`, country, plan, age_group, signup_date };
    });
  }
}
