import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { Event } from '@qurvo/clickhouse';
import {
  BaseScenario,
  type ScenarioOutput,
  type EventDefinitionInput,
  type PropertyDefinitionInput,
  type DashboardInput,
  type InsightInput,
  type WidgetInput,
  type CohortInput,
  type MarketingChannelInput,
  type AdSpendInput,
} from '../base.scenario';

interface Student {
  email: string;
  name: string;
  country: string;
  plan: 'free' | 'pro';
  age_group: '18-24' | '25-34' | '35-44';
  signup_date: Date;
  device_type: string;
  browser: string;
  os: string;
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

const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'];
const BROWSERS = ['Chrome', 'Firefox', 'Safari', 'Edge'];
const OSES = ['Windows', 'macOS', 'Linux', 'iOS', 'Android'];

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

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgoDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
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

    const addEvent = (
      student: Student,
      eventName: string,
      timestamp: Date,
      properties: Record<string, string | number | boolean | null>,
    ) => {

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

    // Session state tracker per student: {sessionId, lastPageviewTs}
    const studentSessions = new Map<string, { sessionId: string; lastTs: number }>();
    const SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes

    /**
     * Adds a $pageview event with proper top-level ClickHouse columns
     * (session_id, page_path, page_title, referrer, url, device_type, browser, os, country).
     * Also adds a $pageleave event after a simulated dwell time (30–300s) to
     * populate session duration and bounce-rate calculations.
     */
    const addPageviewEvent = (
      student: Student,
      page: { path: string; title: string },
      referrer: string,
      timestamp: Date,
    ) => {
      const userProps: Record<string, string | number | boolean | null> = {
        name: student.name,
        email: student.email,
        country: student.country,
        plan: student.plan,
        age_group: student.age_group,
        signup_date: student.signup_date.toISOString(),
      };

      // Resolve or create session based on 30-minute idle window
      const tsMs = timestamp.getTime();
      const existing = studentSessions.get(student.email);
      let sessionId: string;
      if (!existing || tsMs - existing.lastTs > SESSION_IDLE_MS) {
        sessionId = randomUUID();
      } else {
        sessionId = existing.sessionId;
      }
      studentSessions.set(student.email, { sessionId, lastTs: tsMs });

      const url = `https://learnflow.example.com${page.path}`;

      events.push({
        event_id: randomUUID(),
        project_id: projectId,
        person_id: this.makePersonId(projectId, student.email),
        distinct_id: student.email,
        event_name: '$pageview',
        event_type: 'custom',
        session_id: sessionId,
        page_path: page.path,
        page_title: page.title,
        referrer,
        url,
        device_type: student.device_type,
        browser: student.browser,
        os: student.os,
        country: student.country,
        properties: JSON.stringify({}),
        user_properties: JSON.stringify(userProps),
        timestamp: timestamp.toISOString(),
        sdk_name: 'demo',
        sdk_version: '1.0.0',
      });

      // $pageleave after 30–300 seconds dwell time
      const dwellSeconds = 30 + Math.floor(Math.random() * 270);
      const leaveTs = new Date(tsMs + dwellSeconds * 1000);
      // Update last session timestamp to reflect the pageleave time
      studentSessions.set(student.email, { sessionId, lastTs: leaveTs.getTime() });

      events.push({
        event_id: randomUUID(),
        project_id: projectId,
        person_id: this.makePersonId(projectId, student.email),
        distinct_id: student.email,
        event_name: '$pageleave',
        event_type: 'custom',
        session_id: sessionId,
        page_path: page.path,
        page_title: page.title,
        referrer,
        url,
        device_type: student.device_type,
        browser: student.browser,
        os: student.os,
        country: student.country,
        properties: JSON.stringify({}),
        user_properties: JSON.stringify(userProps),
        timestamp: leaveTs.toISOString(),
        sdk_name: 'demo',
        sdk_version: '1.0.0',
      });
    };

    // Track latest user properties per student (updated as plan may change)
    const studentLatestProps = new Map<string, Record<string, unknown>>();
    const updateStudentProps = (student: Student) => {
      studentLatestProps.set(student.email, {
        name: student.name,
        email: student.email,
        country: student.country,
        plan: student.plan,
        age_group: student.age_group,
        signup_date: student.signup_date.toISOString(),
      });
    };

    // Track enrollment per student for funnel
    const enrolledCourses = new Map<string, Course[]>();

    for (const student of students) {
      enrolledCourses.set(student.email, []);
      // Record initial person properties
      updateStudentProps(student);

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
        addPageviewEvent(student, page, pick(REFERRERS), ts);
      }

      // Post-signup pageviews spread over 60 days
      const postPageviewCount = 5 + Math.floor(Math.random() * 8);
      const postDates = this.spreadOverDays(postPageviewCount, 60);
      for (const d of postDates) {
        if (d <= signupTs) continue;
        const page = pick(PAGE_PATHS);
        addPageviewEvent(student, page, pick(REFERRERS), this.jitter(d, 2));
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
        // Update person properties after plan change
        updateStudentProps(student);
      }
    }

