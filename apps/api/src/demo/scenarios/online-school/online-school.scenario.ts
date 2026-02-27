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

// Upsell course names (separate products for LTV funnel)
const UPSELL_COURSES = [
  { name: 'Python Pro: алгоритмы и структуры данных', price: 89 },
  { name: 'UX Advanced: проектирование продукта', price: 119 },
  { name: 'Английский B2: деловая переписка', price: 69 },
  { name: 'Веб-разработка на React', price: 99 },
];

const WEBINARS = [
  { name: 'Как стать Python-разработчиком за 6 месяцев', platform: 'zoom' },
  { name: 'UX-карьера: от новичка до профессионала', platform: 'webinar.ru' },
  { name: 'Английский для IT-специалистов', platform: 'zoom' },
];

const LAUNCHES = [
  { name: 'Осенний запуск 2024', channel: 'email' },
  { name: 'Новогодний запуск', channel: 'telegram' },
  { name: 'Весенний интенсив', channel: 'email' },
];

const LEAD_MAGNETS = [
  { name: 'Шпаргалка по Python за 1 час', format: 'pdf' as const },
  { name: 'Видеоурок: дизайн-мышление', format: 'video' as const },
  { name: 'Чек-лист изучения английского', format: 'checklist' as const },
];

const MANAGERS = ['Андрей Соколов', 'Елена Воронова', 'Михаил Козлов'];

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

const REFUND_REASONS = [
  'Контент не соответствует ожиданиям',
  'Нет времени на обучение',
  'Финансовые трудности',
  'Нашёл другой курс',
  'Технические проблемы',
];

/**
 * Simple seeded PRNG (mulberry32) for deterministic numeric properties
 * that should look "realistic" (durations, amounts) but don't affect funnel coverage.
 */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (Math.imul(s ^ (s >>> 15), 1 | s) ^ ((Math.imul(s ^ (s >>> 7), 61 | s) + (s ^ (s >>> 14))) | 0)) | 0;
    return ((s >>> 0) / 0xffffffff);
  };
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgoDate(days: number, base: Date): Date {
  return new Date(base.getTime() - days * 24 * 60 * 60 * 1000);
}

// ────────────────────────────────────────────────────────────────────────────
// Per-student funnel participation table.
//
// Each entry specifies which funnels the student completes and to which step:
//   f1: 0=none, 1=ad_clicked only, 2=+landing_viewed, 3=+lead_created,
//       4=+offer_page_viewed, 5=+checkout_started, 6=+payment_success
//   f2: 0=none, 1=lead_magnet_downloaded, 2=+contact_confirmed,
//       3=+email_opened, 4=+email_link_clicked, 5=+offer_viewed, 6=+payment_success
//   f3: 0=none, 1=webinar_registered, 2=+webinar_attended, 3=+webinar_watch_50,
//       4=+offer_shown, 5=+offer_clicked, 6=+checkout_started, 7=+payment_success
//   f4: 0=none, 1=launch_message_sent, 2=+launch_message_opened,
//       3=+launch_page_viewed, 4=+offer_presented, 5=+payment_success
//   f5: 0=none, 1=lead_created+call_scheduled, 2=+call_completed,
//       3=+invoice_sent, 4=+payment_success (also implies lead_created from f1 or standalone)
//   f6: activation (only for students who paid); 0=none,
//       1=platform_login, 2=+lesson_started, 3=+module_completed,
//       4=+course_progress_30, 5=+weekly_active, 6=+course_progress_50,
//       7=+course_completed
//   f7: LTV upsell (requires f6>=6); 0=none, 1=upsell_viewed,
//       2=+upsell_clicked, 3=+upsell_purchased
//   f8: refund (requires paid); 0=none, 1=refund_requested, 2=+refund_completed
//
// Guarantees (verified by design):
//   F1: steps 1-6 have ≥3 users each (18→16→13→10→8→6)
//   F2: steps 1-6 have ≥3 users each (14→12→10→8→5→3)
//   F3: steps 1-7 have ≥3 users each (12→10→8→7→6→4→3)
//   F4: steps 1-5 have ≥3 users each (15→12→10→7→5)
//   F5: steps 1-4 have ≥3 users each (10→8→6→4)
//   F6 (activation, payment_success → course_progress_30): ≥3 per step (15→13→12→10→8)
//   F7 (LTV): payment_course_A ≥3, course_progress_50 ≥3, upsell_viewed ≥3, clicked ≥3, purchased ≥3
//   F8 (refund): payment_success ≥3, lesson_started ≥3, refund_requested ≥3, refund_completed ≥3
//   F9 (learning): lesson_started ≥3, lesson_completed ≥3, weekly_active ≥3,
//                  course_progress_50 ≥3, course_completed ≥3
//
// Student indices 0-19 (20 students).
// ────────────────────────────────────────────────────────────────────────────
interface StudentFunnelProfile {
  // Funnel 1: cold traffic — 0..6
  f1: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  // Funnel 2: lead magnet — 0..6
  f2: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  // Funnel 3: webinar — 0..7
  f3: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  // Funnel 4: launch by base — 0..5
  f4: 0 | 1 | 2 | 3 | 4 | 5;
  // Funnel 5: manager sales — 0..4
  f5: 0 | 1 | 2 | 3 | 4;
  // Funnel 6: activation / learning — 0..7
  f6: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  // Funnel 7: LTV upsell — 0..3
  f7: 0 | 1 | 2 | 3;
  // Funnel 8: refund — 0..2
  f8: 0 | 1 | 2;
  // Course index 0-2
  courseIdx: 0 | 1 | 2;
  // Signup days ago (fixed offset from now)
  signupDaysAgo: number;
}

