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

const AD_CHANNELS = ['google', 'facebook', 'referral'];

const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'];
const BROWSERS = ['Chrome', 'Firefox', 'Safari', 'Edge'];
const OSES = ['Windows', 'macOS', 'Linux', 'iOS', 'Android'];

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

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
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

    for (const student of students) {
      updateStudentProps(student);

      const signupTs = student.signup_date;

      // Pageviews spread over the activity window
      const postPageviewCount = 4 + Math.floor(Math.random() * 6);
      const postDates = this.spreadOverDays(postPageviewCount, 60);
      for (const d of postDates) {
        const page = pick(PAGE_PATHS);
        addPageviewEvent(student, page, pick(REFERRERS), this.jitter(d, 2));
      }

      // ─────────────────────────────────────────────────────────────────
      // Each student participates in multiple funnel paths simultaneously.
      // This ensures all 9 funnel scenarios have data.
      // ─────────────────────────────────────────────────────────────────

      // Pick a primary course for this student
      const primaryCourse = pick(COURSES);

      // ═════════════════════════════════════════════════════════════════
      // FUNNEL 1: Холодный трафик — Привлечение
      // ad_clicked → landing_viewed → lead_created → offer_page_viewed
      // → checkout_started → payment_success
      // ═════════════════════════════════════════════════════════════════
      {
        const channel = pick(AD_CHANNELS);
        const adTs = addDays(signupTs, -Math.floor(Math.random() * 5));

        // 100% get ad_clicked
        addEvent(student, 'ad_clicked', this.jitter(adTs, 1), {
          channel,
          campaign_name: `${primaryCourse.name} — старт`,
          ad_id: `ad_${Math.floor(Math.random() * 9000) + 1000}`,
        });

        // ~85% view landing
        if (Math.random() < 0.85) {
          const landingTs = addMinutes(adTs, 1 + Math.floor(Math.random() * 5));
          addPageviewEvent(
            student,
            { path: `/courses/${primaryCourse.category}`, title: primaryCourse.name },
            `https://ads.${channel}.com`,
            landingTs,
          );
          addEvent(student, 'landing_viewed', landingTs, {
            course_name: primaryCourse.name,
            page_title: primaryCourse.name,
          });

          // ~50% create lead
          if (Math.random() < 0.5) {
            const leadTs = addMinutes(landingTs, 2 + Math.floor(Math.random() * 10));
            addEvent(student, 'lead_created', leadTs, {
              source: channel,
              course_name: primaryCourse.name,
            });

            // ~60% go to offer page
            if (Math.random() < 0.6) {
              const offerTs = addMinutes(leadTs, 5 + Math.floor(Math.random() * 60));
              addEvent(student, 'offer_page_viewed', offerTs, {
                course_name: primaryCourse.name,
                price: primaryCourse.price,
              });

              // ~45% start checkout
              if (Math.random() < 0.45) {
                const checkoutTs = addMinutes(offerTs, 1 + Math.floor(Math.random() * 15));
                addEvent(student, 'checkout_started', checkoutTs, {
                  course_name: primaryCourse.name,
                  price: primaryCourse.price,
                });

                // ~70% complete payment
                if (Math.random() < 0.7) {
                  const paymentTs = addMinutes(checkoutTs, 2 + Math.floor(Math.random() * 10));
                  const paymentMethod = pick(['card', 'sbp', 'yookassa']);
                  addEvent(student, 'payment_success', paymentTs, {
                    course_name: primaryCourse.name,
                    amount: primaryCourse.price,
                    currency: 'USD',
                    payment_method: paymentMethod,
                  });
                  // payment_course_A: same payment fact, used for LTV funnel identification
                  addEvent(student, 'payment_course_A', paymentTs, {
                    course_name: primaryCourse.name,
                    amount: primaryCourse.price,
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

      // ═════════════════════════════════════════════════════════════════
      // FUNNEL 2: Прогрев через лид-магнит
      // lead_magnet_downloaded → contact_confirmed → email_opened
      // → email_link_clicked → offer_viewed → (checkout_started → payment_success)
      // ═════════════════════════════════════════════════════════════════
      // ~70% of students participate in lead-magnet funnel
      if (Math.random() < 0.7) {
        const lm = pick(LEAD_MAGNETS);
        const lmTs = addDays(signupTs, -Math.floor(Math.random() * 10));

        addEvent(student, 'lead_magnet_downloaded', this.jitter(lmTs, 2), {
          lead_magnet_name: lm.name,
          format: lm.format,
        });

        // ~75% confirm contact
        if (Math.random() < 0.75) {
          const confirmTs = addMinutes(lmTs, 5 + Math.floor(Math.random() * 30));
          addEvent(student, 'contact_confirmed', confirmTs, {
            channel: pick(['email', 'telegram', 'whatsapp']),
          });

          // Send 2-4 warming emails, each with open/click probability
          const emailCount = 2 + Math.floor(Math.random() * 3);
          let emailTs = addDays(confirmTs, 1);
          for (let e = 0; e < emailCount; e++) {
            const subject = pick([
              `${primaryCourse.name}: старт через 3 дня`,
              `Почему 90% бросают учёбу — и как не стать одним из них`,
              `Специальное предложение: скидка 20%`,
              `История успеха наших студентов`,
            ]);

            // ~60% open email
            if (Math.random() < 0.6) {
              addEvent(student, 'email_opened', emailTs, {
                email_subject: subject,
                sequence_number: e + 1,
              });

              // ~40% click link in email
              if (Math.random() < 0.4) {
                addEvent(student, 'email_link_clicked', addMinutes(emailTs, 2), {
                  email_subject: subject,
                  link_name: pick(['Записаться на курс', 'Узнать подробнее', 'Смотреть программу']),
                });

                // ~50% view offer after clicking
                if (Math.random() < 0.5) {
                  const ovTs = addMinutes(emailTs, 5 + Math.floor(Math.random() * 20));
                  addEvent(student, 'offer_viewed', ovTs, {
                    course_name: primaryCourse.name,
                    price: primaryCourse.price,
                  });
                }
              }
            }
            emailTs = addDays(emailTs, 2 + Math.floor(Math.random() * 2));
          }
        }
      }

      // ═════════════════════════════════════════════════════════════════
      // FUNNEL 3: Вебинар
      // webinar_registered → webinar_attended → webinar_watch_50
      // → offer_shown → offer_clicked → (checkout_started → payment_success)
      // ═════════════════════════════════════════════════════════════════
      // ~55% of students register for a webinar
      if (Math.random() < 0.55) {
        const webinar = pick(WEBINARS);
        const regTs = addDays(signupTs, -Math.floor(Math.random() * 14));
        const webinarDate = addDays(regTs, 3 + Math.floor(Math.random() * 7));

        addEvent(student, 'webinar_registered', this.jitter(regTs, 4), {
          webinar_name: webinar.name,
          date: formatDate(webinarDate),
        });

        // ~65% attend
        if (Math.random() < 0.65) {
          addEvent(student, 'webinar_attended', webinarDate, {
            webinar_name: webinar.name,
            platform: webinar.platform,
          });

          // ~55% watch 50%+
          if (Math.random() < 0.55) {
            const watch50Ts = addMinutes(webinarDate, 30 + Math.floor(Math.random() * 30));
            const watchPercent = 50 + Math.floor(Math.random() * 50);
            addEvent(student, 'webinar_watch_50', watch50Ts, {
              webinar_name: webinar.name,
              watch_percent: watchPercent,
            });

            // ~80% see offer
            if (Math.random() < 0.8) {
              const shownTs = addMinutes(webinarDate, 60 + Math.floor(Math.random() * 30));
              addEvent(student, 'offer_shown', shownTs, {
                course_name: primaryCourse.name,
                price: primaryCourse.price,
              });

              // ~45% click offer
              if (Math.random() < 0.45) {
                const clickTs = addMinutes(shownTs, 1 + Math.floor(Math.random() * 5));
                addEvent(student, 'offer_clicked', clickTs, {
                  course_name: primaryCourse.name,
                  price: primaryCourse.price,
                });

                // ~60% proceed to checkout
                if (Math.random() < 0.6) {
                  const coTs = addMinutes(clickTs, 2 + Math.floor(Math.random() * 8));
                  addEvent(student, 'checkout_started', coTs, {
                    course_name: primaryCourse.name,
                    price: primaryCourse.price,
                  });

                  // ~65% pay
                  if (Math.random() < 0.65) {
                    const payTs = addMinutes(coTs, 3 + Math.floor(Math.random() * 10));
                    addEvent(student, 'payment_success', payTs, {
                      course_name: primaryCourse.name,
                      amount: primaryCourse.price,
                      currency: 'USD',
                      payment_method: pick(['card', 'sbp', 'yookassa']),
                    });
                    addEvent(student, 'payment_course_A', payTs, {
                      course_name: primaryCourse.name,
                      amount: primaryCourse.price,
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

      // ═════════════════════════════════════════════════════════════════
      // FUNNEL 4: Запуск по базе
      // launch_message_sent → launch_message_opened → launch_page_viewed
      // → offer_presented → (checkout_started → payment_success)
      // ═════════════════════════════════════════════════════════════════
      // ~60% of students receive a launch campaign
      if (Math.random() < 0.6) {
        const launch = pick(LAUNCHES);
        const msgTs = addDays(signupTs, -(5 + Math.floor(Math.random() * 20)));

        addEvent(student, 'launch_message_sent', this.jitter(msgTs, 2), {
          launch_name: launch.name,
          channel: launch.channel,
        });

        // ~50% open launch message
        if (Math.random() < 0.5) {
          const openTs = addMinutes(msgTs, 30 + Math.floor(Math.random() * 180));
          addEvent(student, 'launch_message_opened', openTs, {
            launch_name: launch.name,
          });

          // ~60% visit launch page
          if (Math.random() < 0.6) {
            const pageTs = addMinutes(openTs, 2 + Math.floor(Math.random() * 15));
            addEvent(student, 'launch_page_viewed', pageTs, {
              launch_name: launch.name,
              course_name: primaryCourse.name,
            });

            // ~55% receive offer
            if (Math.random() < 0.55) {
              const presentedTs = addMinutes(pageTs, 1 + Math.floor(Math.random() * 5));
              addEvent(student, 'offer_presented', presentedTs, {
                launch_name: launch.name,
                price: primaryCourse.price,
              });

              // ~30% proceed to checkout
              if (Math.random() < 0.3) {
                const coTs = addMinutes(presentedTs, 3 + Math.floor(Math.random() * 20));
                addEvent(student, 'checkout_started', coTs, {
                  course_name: primaryCourse.name,
                  price: primaryCourse.price,
                });

                // ~60% pay
                if (Math.random() < 0.6) {
                  const payTs = addMinutes(coTs, 3 + Math.floor(Math.random() * 10));
                  addEvent(student, 'payment_success', payTs, {
                    course_name: primaryCourse.name,
                    amount: primaryCourse.price,
                    currency: 'USD',
                    payment_method: pick(['card', 'sbp']),
                  });
                  addEvent(student, 'payment_course_A', payTs, {
                    course_name: primaryCourse.name,
                    amount: primaryCourse.price,
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

      // ═════════════════════════════════════════════════════════════════
      // FUNNEL 5: Продажа через менеджера
      // call_scheduled → call_completed → invoice_sent
      // → (checkout_started → payment_success)
      // ═════════════════════════════════════════════════════════════════
      // ~35% go through sales call funnel
      if (Math.random() < 0.35) {
        const manager = pick(MANAGERS);
        const callScheduleTs = addDays(signupTs, Math.floor(Math.random() * 7));

        addEvent(student, 'call_scheduled', this.jitter(callScheduleTs, 4), {
          manager_name: manager,
          source: pick(['landing', 'lead_magnet', 'webinar']),
        });

        // ~80% complete call
        if (Math.random() < 0.8) {
          const callTs = addDays(callScheduleTs, 1 + Math.floor(Math.random() * 2));
          const durationMinutes = 20 + Math.floor(Math.random() * 40);
          addEvent(student, 'call_completed', callTs, {
            manager_name: manager,
            duration_minutes: durationMinutes,
          });

          // ~70% receive invoice
          if (Math.random() < 0.7) {
            const invoiceTs = addMinutes(callTs, 30 + Math.floor(Math.random() * 60));
            addEvent(student, 'invoice_sent', invoiceTs, {
              course_name: primaryCourse.name,
              amount: primaryCourse.price,
            });

            // ~50% pay
            if (Math.random() < 0.5) {
              const coTs = addMinutes(invoiceTs, 60 + Math.floor(Math.random() * 180));
              addEvent(student, 'checkout_started', coTs, {
                course_name: primaryCourse.name,
                price: primaryCourse.price,
              });
              const payTs = addMinutes(coTs, 5 + Math.floor(Math.random() * 30));
              addEvent(student, 'payment_success', payTs, {
                course_name: primaryCourse.name,
                amount: primaryCourse.price,
                currency: 'USD',
                payment_method: pick(['card', 'invoice']),
              });
              addEvent(student, 'payment_course_A', payTs, {
                course_name: primaryCourse.name,
                amount: primaryCourse.price,
                currency: 'USD',
              });
              student.plan = 'pro';
              updateStudentProps(student);
            }
          }
        }
      }

      // ═════════════════════════════════════════════════════════════════
      // FUNNEL 6: Активация и обучение
      // platform_login → lesson_started → module_completed
      // → course_progress_30 → lesson_completed → weekly_active
      // → course_progress_50 → course_completed
      // ═════════════════════════════════════════════════════════════════
      // ~70% of students who have a plan=pro activate and start learning
      if (student.plan === 'pro' || Math.random() < 0.3) {
        const activationTs = addDays(signupTs, 1 + Math.floor(Math.random() * 3));

        // platform_login
        addEvent(student, 'platform_login', activationTs, {
          device_type: student.device_type,
        });

        // ~85% start first lesson
        if (Math.random() < 0.85) {
          const lessonStartTs = addMinutes(activationTs, 5 + Math.floor(Math.random() * 30));
          addEvent(student, 'lesson_started', lessonStartTs, {
            course_name: primaryCourse.name,
            lesson_number: 1,
            lesson_title: primaryCourse.lessons[0].title,
          });

          // Complete lesson 1
          const durationSec1 = 600 + Math.floor(Math.random() * 1800);
          const lesson1CompleteTs = addMinutes(lessonStartTs, Math.ceil(durationSec1 / 60));
          addEvent(student, 'lesson_completed', lesson1CompleteTs, {
            course_name: primaryCourse.name,
            lesson_number: 1,
            duration_seconds: durationSec1,
          });

          // ~80% continue to module_completed (after lesson 2-3)
          if (Math.random() < 0.8) {
            // Lesson 2
            const lesson2StartTs = addDays(lesson1CompleteTs, 1 + Math.floor(Math.random() * 2));
            addEvent(student, 'platform_login', lesson2StartTs, {
              device_type: student.device_type,
            });
            if (primaryCourse.lessons.length > 1) {
              addEvent(student, 'lesson_started', addMinutes(lesson2StartTs, 5), {
                course_name: primaryCourse.name,
                lesson_number: 2,
                lesson_title: primaryCourse.lessons[1].title,
              });
              const dur2 = 600 + Math.floor(Math.random() * 1800);
              const l2Done = addMinutes(lesson2StartTs, 5 + Math.ceil(dur2 / 60));
              addEvent(student, 'lesson_completed', l2Done, {
                course_name: primaryCourse.name,
                lesson_number: 2,
                duration_seconds: dur2,
              });

              // module_completed after lesson 2
              addEvent(student, 'module_completed', addMinutes(l2Done, 10), {
                course_name: primaryCourse.name,
                module_number: 1,
              });

              // course_progress_30
              addEvent(student, 'course_progress_30', addMinutes(l2Done, 11), {
                course_name: primaryCourse.name,
              });

              // ~70% reach weekly_active
              if (Math.random() < 0.7) {
                const weeklyTs = addDays(lesson2StartTs, 5 + Math.floor(Math.random() * 3));
                addEvent(student, 'weekly_active', weeklyTs, {
                  week_number: 1,
                  lessons_this_week: 2 + Math.floor(Math.random() * 3),
                });

                // ~65% reach 50% progress
                if (Math.random() < 0.65) {
                  // Lessons 3-4
                  let lessonTs = addDays(weeklyTs, 1);
                  const midLesson = Math.floor(primaryCourse.lessons.length / 2);
                  for (let li = 2; li <= Math.min(midLesson, primaryCourse.lessons.length - 1); li++) {
                    const lesson = primaryCourse.lessons[li];
                    addEvent(student, 'platform_login', lessonTs, {
                      device_type: student.device_type,
                    });
                    addEvent(student, 'lesson_started', addMinutes(lessonTs, 3), {
                      course_name: primaryCourse.name,
                      lesson_number: lesson.number,
                      lesson_title: lesson.title,
                    });
                    const dur = 600 + Math.floor(Math.random() * 1800);
                    addEvent(student, 'lesson_completed', addMinutes(lessonTs, 3 + Math.ceil(dur / 60)), {
                      course_name: primaryCourse.name,
                      lesson_number: lesson.number,
                      duration_seconds: dur,
                    });
                    lessonTs = addDays(lessonTs, 1 + Math.floor(Math.random() * 2));
                  }

                  addEvent(student, 'course_progress_50', lessonTs, {
                    course_name: primaryCourse.name,
                  });

                  // 2nd weekly_active
                  addEvent(student, 'weekly_active', addDays(lessonTs, 2), {
                    week_number: 2,
                    lessons_this_week: 2 + Math.floor(Math.random() * 4),
                  });

                  // ~45% complete course
                  if (Math.random() < 0.45) {
                    // Remaining lessons
                    let finalTs = addDays(lessonTs, 3);
                    for (let li = midLesson + 1; li < primaryCourse.lessons.length; li++) {
                      const lesson = primaryCourse.lessons[li];
                      addEvent(student, 'platform_login', finalTs, {
                        device_type: student.device_type,
                      });
                      addEvent(student, 'lesson_started', addMinutes(finalTs, 5), {
                        course_name: primaryCourse.name,
                        lesson_number: lesson.number,
                        lesson_title: lesson.title,
                      });
                      const dur = 900 + Math.floor(Math.random() * 2100);
                      addEvent(student, 'lesson_completed', addMinutes(finalTs, 5 + Math.ceil(dur / 60)), {
                        course_name: primaryCourse.name,
                        lesson_number: lesson.number,
                        duration_seconds: dur,
                      });
                      finalTs = addDays(finalTs, 1 + Math.floor(Math.random() * 3));
                    }

                    // module_completed for module 2
                    addEvent(student, 'module_completed', finalTs, {
                      course_name: primaryCourse.name,
                      module_number: 2,
                    });

                    const completionTimeDays = Math.max(
                      1,
                      Math.floor((finalTs.getTime() - activationTs.getTime()) / dayMs),
                    );
                    addEvent(student, 'course_completed', addMinutes(finalTs, 5), {
                      course_name: primaryCourse.name,
                      completion_time_days: completionTimeDays,
                    });

                    // ═══════════════════════════════════════════════════
                    // FUNNEL 7: Повторные продажи (LTV)
                    // payment_course_A → upsell_viewed → upsell_clicked → upsell_purchased
                    // ═══════════════════════════════════════════════════
                    // ~40% of completers see upsell
                    if (Math.random() < 0.4) {
                      const upsell = pick(UPSELL_COURSES);
                      const upsellViewTs = addDays(finalTs, 1 + Math.floor(Math.random() * 3));
                      addEvent(student, 'upsell_viewed', upsellViewTs, {
                        upsell_course_name: upsell.name,
                        price: upsell.price,
                      });

                      // ~55% click upsell
                      if (Math.random() < 0.55) {
                        const upsellClickTs = addMinutes(upsellViewTs, 2 + Math.floor(Math.random() * 10));
                        addEvent(student, 'upsell_clicked', upsellClickTs, {
                          upsell_course_name: upsell.name,
                          price: upsell.price,
                        });

                        // ~50% purchase upsell
                        if (Math.random() < 0.5) {
                          const upsellBuyTs = addMinutes(upsellClickTs, 5 + Math.floor(Math.random() * 20));
                          addEvent(student, 'upsell_purchased', upsellBuyTs, {
                            upsell_course_name: upsell.name,
                            amount: upsell.price,
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // ═════════════════════════════════════════════════════════════════
      // FUNNEL 8: Возвраты
      // payment_success → refund_requested → refund_completed
      // ~8% of payers request refund
      // ═════════════════════════════════════════════════════════════════
      if (student.plan === 'pro' && Math.random() < 0.08) {
        const refundRequestTs = addDays(signupTs, 5 + Math.floor(Math.random() * 10));
        addEvent(student, 'refund_requested', refundRequestTs, {
          course_name: primaryCourse.name,
          reason: pick(REFUND_REASONS),
        });

        // ~80% get refund completed
        if (Math.random() < 0.8) {
          const refundDoneTs = addDays(refundRequestTs, 1 + Math.floor(Math.random() * 5));
          addEvent(student, 'refund_completed', refundDoneTs, {
            course_name: primaryCourse.name,
            amount: primaryCourse.price,
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
    const dateFrom = formatDate(daysAgoDate(60));
    const dateTo = formatDate(now);

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
        description: 'Суммарный объём платежей за неделю',
        config: {
          type: 'trend',
          series: [{ event_name: 'payment_success', label: 'Выручка' }],
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
        description: 'Количество регистраций на вебинары по неделям',
        config: {
          type: 'trend',
          series: [{ event_name: 'webinar_registered', label: 'Регистрации на вебинар' }],
          metric: 'total_events',
          granularity: 'week',
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
        description: 'Количество запросов на возврат по неделям',
        config: {
          type: 'trend',
          series: [{ event_name: 'refund_requested', label: 'Запросы возврата' }],
          metric: 'total_events',
          granularity: 'week',
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
            { event_name: 'webinar_registered', label: 'Регистрация на вебинар' },
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
      // Overview dashboard
      { dashboardId: dashboardOverviewId, insightId: insightDauId, layout: { x: 0, y: 0, w: 6, h: 4 } },
      { dashboardId: dashboardOverviewId, insightId: insightRevenueId, layout: { x: 6, y: 0, w: 6, h: 4 } },
      { dashboardId: dashboardOverviewId, insightId: insightLessonActivityId, layout: { x: 0, y: 4, w: 6, h: 4 } },
      { dashboardId: dashboardOverviewId, insightId: insightNewLeadsId, layout: { x: 6, y: 4, w: 6, h: 4 } },
      { dashboardId: dashboardOverviewId, insightId: insightActivationFunnelId, layout: { x: 0, y: 8, w: 6, h: 5 } },
      { dashboardId: dashboardOverviewId, insightId: insightRetentionId, layout: { x: 6, y: 8, w: 6, h: 5 } },
      { dashboardId: dashboardOverviewId, insightId: insightWebinarRegId, layout: { x: 0, y: 13, w: 6, h: 4 } },
      { dashboardId: dashboardOverviewId, insightId: insightRefundsId, layout: { x: 6, y: 13, w: 6, h: 4 } },

      // Funnels dashboard
      { dashboardId: dashboardFunnelsId, insightId: insightAcquisitionFunnelId, layout: { x: 0, y: 0, w: 12, h: 5 } },
      { dashboardId: dashboardFunnelsId, insightId: insightWebinarFunnelId, layout: { x: 0, y: 5, w: 6, h: 5 } },
      { dashboardId: dashboardFunnelsId, insightId: insightLeadMagnetFunnelId, layout: { x: 6, y: 5, w: 6, h: 5 } },
      { dashboardId: dashboardFunnelsId, insightId: insightLaunchFunnelId, layout: { x: 0, y: 10, w: 6, h: 5 } },
      { dashboardId: dashboardFunnelsId, insightId: insightManagerFunnelId, layout: { x: 6, y: 10, w: 6, h: 5 } },
      { dashboardId: dashboardFunnelsId, insightId: insightLtvFunnelId, layout: { x: 0, y: 15, w: 6, h: 5 } },
      { dashboardId: dashboardFunnelsId, insightId: insightRefundFunnelId, layout: { x: 6, y: 15, w: 6, h: 5 } },

      // Learning & Retention dashboard
      { dashboardId: dashboardLearningId, insightId: insightLearningFunnelId, layout: { x: 0, y: 0, w: 12, h: 5 } },
      { dashboardId: dashboardLearningId, insightId: insightRetentionId, layout: { x: 0, y: 5, w: 12, h: 5 } },
      { dashboardId: dashboardLearningId, insightId: insightLifecycleId, layout: { x: 0, y: 10, w: 6, h: 4 } },
      { dashboardId: dashboardLearningId, insightId: insightStickinessId, layout: { x: 6, y: 10, w: 6, h: 4 } },
      { dashboardId: dashboardLearningId, insightId: insightLessonActivityId, layout: { x: 0, y: 14, w: 6, h: 4 } },
      { dashboardId: dashboardLearningId, insightId: insightPathsId, layout: { x: 6, y: 14, w: 6, h: 4 } },
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

    // ── Ad Spend: 60 days of data ─────────────────────────────────────────────

    const adSpend: AdSpendInput[] = [];

    const channelSpendConfig = [
      { channelId: channelGoogleId, baseAmount: 120, variance: 40, weekendMultiplier: 0.7 },
      { channelId: channelFacebookId, baseAmount: 85, variance: 25, weekendMultiplier: 0.8 },
      { channelId: channelOrganicId, baseAmount: 0, variance: 0, weekendMultiplier: 1 },
      { channelId: channelReferralId, baseAmount: 20, variance: 15, weekendMultiplier: 1 },
    ];

    for (let dayOffset = 59; dayOffset >= 0; dayOffset--) {
      const d = new Date(now);
      d.setDate(d.getDate() - dayOffset);
      const spendDate = formatDate(d);
      const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      for (const cfg of channelSpendConfig) {
        if (cfg.baseAmount === 0) continue;

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