    // Build definitions with explicit descriptions
    const definitions: EventDefinitionInput[] = [
      { eventName: '$pageview', description: 'Просмотр страницы пользователем' },
      { eventName: '$pageleave', description: 'Уход пользователя со страницы' },
      { eventName: 'signed_up', description: 'Регистрация нового пользователя на платформе' },
      { eventName: 'course_viewed', description: 'Просмотр страницы курса' },
      { eventName: 'course_enrolled', description: 'Запись пользователя на курс' },
      { eventName: 'payment_made', description: 'Успешная оплата курса или подписки' },
      { eventName: 'lesson_started', description: 'Начало просмотра урока' },
      { eventName: 'lesson_completed', description: 'Завершение урока пользователем' },
      { eventName: 'quiz_taken', description: 'Прохождение теста после урока' },
      { eventName: 'certificate_earned', description: 'Получение сертификата об окончании курса' },
      { eventName: 'subscription_upgraded', description: 'Переход пользователя на более высокий тарифный план' },
    ];

    const propertyDefinitions: PropertyDefinitionInput[] = [
      { eventName: '', propertyName: 'source', description: 'Источник привлечения пользователя (google, referral, direct)' },
      { eventName: '', propertyName: 'plan', description: 'Тарифный план пользователя (free или pro)' },
      { eventName: '', propertyName: 'page_path', description: 'Путь страницы, которую просмотрел пользователь' },
      { eventName: '', propertyName: 'page_title', description: 'Заголовок просмотренной страницы' },
      { eventName: '', propertyName: 'referrer', description: 'URL источника перехода на страницу' },
      { eventName: '', propertyName: 'course_name', description: 'Название курса' },
      { eventName: '', propertyName: 'category', description: 'Категория курса (programming, design, languages)' },
      { eventName: '', propertyName: 'price', description: 'Цена курса в долларах США' },
      { eventName: '', propertyName: 'amount', description: 'Сумма платежа' },
      { eventName: '', propertyName: 'currency', description: 'Валюта платежа (например, USD)' },
      { eventName: '', propertyName: 'lesson_number', description: 'Порядковый номер урока в курсе' },
      { eventName: '', propertyName: 'lesson_title', description: 'Название урока' },
      { eventName: '', propertyName: 'duration_seconds', description: 'Длительность просмотра урока в секундах' },
      { eventName: '', propertyName: 'score', description: 'Результат теста в процентах (0–100)' },
      { eventName: '', propertyName: 'passed', description: 'Признак успешной сдачи теста (порог — 60 баллов)' },
      { eventName: '', propertyName: 'completion_time_days', description: 'Количество дней от записи до получения сертификата' },
      { eventName: '', propertyName: 'from_plan', description: 'Предыдущий тарифный план до апгрейда' },
      { eventName: '', propertyName: 'to_plan', description: 'Новый тарифный план после апгрейда' },
    ];

    // Build persons and personDistinctIds from students
    const persons = students.map((student) => ({
      id: this.makePersonId(projectId, student.email),
      properties: studentLatestProps.get(student.email) ?? {},
      created_at: student.signup_date,
    }));

    const personDistinctIds = students.map((student) => ({
      personId: this.makePersonId(projectId, student.email),
      distinctId: student.email,
    }));