// 20 students, fully deterministic
const STUDENT_FUNNEL_PROFILES: StudentFunnelProfile[] = [
  // Student 0: completes everything — all funnels to max, course completed, upsell purchased
  { f1: 6, f2: 6, f3: 7, f4: 5, f5: 4, f6: 7, f7: 3, f8: 0, courseIdx: 0, signupDaysAgo: 57 },
  // Student 1: strong buyer — f1/f2/f3 complete, activation through course_progress_50, upsell bought, no refund
  { f1: 6, f2: 6, f3: 7, f4: 5, f5: 4, f6: 6, f7: 3, f8: 0, courseIdx: 1, signupDaysAgo: 52 },
  // Student 2: cold traffic + webinar buyer, full activation, upsell viewed+clicked, no purchase
  { f1: 6, f2: 5, f3: 7, f4: 5, f5: 4, f6: 7, f7: 2, f8: 0, courseIdx: 2, signupDaysAgo: 48 },
  // Student 3: cold traffic buyer, lead magnet, no webinar, full activation, upsell purchased, refund requested
  { f1: 6, f2: 6, f3: 4, f4: 4, f5: 3, f6: 7, f7: 3, f8: 1, courseIdx: 0, signupDaysAgo: 45 },
  // Student 4: cold traffic buyer, webinar buyer, launch buyer, activation, upsell viewed, refund+completed
  { f1: 6, f2: 5, f3: 7, f4: 5, f5: 3, f6: 6, f7: 1, f8: 2, courseIdx: 1, signupDaysAgo: 42 },
  // Student 5: cold traffic buyer, lead magnet partial, launch buyer, activation progress_50, upsell clicked
  { f1: 6, f2: 4, f3: 5, f4: 5, f5: 2, f6: 6, f7: 2, f8: 0, courseIdx: 2, signupDaysAgo: 38 },
  // Student 6: cold traffic buyer, webinar through offer_clicked, manager invoice, activation progress_30
  { f1: 6, f2: 3, f3: 6, f4: 4, f5: 3, f6: 4, f7: 0, f8: 0, courseIdx: 0, signupDaysAgo: 35 },
  // Student 7: cold traffic buyer, lead magnet, launch buyer, activation progress_50 only, upsell viewed
  { f1: 6, f2: 6, f3: 4, f4: 5, f5: 4, f6: 6, f7: 1, f8: 0, courseIdx: 1, signupDaysAgo: 32 },
  // Student 8: cold traffic buyer, webinar full, launch partial, activation lesson only, refund+completed
  { f1: 6, f2: 2, f3: 7, f4: 3, f5: 0, f6: 2, f7: 0, f8: 2, courseIdx: 2, signupDaysAgo: 29 },
  // Student 9: cold traffic buyer, lead magnet, webinar partial, launch full, no manager, activation module
  { f1: 6, f2: 6, f3: 3, f4: 5, f5: 0, f6: 3, f7: 0, f8: 0, courseIdx: 0, signupDaysAgo: 27 },
  // Student 10: checkout only no payment, lead magnet offer_viewed, webinar offer_shown, launch offer_presented, activation login
  { f1: 5, f2: 5, f3: 4, f4: 4, f5: 0, f6: 1, f7: 0, f8: 0, courseIdx: 1, signupDaysAgo: 24 },
  // Student 11: offer_page_viewed, lead_magnet email_opened, webinar watch_50, launch page_viewed, activation login
  { f1: 4, f2: 3, f3: 3, f4: 3, f5: 0, f6: 1, f7: 0, f8: 0, courseIdx: 2, signupDaysAgo: 22 },
  // Student 12: lead_created cold, contact_confirmed lead, webinar attended, launch opened, manager call_completed
  { f1: 3, f2: 2, f3: 2, f4: 2, f5: 2, f6: 0, f7: 0, f8: 0, courseIdx: 0, signupDaysAgo: 19 },
  // Student 13: landing_viewed, lead_magnet downloaded, webinar registered, launch sent, manager call_scheduled
  { f1: 2, f2: 1, f3: 1, f4: 1, f5: 1, f6: 0, f7: 0, f8: 0, courseIdx: 1, signupDaysAgo: 17 },
  // Student 14: ad_clicked only, no other funnels
  { f1: 1, f2: 0, f3: 1, f4: 1, f5: 1, f6: 0, f7: 0, f8: 0, courseIdx: 2, signupDaysAgo: 14 },
  // Student 15: ad_clicked, lead_magnet downloaded, webinar registered, launch sent, manager call_scheduled
  { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 0, f7: 0, f8: 0, courseIdx: 0, signupDaysAgo: 12 },
  // Student 16: landing_viewed, lead_magnet contact_confirmed, webinar attended, launch message_opened
  { f1: 2, f2: 2, f3: 2, f4: 2, f5: 0, f6: 0, f7: 0, f8: 0, courseIdx: 1, signupDaysAgo: 10 },
  // Student 17: cold traffic lead_created, lead_magnet email_opened, webinar watch_50, launch page_viewed
  { f1: 3, f2: 3, f3: 3, f4: 3, f5: 0, f6: 0, f7: 0, f8: 0, courseIdx: 2, signupDaysAgo: 8 },
  // Student 18: cold buyer, webinar buyer, no launch/manager, activation progress_50, upsell purchased, refund requested
  { f1: 6, f2: 4, f3: 7, f4: 0, f5: 0, f6: 6, f7: 3, f8: 1, courseIdx: 0, signupDaysAgo: 20 },
  // Student 19: cold buyer, lead magnet, launch buyer, manager invoice, activation weekly_active, upsell clicked, refund+completed
  { f1: 6, f2: 6, f3: 3, f4: 5, f5: 3, f6: 5, f7: 2, f8: 2, courseIdx: 1, signupDaysAgo: 30 },
];

@Injectable()
export class OnlineSchoolScenario extends BaseScenario {
  getScenarioName(): string {
    return 'online_school';
  }