    // Date range for insights configs: last 60 days
    const dateFrom = formatDate(daysAgoDate(60));
    const dateTo = formatDate(now);

    // ── Insights ──────────────────────────────────────────────────────────────

    const insightDauId = randomUUID();
    const insightNewUsersId = randomUUID();
    const insightRevenueId = randomUUID();
    const insightLessonActivityId = randomUUID();
    const insightFunnelId = randomUUID();
    const insightRetentionWeeklyId = randomUUID();
    const insightLifecycleId = randomUUID();
    const insightStickinessId = randomUUID();
    const insightPathsId = randomUUID();
    const insightCourseEnrollmentsId = randomUUID();

    const insights: InsightInput[] = [
      {
        id: insightDauId,
        type: 'trend',
        name: 'Активные пользователи (DAU)',
        description: 'Уникальные пользователи, выполнявшие любое действие за день',
        config: {
          type: 'trend',
          series: [{ event_name: '$pageview', label: 'Активные пользователи' }],
          metric: 'unique_users',
          granularity: 'day',
          chart_type: 'line',
          date_from: dateFrom,
          date_to: dateTo,
          compare: false,
        },
        is_favorite: true,
      },
      {
        id: insightNewUsersId,
        type: 'trend',
        name: 'Новые регистрации',
        description: 'Количество новых регистраций за период',
        config: {
          type: 'trend',
          series: [{ event_name: 'signed_up', label: 'Регистрации' }],
          metric: 'total_events',
          granularity: 'day',
          chart_type: 'bar',
          date_from: dateFrom,
          date_to: dateTo,
          compare: false,
        },
        is_favorite: true,
      },
      {
        id: insightRevenueId,
        type: 'trend',
        name: 'Выручка (payment_made)',
        description: 'Суммарный объём платежей за неделю',
        config: {
          type: 'trend',
          series: [{ event_name: 'payment_made', label: 'Выручка' }],
          metric: 'property_sum',
          metric_property: 'properties.amount',
          granularity: 'week',
          chart_type: 'bar',
          date_from: dateFrom,
          date_to: dateTo,
          compare: false,
        },
        is_favorite: true,
      },
      {
        id: insightLessonActivityId,
        type: 'trend',
        name: 'Активность по урокам',
        description: 'Начатые и завершённые уроки за неделю',
        config: {
          type: 'trend',
          series: [
            { event_name: 'lesson_started', label: 'Начато уроков' },
            { event_name: 'lesson_completed', label: 'Завершено уроков' },
          ],
          metric: 'total_events',
          granularity: 'week',
          chart_type: 'line',
          date_from: dateFrom,
          date_to: dateTo,
          compare: false,
        },
      },
      {
        id: insightCourseEnrollmentsId,
        type: 'trend',
        name: 'Записи на курсы по категориям',
        description: 'Количество записей на курсы с разбивкой по категориям',
        config: {
          type: 'trend',
          series: [{ event_name: 'course_enrolled', label: 'Записи' }],
          metric: 'total_events',
          granularity: 'week',
          chart_type: 'bar',
          breakdown_property: 'category',
          breakdown_type: 'property',
          date_from: dateFrom,
          date_to: dateTo,
          compare: false,
        },
      },
      {
        id: insightFunnelId,
        type: 'funnel',
        name: 'Воронка регистрации и оплаты',
        description: 'Конверсия от просмотра страницы до оплаты',
        config: {
          type: 'funnel',
          steps: [
            { event_name: '$pageview', label: 'Просмотр страницы' },
            { event_name: 'signed_up', label: 'Регистрация' },
            { event_name: 'course_enrolled', label: 'Запись на курс' },
            { event_name: 'payment_made', label: 'Оплата' },
          ],
          conversion_window_days: 14,
          date_from: dateFrom,
          date_to: dateTo,
        },
        is_favorite: true,
      },
      {
        id: insightRetentionWeeklyId,
        type: 'retention',
        name: 'Недельное удержание (signed_up)',
        description: 'Удержание пользователей неделя за неделей после регистрации',
        config: {
          type: 'retention',
          target_event: 'signed_up',
          retention_type: 'first_time',
          granularity: 'week',
          periods: 8,
          date_from: dateFrom,
          date_to: dateTo,
        },
        is_favorite: true,
      },
      {
        id: insightLifecycleId,
        type: 'lifecycle',
        name: 'Жизненный цикл активности по урокам',
        description: 'Новые, возвращающиеся, воскресающие и неактивные учащиеся на основе lesson_started',
        config: {
          type: 'lifecycle',
          target_event: 'lesson_started',
          granularity: 'week',
          date_from: dateFrom,
          date_to: dateTo,
        },
      },
      {
        id: insightStickinessId,
        type: 'stickiness',
        name: 'Вовлечённость в обучение',
        description: 'Сколько дней в неделю пользователи начинают уроки',
        config: {
          type: 'stickiness',
          target_event: 'lesson_started',
          granularity: 'week',
          date_from: dateFrom,
          date_to: dateTo,
        },
      },
      {
        id: insightPathsId,
        type: 'paths',
        name: 'Пути после регистрации',
        description: 'Что делают пользователи после регистрации',
        config: {
          type: 'paths',
          date_from: dateFrom,
          date_to: dateTo,
          step_limit: 5,
          start_event: 'signed_up',
        },
      },
    ];

    // ── Dashboards ────────────────────────────────────────────────────────────

    const dashboardOverviewId = randomUUID();
    const dashboardFunnelId = randomUUID();
    const dashboardAcquisitionId = randomUUID();

    const dashboards: DashboardInput[] = [
      { id: dashboardOverviewId, name: 'Обзор' },
      { id: dashboardFunnelId, name: 'Анализ воронок' },
      { id: dashboardAcquisitionId, name: 'Привлечение' },
    ];

    // ── Widgets ───────────────────────────────────────────────────────────────

    const widgets: WidgetInput[] = [
      // Overview dashboard
      { dashboardId: dashboardOverviewId, insightId: insightDauId, layout: { x: 0, y: 0, w: 6, h: 4 } },
      { dashboardId: dashboardOverviewId, insightId: insightNewUsersId, layout: { x: 6, y: 0, w: 6, h: 4 } },
      { dashboardId: dashboardOverviewId, insightId: insightRevenueId, layout: { x: 0, y: 4, w: 6, h: 4 } },
      { dashboardId: dashboardOverviewId, insightId: insightLessonActivityId, layout: { x: 6, y: 4, w: 6, h: 4 } },
      { dashboardId: dashboardOverviewId, insightId: insightRetentionWeeklyId, layout: { x: 0, y: 8, w: 12, h: 5 } },
      // Funnel Analysis dashboard
      { dashboardId: dashboardFunnelId, insightId: insightFunnelId, layout: { x: 0, y: 0, w: 12, h: 5 } },
      { dashboardId: dashboardFunnelId, insightId: insightLifecycleId, layout: { x: 0, y: 5, w: 6, h: 4 } },
      { dashboardId: dashboardFunnelId, insightId: insightStickinessId, layout: { x: 6, y: 5, w: 6, h: 4 } },
      { dashboardId: dashboardFunnelId, insightId: insightPathsId, layout: { x: 0, y: 9, w: 12, h: 5 } },
      // Acquisition dashboard
      { dashboardId: dashboardAcquisitionId, insightId: insightNewUsersId, layout: { x: 0, y: 0, w: 6, h: 4 } },
      { dashboardId: dashboardAcquisitionId, insightId: insightCourseEnrollmentsId, layout: { x: 6, y: 0, w: 6, h: 4 } },
      { dashboardId: dashboardAcquisitionId, insightId: insightRevenueId, layout: { x: 0, y: 4, w: 12, h: 4 } },
    ];

    // ── Cohorts ───────────────────────────────────────────────────────────────