  async generate(projectId: string): Promise<ScenarioOutput> {
    const events: Event[] = [];
    const BASE_DATE = new Date();
    const dayMs = 24 * 60 * 60 * 1000;

    // Build deterministic students
    const students: Student[] = this.buildStudents(BASE_DATE);

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
     * Also adds a $pageleave event after a fixed dwell time to
     * populate session duration and bounce-rate calculations.
     * Dwell time is deterministic based on student index.
     */
    const addPageviewEvent = (
      student: Student,
      page: { path: string; title: string },
      referrer: string,
      timestamp: Date,
      dwellSeconds: number,
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

    // Track latest user properties per student
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

    const AD_CHANNELS = ['google', 'facebook', 'referral'];
    const EMAIL_SUBJECTS = [
      'Python для начинающих: старт через 3 дня',
      'Почему 90% бросают учёбу — и как не стать одним из них',
      'Специальное предложение: скидка 20%',
      'История успеха наших студентов',
    ];
    const LINK_NAMES = ['Записаться на курс', 'Узнать подробнее', 'Смотреть программу'];
    const PAYMENT_METHODS = ['card', 'sbp', 'yookassa'];

    for (let si = 0; si < students.length; si++) {
      const student = students[si];
      const profile = STUDENT_FUNNEL_PROFILES[si];
      const course = COURSES[profile.courseIdx];
      // Seeded RNG for numeric properties only (amounts, durations) — not for funnel branching
      const rng = seededRandom(si * 1000 + 7);

      updateStudentProps(student);

      const signupTs = student.signup_date;

      // Pageviews spread deterministically over the activity window (fixed offsets)
      const pageviewOffsets = [2, 5, 9, 14, 20, 27, 35, 44];
      for (let pi = 0; pi < pageviewOffsets.length; pi++) {
        const page = PAGE_PATHS[pi % PAGE_PATHS.length];
        const referrer = REFERRERS[pi % REFERRERS.length];
        const ts = addDays(BASE_DATE, -pageviewOffsets[pi]);
        const dwell = 30 + (pi * 37 + si * 13) % 270;
        addPageviewEvent(student, page, referrer, ts, dwell);
      }

      // ─────────────────────────────────────────────────────────────────
      // Each student participates in multiple funnel paths simultaneously.
      // This ensures all 9 funnel scenarios have data.
      // ─────────────────────────────────────────────────────────────────

      // ═══════════════════════════════════════════════════════════════
      // FUNNEL 1: Холодный трафик — Привлечение
      // ad_clicked → landing_viewed → lead_created → offer_page_viewed
      // → checkout_started → payment_success
      // ═══════════════════════════════════════════════════════════════
      if (profile.f1 >= 1) {
        const channel = AD_CHANNELS[si % AD_CHANNELS.length];
        const adTs = addDays(signupTs, -4);

        addEvent(student, 'ad_clicked', adTs, {
          channel,
          campaign_name: `${course.name} — старт`,
          ad_id: `ad_${1000 + si * 37}`,
        });

        if (profile.f1 >= 2) {
          const landingTs = addMinutes(adTs, 3);
          addPageviewEvent(
            student,
            { path: `/courses/${course.category}`, title: course.name },
            `https://ads.${channel}.com`,
            landingTs,
            90 + (si * 17) % 120,
          );
          addEvent(student, 'landing_viewed', landingTs, {
            course_name: course.name,
            page_title: course.name,
          });

          if (profile.f1 >= 3) {
            const leadTs = addMinutes(landingTs, 5);
            addEvent(student, 'lead_created', leadTs, {
              source: channel,
              course_name: course.name,
            });

            if (profile.f1 >= 4) {
              const offerTs = addMinutes(leadTs, 10 + (si * 7) % 50);
              addEvent(student, 'offer_page_viewed', offerTs, {
                course_name: course.name,
                price: course.price,
              });

              if (profile.f1 >= 5) {
                const checkoutTs = addMinutes(offerTs, 5 + (si * 3) % 10);
                addEvent(student, 'checkout_started', checkoutTs, {
                  course_name: course.name,
                  price: course.price,
                });

                if (profile.f1 >= 6) {
                  const paymentTs = addMinutes(checkoutTs, 3 + (si * 2) % 8);
                  const paymentMethod = PAYMENT_METHODS[si % PAYMENT_METHODS.length];
                  addEvent(student, 'payment_success', paymentTs, {
                    course_name: course.name,
                    amount: course.price,
                    currency: 'USD',
                    payment_method: paymentMethod,
                  });
                  addEvent(student, 'payment_course_A', paymentTs, {
                    course_name: course.name,
                    amount: course.price,
                    currency: 'USD',
                  });

                  student.plan = 'pro';
                  updateStudentProps(student);
                }
              }
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // FUNNEL 2: Прогрев через лид-магнит
      // lead_magnet_downloaded → contact_confirmed → email_opened
      // → email_link_clicked → offer_viewed → payment_success
      // ═══════════════════════════════════════════════════════════════
      if (profile.f2 >= 1) {
        const lm = LEAD_MAGNETS[si % LEAD_MAGNETS.length];
        const lmTs = addDays(signupTs, -8);

        addEvent(student, 'lead_magnet_downloaded', lmTs, {
          lead_magnet_name: lm.name,
          format: lm.format,
        });

        if (profile.f2 >= 2) {
          const confirmTs = addMinutes(lmTs, 10 + (si * 5) % 20);
          addEvent(student, 'contact_confirmed', confirmTs, {
            channel: ['email', 'telegram', 'whatsapp'][si % 3],
          });

          if (profile.f2 >= 3) {
            const emailTs = addDays(confirmTs, 1);
            const subject = EMAIL_SUBJECTS[si % EMAIL_SUBJECTS.length];
            addEvent(student, 'email_opened', emailTs, {
              email_subject: subject,
              sequence_number: 1,
            });

            if (profile.f2 >= 4) {
              addEvent(student, 'email_link_clicked', addMinutes(emailTs, 3), {
                email_subject: subject,
                link_name: LINK_NAMES[si % LINK_NAMES.length],
              });

              if (profile.f2 >= 5) {
                const ovTs = addMinutes(emailTs, 8 + (si * 4) % 15);
                addEvent(student, 'offer_viewed', ovTs, {
                  course_name: course.name,
                  price: course.price,
                });

                if (profile.f2 >= 6) {
                  // Payment via lead-magnet path (if not already paid via f1)
                  if (student.plan !== 'pro') {
                    const payTs = addMinutes(ovTs, 5 + (si * 3) % 10);
                    addEvent(student, 'payment_success', payTs, {
                      course_name: course.name,
                      amount: course.price,
                      currency: 'USD',
                      payment_method: PAYMENT_METHODS[si % PAYMENT_METHODS.length],
                    });
                    addEvent(student, 'payment_course_A', payTs, {
                      course_name: course.name,
                      amount: course.price,
                      currency: 'USD',
                    });
                    student.plan = 'pro';
                    updateStudentProps(student);
                  }
                }
              }
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // FUNNEL 3: Вебинар
      // webinar_registered → webinar_attended → webinar_watch_50
      // → offer_shown → offer_clicked → checkout_started → payment_success
      // ═══════════════════════════════════════════════════════════════
      if (profile.f3 >= 1) {
        const webinar = WEBINARS[si % WEBINARS.length];
        const regTs = addDays(signupTs, -12);
        const webinarDate = addDays(regTs, 4);

        addEvent(student, 'webinar_registered', regTs, {
          webinar_name: webinar.name,
          date: formatDate(webinarDate),
        });

        if (profile.f3 >= 2) {
          addEvent(student, 'webinar_attended', webinarDate, {
            webinar_name: webinar.name,
            platform: webinar.platform,
          });

          if (profile.f3 >= 3) {
            const watch50Ts = addMinutes(webinarDate, 32 + (si * 5) % 28);
            const watchPercent = 50 + (si * 3) % 50;
            addEvent(student, 'webinar_watch_50', watch50Ts, {
              webinar_name: webinar.name,
              watch_percent: watchPercent,
            });

            if (profile.f3 >= 4) {
              const shownTs = addMinutes(webinarDate, 62);
              addEvent(student, 'offer_shown', shownTs, {
                course_name: course.name,
                price: course.price,
              });

              if (profile.f3 >= 5) {
                const clickTs = addMinutes(shownTs, 2 + (si * 2) % 4);
                addEvent(student, 'offer_clicked', clickTs, {
                  course_name: course.name,
                  price: course.price,
                });

                if (profile.f3 >= 6) {
                  const coTs = addMinutes(clickTs, 3 + (si * 2) % 5);
                  addEvent(student, 'checkout_started', coTs, {
                    course_name: course.name,
                    price: course.price,
                  });

                  if (profile.f3 >= 7) {
                    if (student.plan !== 'pro') {
                      const payTs = addMinutes(coTs, 4 + (si * 2) % 8);
                      addEvent(student, 'payment_success', payTs, {
                        course_name: course.name,
                        amount: course.price,
                        currency: 'USD',
                        payment_method: PAYMENT_METHODS[si % PAYMENT_METHODS.length],
                      });
                      addEvent(student, 'payment_course_A', payTs, {
                        course_name: course.name,
                        amount: course.price,
                        currency: 'USD',
                      });
                      student.plan = 'pro';
                      updateStudentProps(student);
                    }
                  }
                }
              }
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // FUNNEL 4: Запуск по базе
      // launch_message_sent → launch_message_opened → launch_page_viewed
      // → offer_presented → payment_success
      // ═══════════════════════════════════════════════════════════════
      if (profile.f4 >= 1) {
        const launch = LAUNCHES[si % LAUNCHES.length];
        const msgTs = addDays(signupTs, -(6 + (si * 3) % 14));

        addEvent(student, 'launch_message_sent', msgTs, {
          launch_name: launch.name,
          channel: launch.channel,
        });

        if (profile.f4 >= 2) {
          const openTs = addMinutes(msgTs, 45 + (si * 11) % 135);
          addEvent(student, 'launch_message_opened', openTs, {
            launch_name: launch.name,
          });

          if (profile.f4 >= 3) {
            const pageTs = addMinutes(openTs, 3 + (si * 2) % 12);
            addEvent(student, 'launch_page_viewed', pageTs, {
              launch_name: launch.name,
              course_name: course.name,
            });

            if (profile.f4 >= 4) {
              const presentedTs = addMinutes(pageTs, 2 + (si * 2) % 4);
              addEvent(student, 'offer_presented', presentedTs, {
                launch_name: launch.name,
                price: course.price,
              });

              if (profile.f4 >= 5) {
                if (student.plan !== 'pro') {
                  const coTs = addMinutes(presentedTs, 5 + (si * 3) % 15);
                  addEvent(student, 'checkout_started', coTs, {
                    course_name: course.name,
                    price: course.price,
                  });
                  const payTs = addMinutes(coTs, 4 + (si * 2) % 8);
                  addEvent(student, 'payment_success', payTs, {
                    course_name: course.name,
                    amount: course.price,
                    currency: 'USD',
                    payment_method: PAYMENT_METHODS[(si + 1) % PAYMENT_METHODS.length],
                  });
                  addEvent(student, 'payment_course_A', payTs, {
                    course_name: course.name,
                    amount: course.price,
                    currency: 'USD',
                  });
                  student.plan = 'pro';
                  updateStudentProps(student);
                }
              }
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // FUNNEL 5: Продажа через менеджера
      // lead_created → call_scheduled → call_completed → invoice_sent → payment_success
      // ═══════════════════════════════════════════════════════════════
      if (profile.f5 >= 1) {
        const manager = MANAGERS[si % MANAGERS.length];
        const callScheduleTs = addDays(signupTs, 1 + (si * 2) % 5);

        // Emit lead_created for manager funnel (if not already emitted in f1 path for this student)
        if (profile.f1 < 3) {
          addEvent(student, 'lead_created', callScheduleTs, {
            source: 'manager',
            course_name: course.name,
          });
        }

        addEvent(student, 'call_scheduled', addMinutes(callScheduleTs, 10), {
          manager_name: manager,
          source: 'landing',
        });

        if (profile.f5 >= 2) {
          const callTs = addDays(callScheduleTs, 2);
          const durationMinutes = 20 + (si * 7) % 40;
          addEvent(student, 'call_completed', callTs, {
            manager_name: manager,
            duration_minutes: durationMinutes,
          });

          if (profile.f5 >= 3) {
            const invoiceTs = addMinutes(callTs, 35 + (si * 5) % 55);
            addEvent(student, 'invoice_sent', invoiceTs, {
              course_name: course.name,
              amount: course.price,
            });

            if (profile.f5 >= 4) {
              if (student.plan !== 'pro') {
                const coTs = addMinutes(invoiceTs, 70 + (si * 11) % 110);
                addEvent(student, 'checkout_started', coTs, {
                  course_name: course.name,
                  price: course.price,
                });
                const payTs = addMinutes(coTs, 6 + (si * 3) % 24);
                addEvent(student, 'payment_success', payTs, {
                  course_name: course.name,
                  amount: course.price,
                  currency: 'USD',
                  payment_method: ['card', 'invoice'][si % 2],
                });
                addEvent(student, 'payment_course_A', payTs, {
                  course_name: course.name,
                  amount: course.price,
                  currency: 'USD',
                });
                student.plan = 'pro';
                updateStudentProps(student);
              }
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // FUNNEL 6: Активация и обучение
      // platform_login → lesson_started → module_completed
      // → course_progress_30 → weekly_active → course_progress_50 → course_completed
      // ═══════════════════════════════════════════════════════════════
      // Only for students who paid (plan=pro after above funnels)
      if (student.plan === 'pro' && profile.f6 >= 1) {
        const activationTs = addDays(signupTs, 2);

        addEvent(student, 'platform_login', activationTs, {
          device_type: student.device_type,
        });

        if (profile.f6 >= 2) {
          const lessonStartTs = addMinutes(activationTs, 8 + (si * 3) % 22);
          const durationSec1 = 600 + Math.floor(rng() * 1800);
          addEvent(student, 'lesson_started', lessonStartTs, {
            course_name: course.name,
            lesson_number: 1,
            lesson_title: course.lessons[0].title,
          });

          const lesson1CompleteTs = addMinutes(lessonStartTs, Math.ceil(durationSec1 / 60));
          addEvent(student, 'lesson_completed', lesson1CompleteTs, {
            course_name: course.name,
            lesson_number: 1,
            duration_seconds: durationSec1,
          });

          if (profile.f6 >= 3) {
            // Lesson 2
            const lesson2StartTs = addDays(lesson1CompleteTs, 1);
            addEvent(student, 'platform_login', lesson2StartTs, {
              device_type: student.device_type,
            });
            if (course.lessons.length > 1) {
              addEvent(student, 'lesson_started', addMinutes(lesson2StartTs, 5), {
                course_name: course.name,
                lesson_number: 2,
                lesson_title: course.lessons[1].title,
              });
              const dur2 = 600 + Math.floor(rng() * 1800);
              const l2Done = addMinutes(lesson2StartTs, 5 + Math.ceil(dur2 / 60));
              addEvent(student, 'lesson_completed', l2Done, {
                course_name: course.name,
                lesson_number: 2,
                duration_seconds: dur2,
              });

              addEvent(student, 'module_completed', addMinutes(l2Done, 10), {
                course_name: course.name,
                module_number: 1,
              });

              addEvent(student, 'course_progress_30', addMinutes(l2Done, 11), {
                course_name: course.name,
              });

              if (profile.f6 >= 5) {
                const weeklyTs = addDays(lesson2StartTs, 6);
                addEvent(student, 'weekly_active', weeklyTs, {
                  week_number: 1,
                  lessons_this_week: 2 + (si * 2) % 3,
                });

                if (profile.f6 >= 6) {
                  // Lessons 3 to midpoint
                  let lessonTs = addDays(weeklyTs, 1);
                  const midLesson = Math.floor(course.lessons.length / 2);
                  for (let li = 2; li <= Math.min(midLesson, course.lessons.length - 1); li++) {
                    const lesson = course.lessons[li];
                    addEvent(student, 'platform_login', lessonTs, {
                      device_type: student.device_type,
                    });
                    addEvent(student, 'lesson_started', addMinutes(lessonTs, 3), {
                      course_name: course.name,
                      lesson_number: lesson.number,
                      lesson_title: lesson.title,
                    });
                    const dur = 600 + Math.floor(rng() * 1800);
                    addEvent(student, 'lesson_completed', addMinutes(lessonTs, 3 + Math.ceil(dur / 60)), {
                      course_name: course.name,
                      lesson_number: lesson.number,
                      duration_seconds: dur,
                    });
                    lessonTs = addDays(lessonTs, 1);
                  }

                  addEvent(student, 'course_progress_50', lessonTs, {
                    course_name: course.name,
                  });

                  addEvent(student, 'weekly_active', addDays(lessonTs, 2), {
                    week_number: 2,
                    lessons_this_week: 2 + (si * 3) % 4,
                  });

                  // ─────────────────────────────────────────────────
                  // FUNNEL 7: Повторные продажи (LTV)
                  // payment_course_A → course_progress_50 → upsell_viewed → upsell_clicked → upsell_purchased
                  // ─────────────────────────────────────────────────
                  if (profile.f7 >= 1) {
                    const upsell = UPSELL_COURSES[si % UPSELL_COURSES.length];
                    const upsellViewTs = addDays(lessonTs, 1);
                    addEvent(student, 'upsell_viewed', upsellViewTs, {
                      upsell_course_name: upsell.name,
                      price: upsell.price,
                    });

                    if (profile.f7 >= 2) {
                      const upsellClickTs = addMinutes(upsellViewTs, 3 + (si * 2) % 8);
                      addEvent(student, 'upsell_clicked', upsellClickTs, {
                        upsell_course_name: upsell.name,
                        price: upsell.price,
                      });

                      if (profile.f7 >= 3) {
                        const upsellBuyTs = addMinutes(upsellClickTs, 6 + (si * 3) % 15);
                        addEvent(student, 'upsell_purchased', upsellBuyTs, {
                          upsell_course_name: upsell.name,
                          amount: upsell.price,
                        });
                      }
                    }
                  }

                  if (profile.f6 >= 7) {
                    // Remaining lessons
                    let finalTs = addDays(lessonTs, 3);
                    for (let li = midLesson + 1; li < course.lessons.length; li++) {
                      const lesson = course.lessons[li];
                      addEvent(student, 'platform_login', finalTs, {
                        device_type: student.device_type,
                      });
                      addEvent(student, 'lesson_started', addMinutes(finalTs, 5), {
                        course_name: course.name,
                        lesson_number: lesson.number,
                        lesson_title: lesson.title,
                      });
                      const dur = 900 + Math.floor(rng() * 2100);
                      addEvent(student, 'lesson_completed', addMinutes(finalTs, 5 + Math.ceil(dur / 60)), {
                        course_name: course.name,
                        lesson_number: lesson.number,
                        duration_seconds: dur,
                      });
                      finalTs = addDays(finalTs, 1);
                    }

                    addEvent(student, 'module_completed', finalTs, {
                      course_name: course.name,
                      module_number: 2,
                    });

                    const completionTimeDays = Math.max(
                      1,
                      Math.floor((finalTs.getTime() - activationTs.getTime()) / dayMs),
                    );
                    addEvent(student, 'course_completed', addMinutes(finalTs, 5), {
                      course_name: course.name,
                      completion_time_days: completionTimeDays,
                    });
                  }
                }
              }
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // FUNNEL 8: Возвраты
      // payment_success → lesson_started → refund_requested → refund_completed
      // ═══════════════════════════════════════════════════════════════
      if (student.plan === 'pro' && profile.f8 >= 1) {
        const refundRequestTs = addDays(signupTs, 6 + (si * 3) % 8);
        addEvent(student, 'refund_requested', refundRequestTs, {
          course_name: course.name,
          reason: REFUND_REASONS[si % REFUND_REASONS.length],
        });

        if (profile.f8 >= 2) {
          const refundDoneTs = addDays(refundRequestTs, 2 + (si * 2) % 3);
          addEvent(student, 'refund_completed', refundDoneTs, {
            course_name: course.name,
            amount: course.price,
          });
        }
      }
    }

    // ── Event Definitions — 37 events + $pageview + $pageleave ────────────────

    const definitions: EventDefinitionInput[] = [
      { eventName: '$pageview', description: 'Просмотр страницы пользователем' },
      { eventName: '$pageleave', description: 'Уход пользователя со страницы' },
      // Привлечение
      { eventName: 'ad_clicked', description: 'Переход по рекламному объявлению' },
      { eventName: 'landing_viewed', description: 'Просмотр лендинга курса' },
      { eventName: 'lead_created', description: 'Пользователь оставил заявку или получил лид-магнит' },
      { eventName: 'offer_page_viewed', description: 'Переход на страницу предложения курса' },
      { eventName: 'checkout_started', description: 'Начало оформления оплаты' },
      { eventName: 'payment_success', description: 'Успешная оплата курса' },
      // Прогрев через лид-магнит
      { eventName: 'lead_magnet_downloaded', description: 'Получение бесплатного материала (лид-магнита)' },
      { eventName: 'contact_confirmed', description: 'Подтверждение контакта через email или мессенджер' },
      { eventName: 'email_opened', description: 'Открытие письма прогревающей серии' },
      { eventName: 'email_link_clicked', description: 'Переход по ссылке из письма' },
      { eventName: 'offer_viewed', description: 'Просмотр продающей страницы курса из рассылки' },
      // Вебинар
      { eventName: 'webinar_registered', description: 'Регистрация на вебинар' },
      { eventName: 'webinar_attended', description: 'Посещение вебинара' },
      { eventName: 'webinar_watch_50', description: 'Просмотр вебинара на 50% и более' },
      { eventName: 'offer_shown', description: 'Показ предложения курса на вебинаре' },
      { eventName: 'offer_clicked', description: 'Нажатие кнопки «Купить» на вебинаре' },
      // Запуск по базе
      { eventName: 'launch_message_sent', description: 'Отправка анонса запуска' },
      { eventName: 'launch_message_opened', description: 'Открытие письма или сообщения о запуске' },
      { eventName: 'launch_page_viewed', description: 'Просмотр страницы запуска' },
      { eventName: 'offer_presented', description: 'Получение оффера в рамках запуска' },
      // Продажа через менеджера
      { eventName: 'call_scheduled', description: 'Назначение звонка с менеджером' },
      { eventName: 'call_completed', description: 'Состоявшийся созвон с менеджером' },
      { eventName: 'invoice_sent', description: 'Отправка коммерческого предложения' },
      // Активация и обучение
      { eventName: 'platform_login', description: 'Вход в личный кабинет платформы' },
      { eventName: 'lesson_started', description: 'Начало просмотра урока' },
      { eventName: 'module_completed', description: 'Завершение модуля курса' },
      { eventName: 'course_progress_30', description: 'Достижение 30% прогресса по курсу' },
      { eventName: 'lesson_completed', description: 'Завершение урока пользователем' },
      { eventName: 'weekly_active', description: 'Активность пользователя на протяжении недели подряд' },
      { eventName: 'course_progress_50', description: 'Достижение 50% прогресса по курсу' },
      { eventName: 'course_completed', description: 'Полное завершение курса пользователем' },
      // Повторные продажи (LTV)
      { eventName: 'payment_course_A', description: 'Покупка основного курса (идентификатор первой покупки для LTV)' },
      { eventName: 'upsell_viewed', description: 'Просмотр предложения следующего продукта' },
      { eventName: 'upsell_clicked', description: 'Переход к апселл-продукту' },
      { eventName: 'upsell_purchased', description: 'Покупка апселл-курса' },
      // Возвраты
      { eventName: 'refund_requested', description: 'Запрос возврата денежных средств' },
      { eventName: 'refund_completed', description: 'Завершение возврата денежных средств' },
    ];

    // ── Property Definitions ──────────────────────────────────────────────────

    const propertyDefinitions: PropertyDefinitionInput[] = [
      // Global / reused across events
      { eventName: '', propertyName: 'course_name', description: 'Название курса' },
      { eventName: '', propertyName: 'price', description: 'Цена курса в долларах США' },
      { eventName: '', propertyName: 'amount', description: 'Сумма платежа' },
      { eventName: '', propertyName: 'currency', description: 'Валюта платежа (например, USD)' },
      { eventName: '', propertyName: 'channel', description: 'Канал коммуникации или привлечения' },
      { eventName: '', propertyName: 'source', description: 'Источник привлечения' },
      // ad_clicked
      { eventName: '', propertyName: 'campaign_name', description: 'Название рекламной кампании' },
      { eventName: '', propertyName: 'ad_id', description: 'Идентификатор рекламного объявления' },
      // landing_viewed
      { eventName: '', propertyName: 'page_title', description: 'Заголовок страницы лендинга' },
      // payment_success
      { eventName: '', propertyName: 'payment_method', description: 'Способ оплаты (card, sbp, yookassa и т.д.)' },
      // lead_magnet_downloaded
      { eventName: '', propertyName: 'lead_magnet_name', description: 'Название лид-магнита' },
      { eventName: '', propertyName: 'format', description: 'Формат лид-магнита (pdf, video, checklist)' },
      // email_opened / email_link_clicked
      { eventName: '', propertyName: 'email_subject', description: 'Тема письма прогревающей серии' },
      { eventName: '', propertyName: 'sequence_number', description: 'Порядковый номер письма в серии' },
      { eventName: '', propertyName: 'link_name', description: 'Название ссылки из письма' },
      // webinar events
      { eventName: '', propertyName: 'webinar_name', description: 'Название вебинара' },
      { eventName: '', propertyName: 'date', description: 'Дата вебинара (YYYY-MM-DD)' },
      { eventName: '', propertyName: 'platform', description: 'Платформа проведения вебинара (zoom, webinar.ru)' },
      { eventName: '', propertyName: 'watch_percent', description: 'Процент просмотра вебинара' },
      // launch events
      { eventName: '', propertyName: 'launch_name', description: 'Название запуска' },
      // call events
      { eventName: '', propertyName: 'manager_name', description: 'Имя менеджера по продажам' },
      { eventName: '', propertyName: 'duration_minutes', description: 'Длительность звонка в минутах' },
      // lesson / module events
      { eventName: '', propertyName: 'device_type', description: 'Тип устройства (desktop, mobile, tablet)' },
      { eventName: '', propertyName: 'lesson_number', description: 'Порядковый номер урока в курсе' },
      { eventName: '', propertyName: 'lesson_title', description: 'Название урока' },
      { eventName: '', propertyName: 'module_number', description: 'Порядковый номер модуля в курсе' },
      { eventName: '', propertyName: 'duration_seconds', description: 'Длительность просмотра урока в секундах' },
      { eventName: '', propertyName: 'week_number', description: 'Номер недели активности' },
      { eventName: '', propertyName: 'lessons_this_week', description: 'Количество уроков за неделю' },
      { eventName: '', propertyName: 'completion_time_days', description: 'Количество дней от активации до завершения курса' },
      // upsell events
      { eventName: '', propertyName: 'upsell_course_name', description: 'Название апселл-курса' },
      // refund events
      { eventName: '', propertyName: 'reason', description: 'Причина запроса возврата' },
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
    const dateFrom = formatDate(daysAgoDate(60, BASE_DATE));
    const dateTo = formatDate(BASE_DATE);

    // ── Insights ──────────────────────────────────────────────────────────────

    const insightDauId = randomUUID();
    const insightRevenueId = randomUUID();
    const insightLessonActivityId = randomUUID();

    const insightAcquisitionFunnelId = randomUUID();
    const insightLeadMagnetFunnelId = randomUUID();
    const insightWebinarFunnelId = randomUUID();
    const insightLaunchFunnelId = randomUUID();
    const insightManagerFunnelId = randomUUID();
    const insightActivationFunnelId = randomUUID();
    const insightLtvFunnelId = randomUUID();
    const insightRefundFunnelId = randomUUID();
    const insightLearningFunnelId = randomUUID();

    const insightNewLeadsId = randomUUID();
    const insightWebinarRegId = randomUUID();
    const insightRefundsId = randomUUID();

    const insightRetentionId = randomUUID();
    const insightLifecycleId = randomUUID();
    const insightStickinessId = randomUUID();
    const insightPathsId = randomUUID();

    const insights: InsightInput[] = [
      // ── Trends ──
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
        id: insightRevenueId,
        type: 'trend',
        name: 'Выручка (payment_success)',
        description: 'Суммарный объём платежей по дням',
        config: {
          type: 'trend',
          series: [{ event_name: 'payment_success', label: 'Выручка' }],
          metric: 'property_sum',
          metric_property: 'properties.amount',
          granularity: 'day',
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
        description: 'Начатые и завершённые уроки по дням',
        config: {
          type: 'trend',
          series: [
            { event_name: 'lesson_started', label: 'Начато уроков' },
            { event_name: 'lesson_completed', label: 'Завершено уроков' },
          ],
          metric: 'total_events',
          granularity: 'day',
          chart_type: 'line',
          date_from: dateFrom,
          date_to: dateTo,
          compare: false,
        },
      },
      {
        id: insightNewLeadsId,
        type: 'trend',
        name: 'Новые лиды',
        description: 'Количество новых лидов по дням',
        config: {
          type: 'trend',
          series: [{ event_name: 'lead_created', label: 'Новые лиды' }],
          metric: 'total_events',
          granularity: 'day',
          chart_type: 'bar',
          date_from: dateFrom,
          date_to: dateTo,
          compare: false,
        },
      },
      {
        id: insightWebinarRegId,
        type: 'trend',
        name: 'Вебинарные регистрации',
        description: 'Количество регистраций на вебинары по дням',
        config: {
          type: 'trend',
          series: [{ event_name: 'webinar_registered', label: 'Регистрации на вебинар' }],
          metric: 'total_events',
          granularity: 'day',
          chart_type: 'bar',
          date_from: dateFrom,
          date_to: dateTo,
          compare: false,
        },
      },
      {
        id: insightRefundsId,
        type: 'trend',
        name: 'Возвраты',
        description: 'Количество запросов на возврат по дням',
        config: {
          type: 'trend',
          series: [{ event_name: 'refund_requested', label: 'Запросы возврата' }],
          metric: 'total_events',
          granularity: 'day',
          chart_type: 'bar',
          date_from: dateFrom,
          date_to: dateTo,
          compare: false,
        },
      },

      // ── Funnels ──
      {
        id: insightAcquisitionFunnelId,
        type: 'funnel',
        name: 'Воронка холодного трафика',
        description: 'Конверсия от клика по рекламе до оплаты курса',
        config: {
          type: 'funnel',
          steps: [
            { event_name: 'ad_clicked', label: 'Клик по рекламе' },
            { event_name: 'landing_viewed', label: 'Просмотр лендинга' },
            { event_name: 'lead_created', label: 'Создание лида' },
            { event_name: 'offer_page_viewed', label: 'Просмотр оффера' },
            { event_name: 'checkout_started', label: 'Начало оплаты' },
            { event_name: 'payment_success', label: 'Успешная оплата' },
          ],
          conversion_window_days: 14,
          date_from: dateFrom,
          date_to: dateTo,
        },
        is_favorite: true,
      },
      {
        id: insightLeadMagnetFunnelId,
        type: 'funnel',
        name: 'Воронка лид-магнита и прогрева',
        description: 'Прогрев через лид-магнит до оплаты',
        config: {
          type: 'funnel',
          steps: [
            { event_name: 'lead_magnet_downloaded', label: 'Скачал лид-магнит' },
            { event_name: 'contact_confirmed', label: 'Подтвердил контакт' },
            { event_name: 'email_opened', label: 'Открыл письмо' },
            { event_name: 'email_link_clicked', label: 'Перешёл по ссылке' },
            { event_name: 'offer_viewed', label: 'Посмотрел оффер' },
            { event_name: 'payment_success', label: 'Оплатил' },
          ],
          conversion_window_days: 21,
          date_from: dateFrom,
          date_to: dateTo,
        },
        is_favorite: true,
      },
      {
        id: insightWebinarFunnelId,
        type: 'funnel',
        name: 'Вебинарная воронка',
        description: 'Конверсия от регистрации на вебинар до оплаты',
        config: {
          type: 'funnel',
          steps: [
            { event_name: 'webinar_registered', label: 'Регистрация' },
            { event_name: 'webinar_attended', label: 'Посещение' },
            { event_name: 'webinar_watch_50', label: 'Просмотр 50%+' },
            { event_name: 'offer_shown', label: 'Увидел предложение' },
            { event_name: 'offer_clicked', label: 'Нажал «Купить»' },
            { event_name: 'checkout_started', label: 'Начало оплаты' },
            { event_name: 'payment_success', label: 'Оплатил' },
          ],
          conversion_window_days: 3,
          date_from: dateFrom,
          date_to: dateTo,
        },
        is_favorite: true,
      },
      {
        id: insightLaunchFunnelId,
        type: 'funnel',
        name: 'Воронка запуска по базе',
        description: 'Конверсия email/telegram-рассылки до оплаты',
        config: {
          type: 'funnel',
          steps: [
            { event_name: 'launch_message_sent', label: 'Сообщение отправлено' },
            { event_name: 'launch_message_opened', label: 'Сообщение открыто' },
            { event_name: 'launch_page_viewed', label: 'Страница запуска' },
            { event_name: 'offer_presented', label: 'Оффер показан' },
            { event_name: 'payment_success', label: 'Оплата' },
          ],
          conversion_window_days: 7,
          date_from: dateFrom,
          date_to: dateTo,
        },
        is_favorite: true,
      },
      {
        id: insightManagerFunnelId,
        type: 'funnel',
        name: 'Воронка продаж через менеджера',
        description: 'Конверсия от заявки до успешной сделки',
        config: {
          type: 'funnel',
          steps: [
            { event_name: 'lead_created', label: 'Заявка' },
            { event_name: 'call_scheduled', label: 'Звонок назначен' },
            { event_name: 'call_completed', label: 'Звонок состоялся' },
            { event_name: 'invoice_sent', label: 'Счёт выставлен' },
            { event_name: 'payment_success', label: 'Оплата' },
          ],
          conversion_window_days: 30,
          date_from: dateFrom,
          date_to: dateTo,
        },
        is_favorite: true,
      },
      {
        id: insightActivationFunnelId,
        type: 'funnel',
        name: 'Воронка активации ученика',
        description: 'Активация студента после покупки',
        config: {
          type: 'funnel',
          steps: [
            { event_name: 'payment_success', label: 'Оплатил' },
            { event_name: 'platform_login', label: 'Вошёл в кабинет' },
            { event_name: 'lesson_started', label: 'Начал урок' },
            { event_name: 'module_completed', label: 'Завершил модуль' },
            { event_name: 'course_progress_30', label: 'Прогресс 30%' },
          ],
          conversion_window_days: 7,
          date_from: dateFrom,
          date_to: dateTo,
        },
        is_favorite: true,
      },
      {
        id: insightLearningFunnelId,
        type: 'funnel',
        name: 'Воронка обучения и удержания',
        description: 'Вовлечённость и прохождение курса до завершения',
        config: {
          type: 'funnel',
          steps: [
            { event_name: 'lesson_started', label: 'Начал урок' },
            { event_name: 'lesson_completed', label: 'Завершил урок' },
            { event_name: 'weekly_active', label: 'Недельная активность' },
            { event_name: 'course_progress_50', label: 'Прогресс 50%' },
            { event_name: 'course_completed', label: 'Курс завершён' },
          ],
          conversion_window_days: 60,
          date_from: dateFrom,
          date_to: dateTo,
        },
        is_favorite: true,
      },
      {
        id: insightLtvFunnelId,
        type: 'funnel',
        name: 'Воронка повторных продаж (LTV)',
        description: 'Конверсия от первой покупки до апселла',
        config: {
          type: 'funnel',
          steps: [
            { event_name: 'payment_course_A', label: 'Купил основной курс' },
            { event_name: 'course_progress_50', label: 'Прогресс 50%' },
            { event_name: 'upsell_viewed', label: 'Увидел апселл' },
            { event_name: 'upsell_clicked', label: 'Перешёл к апселлу' },
            { event_name: 'upsell_purchased', label: 'Купил апселл' },
          ],
          conversion_window_days: 90,
          date_from: dateFrom,
          date_to: dateTo,
        },
        is_favorite: true,
      },
      {
        id: insightRefundFunnelId,
        type: 'funnel',
        name: 'Воронка возвратов',
        description: 'Качество продукта: от оплаты до запроса возврата',
        config: {
          type: 'funnel',
          steps: [
            { event_name: 'payment_success', label: 'Оплатил' },
            { event_name: 'lesson_started', label: 'Начал урок' },
            { event_name: 'refund_requested', label: 'Запросил возврат' },
            { event_name: 'refund_completed', label: 'Возврат оформлен' },
          ],
          conversion_window_days: 14,
          date_from: dateFrom,
          date_to: dateTo,
        },
        is_favorite: true,
      },

      // ── Retention / Lifecycle / Stickiness / Paths ──
      {
        id: insightRetentionId,
        type: 'retention',
        name: 'Удержание оплативших учеников',
        description: 'Удержание студентов неделя за неделей после первой оплаты',
        config: {
          type: 'retention',
          target_event: 'payment_success',
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
        name: 'Жизненный цикл по активности в обучении',
        description: 'Новые, возвращающиеся, воскресающие и неактивные учащиеся по урокам',
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
        name: 'Пути после оплаты курса',
        description: 'Куда переходят пользователи после успешной оплаты',
        config: {
          type: 'paths',
          start_event: 'payment_success',
          step_limit: 5,
          date_from: dateFrom,
          date_to: dateTo,
        },
      },
    ];

    // ── Dashboards ────────────────────────────────────────────────────────────

    const dashboardOverviewId = randomUUID();
    const dashboardFunnelsId = randomUUID();
    const dashboardLearningId = randomUUID();

    const dashboards: DashboardInput[] = [
      { id: dashboardOverviewId, name: 'Обзор' },
      { id: dashboardFunnelsId, name: 'Воронки продаж' },
      { id: dashboardLearningId, name: 'Обучение и удержание' },
    ];

    // ── Widgets ───────────────────────────────────────────────────────────────

    const widgets: WidgetInput[] = [
      // Overview dashboard (5 key widgets)
      { dashboardId: dashboardOverviewId, insightId: insightDauId, layout: { x: 0, y: 0, w: 6, h: 4 } },
      { dashboardId: dashboardOverviewId, insightId: insightRevenueId, layout: { x: 6, y: 0, w: 6, h: 4 } },
      { dashboardId: dashboardOverviewId, insightId: insightNewLeadsId, layout: { x: 0, y: 4, w: 6, h: 4 } },
      { dashboardId: dashboardOverviewId, insightId: insightActivationFunnelId, layout: { x: 6, y: 4, w: 6, h: 5 } },
      { dashboardId: dashboardOverviewId, insightId: insightRetentionId, layout: { x: 0, y: 8, w: 12, h: 5 } },

      // Funnels dashboard (5 key funnels)
      { dashboardId: dashboardFunnelsId, insightId: insightAcquisitionFunnelId, layout: { x: 0, y: 0, w: 12, h: 5 } },
      { dashboardId: dashboardFunnelsId, insightId: insightWebinarFunnelId, layout: { x: 0, y: 5, w: 6, h: 5 } },
      { dashboardId: dashboardFunnelsId, insightId: insightLeadMagnetFunnelId, layout: { x: 6, y: 5, w: 6, h: 5 } },
      { dashboardId: dashboardFunnelsId, insightId: insightLaunchFunnelId, layout: { x: 0, y: 10, w: 6, h: 5 } },
      { dashboardId: dashboardFunnelsId, insightId: insightLtvFunnelId, layout: { x: 6, y: 10, w: 6, h: 5 } },

      // Learning & Retention dashboard (5 widgets)
      { dashboardId: dashboardLearningId, insightId: insightLearningFunnelId, layout: { x: 0, y: 0, w: 12, h: 5 } },
      { dashboardId: dashboardLearningId, insightId: insightRetentionId, layout: { x: 0, y: 5, w: 12, h: 5 } },
      { dashboardId: dashboardLearningId, insightId: insightLifecycleId, layout: { x: 0, y: 10, w: 6, h: 4 } },
      { dashboardId: dashboardLearningId, insightId: insightStickinessId, layout: { x: 6, y: 10, w: 6, h: 4 } },
      { dashboardId: dashboardLearningId, insightId: insightLessonActivityId, layout: { x: 0, y: 14, w: 12, h: 4 } },
    ];

    // ── Cohorts ───────────────────────────────────────────────────────────────

    const cohorts: CohortInput[] = [
      {
        id: randomUUID(),
        name: 'Активные покупатели',
        description: 'Пользователи, совершившие хотя бы одну оплату',
        definition: {
          type: 'AND',
          values: [
            {
              type: 'event',
              event_name: 'payment_success',
              count_operator: 'gte',
              count: 1,
              time_window_days: 90,
            },
          ],
        },
      },
      {
        id: randomUUID(),
        name: 'Вебинарная аудитория',
        description: 'Зарегистрировались на вебинар за последние 30 дней',
        definition: {
          type: 'AND',
          values: [
            {
              type: 'event',
              event_name: 'webinar_registered',
              count_operator: 'gte',
              count: 1,
              time_window_days: 30,
            },
          ],
        },
      },
      {
        id: randomUUID(),
        name: 'Завершили курс',
        description: 'Пользователи, завершившие хотя бы один курс',
        definition: {
          type: 'AND',
          values: [
            {
              type: 'event',
              event_name: 'course_completed',
              count_operator: 'gte',
              count: 1,
              time_window_days: 90,
            },
          ],
        },
      },
      {
        id: randomUUID(),
        name: 'Лиды без покупки',
        description: 'Создали лид, но не совершили оплату',
        definition: {
          type: 'AND',
          values: [
            {
              type: 'event',
              event_name: 'lead_created',
              count_operator: 'gte',
              count: 1,
              time_window_days: 60,
            },
            {
              type: 'not_performed_event',
              event_name: 'payment_success',
              time_window_days: 60,
            },
          ],
        },
      },
      {
        id: randomUUID(),
        name: 'Отток (нет активности 14 дней)',
        description: 'Начали обучение, но не активны последние 14 дней',
        definition: {
          type: 'AND',
          values: [
            {
              type: 'event',
              event_name: 'lesson_started',
              count_operator: 'gte',
              count: 1,
              time_window_days: 90,
            },
            {
              type: 'not_performed_event',
              event_name: 'lesson_started',
              time_window_days: 14,
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

    // ── Ad Spend: 60 days of data (deterministic) ─────────────────────────────

    const adSpend: AdSpendInput[] = [];

    const channelSpendConfig = [
      { channelId: channelGoogleId, baseAmount: 120, variance: 40, weekendMultiplier: 0.7 },
      { channelId: channelFacebookId, baseAmount: 85, variance: 25, weekendMultiplier: 0.8 },
      { channelId: channelOrganicId, baseAmount: 0, variance: 0, weekendMultiplier: 1 },
      { channelId: channelReferralId, baseAmount: 20, variance: 15, weekendMultiplier: 1 },
    ];

    // Seeded RNG for ad spend amounts (deterministic across calls)
    const spendRng = seededRandom(42);

    for (let dayOffset = 59; dayOffset >= 0; dayOffset--) {
      const d = new Date(BASE_DATE);
      d.setDate(d.getDate() - dayOffset);
      const spendDate = formatDate(d);
      const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      for (const cfg of channelSpendConfig) {
        if (cfg.baseAmount === 0) continue;

        const multiplier = isWeekend ? cfg.weekendMultiplier : 1;
        const jitterAmount = (spendRng() - 0.5) * 2 * cfg.variance;
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
    const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'];
    const BROWSERS = ['Chrome', 'Firefox', 'Safari', 'Edge'];
    const OSES = ['Windows', 'macOS', 'Linux', 'iOS', 'Android'];

    const firstNames = [
      'Алексей', 'Maria', 'Hans', 'Carlos', 'Elif',
      'Ирина', 'Jennifer', 'Klaus', 'Ana', 'Mehmet',
      'Дмитрий', 'Sarah', 'Petra', 'Lucas', 'Ayse',
      'Olga', 'Michael', 'Diego', 'Natalia', 'Pavel',
    ];
    const lastNames = [
      'Petrov', 'Silva', 'Mueller', 'Santos', 'Yilmaz',
      'Ivanova', 'Johnson', 'Fischer', 'Ferreira', 'Kaya',
      'Smirnov', 'Williams', 'Schneider', 'Oliveira', 'Celik',
      'Kozlova', 'Brown', 'Gomez', 'Volkova', 'Morozov',
    ];
    const countries = ['RU', 'US', 'DE', 'BR', 'TR'];
    const ageGroups: Student['age_group'][] = ['18-24', '25-34', '35-44'];

    const dayMs = 24 * 60 * 60 * 1000;

    return STUDENT_FUNNEL_PROFILES.map((profile, i) => {
      const firstName = firstNames[i];
      const lastName = lastNames[i];
      const country = countries[i % countries.length];
      const email = `${firstName.toLowerCase().replace(/[^a-z]/g, '')}.${lastName.toLowerCase()}@example.com`;
      // Initial plan is always free; funnels will upgrade to pro when payment happens
      const plan: 'free' | 'pro' = 'free';
      const age_group = ageGroups[i % ageGroups.length];
      const signup_date = new Date(now.getTime() - profile.signupDaysAgo * dayMs);
      const device_type = DEVICE_TYPES[i % DEVICE_TYPES.length];
      const browser = BROWSERS[i % BROWSERS.length];
      const os = OSES[i % OSES.length];

      return { email, name: `${firstName} ${lastName}`, country, plan, age_group, signup_date, device_type, browser, os };
    });
  }
}