    const cohorts: CohortInput[] = [
      {
        id: randomUUID(),
        name: 'Pro-пользователи',
        description: 'Пользователи на тарифе Pro',
        definition: {
          type: 'AND',
          values: [
            {
              type: 'person_property',
              property: 'plan',
              operator: 'eq',
              value: 'pro',
            },
          ],
        },
      },
      {
        id: randomUUID(),
        name: 'Завершили курс',
        description: 'Пользователи, получившие хотя бы один сертификат',
        definition: {
          type: 'AND',
          values: [
            {
              type: 'event',
              event_name: 'certificate_earned',
              count_operator: 'gte',
              count: 1,
              time_window_days: 90,
            },
          ],
        },
      },
      {
        id: randomUUID(),
        name: 'Зарегистрировались за 30 дней',
        description: 'Пользователи, зарегистрировавшиеся за последние 30 дней',
        definition: {
          type: 'AND',
          values: [
            {
              type: 'first_time_event',
              event_name: 'signed_up',
              time_window_days: 30,
            },
          ],
        },
      },
      {
        id: randomUUID(),
        name: 'Платящие пользователи',
        description: 'Пользователи, совершившие хотя бы один платёж',
        definition: {
          type: 'AND',
          values: [
            {
              type: 'event',
              event_name: 'payment_made',
              count_operator: 'gte',
              count: 1,
              time_window_days: 90,
            },
          ],
        },
      },
      {
        id: randomUUID(),
        name: 'Отток',
        description: 'Зарегистрировались 14+ дней назад и не начинали урок 7+ дней',
        definition: {
          type: 'AND',
          values: [
            {
              type: 'first_time_event',
              event_name: 'signed_up',
              time_window_days: 14,
            },
            {
              type: 'not_performed_event',
              event_name: 'lesson_started',
              time_window_days: 7,
            },
          ],
        },
      },
    ];

    // ── Marketing Channels ────────────────────────────────────────────────────

    const channelGoogleId = randomUUID();
    const channelFacebookId = randomUUID();
    const channelOrganicId = randomUUID();
    const channelReferralId = randomUUID();

    const marketingChannels: MarketingChannelInput[] = [
      { id: channelGoogleId, name: 'Google Реклама', channel_type: 'google_ads', color: '#4285F4' },
      { id: channelFacebookId, name: 'Facebook Реклама', channel_type: 'facebook_ads', color: '#1877F2' },
      { id: channelOrganicId, name: 'Органика', channel_type: 'manual', color: '#34A853' },
      { id: channelReferralId, name: 'Реферальный', channel_type: 'manual', color: '#FBBC04' },
    ];

    // ── Ad Spend: 60 days of data ─────────────────────────────────────────────

    const adSpend: AdSpendInput[] = [];

    // Realistic daily spend ranges per channel
    const channelSpendConfig = [
      {
        channelId: channelGoogleId,
        baseAmount: 120,
        variance: 40,
        weekendMultiplier: 0.7,
      },
      {
        channelId: channelFacebookId,
        baseAmount: 85,
        variance: 25,
        weekendMultiplier: 0.8,
      },
      {
        channelId: channelOrganicId,
        baseAmount: 0,
        variance: 0,
        weekendMultiplier: 1,
      },
      {
        channelId: channelReferralId,
        baseAmount: 20,
        variance: 15,
        weekendMultiplier: 1,
      },
    ];

    for (let dayOffset = 59; dayOffset >= 0; dayOffset--) {
      const d = new Date(now);
      d.setDate(d.getDate() - dayOffset);
      const spendDate = formatDate(d);
      const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      for (const cfg of channelSpendConfig) {
        if (cfg.baseAmount === 0) continue; // Organic has no paid spend

        const multiplier = isWeekend ? cfg.weekendMultiplier : 1;
        const jitterAmount = (Math.random() - 0.5) * 2 * cfg.variance;
        const amount = Math.max(0, cfg.baseAmount * multiplier + jitterAmount);

        if (amount > 0) {
          adSpend.push({
            channelId: cfg.channelId,
            spend_date: spendDate,
            amount: amount.toFixed(2),
            currency: 'USD',
          });
        }
      }
    }

    return {
      events,
      definitions,
      propertyDefinitions,
      persons,
      personDistinctIds,
      dashboards,
      insights,
      widgets,
      cohorts,
      marketingChannels,
      adSpend,
    };
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
      const device_type = DEVICE_TYPES[i % DEVICE_TYPES.length];
      const browser = BROWSERS[i % BROWSERS.length];
      const os = OSES[i % OSES.length];

      return { email, name: `${firstName} ${lastName}`, country, plan, age_group, signup_date, device_type, browser, os };
    });
  }
}
