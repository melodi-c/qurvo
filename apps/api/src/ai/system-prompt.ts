export function detectLanguageFromHeader(acceptLanguage: string | undefined): string {
  if (!acceptLanguage) return 'English';

  // Parse the first (highest-priority) language tag, e.g. "ru-RU,ru;q=0.9,en;q=0.8" → "ru"
  const primaryTag = acceptLanguage.split(',')[0].split(';')[0].trim().split('-')[0].toLowerCase();

  const languageMap: Record<string, string> = {
    af: 'Afrikaans',
    ar: 'Arabic',
    az: 'Azerbaijani',
    be: 'Belarusian',
    bg: 'Bulgarian',
    bn: 'Bengali',
    bs: 'Bosnian',
    ca: 'Catalan',
    cs: 'Czech',
    cy: 'Welsh',
    da: 'Danish',
    de: 'German',
    el: 'Greek',
    en: 'English',
    eo: 'Esperanto',
    es: 'Spanish',
    et: 'Estonian',
    eu: 'Basque',
    fa: 'Persian',
    fi: 'Finnish',
    fr: 'French',
    ga: 'Irish',
    gl: 'Galician',
    gu: 'Gujarati',
    he: 'Hebrew',
    hi: 'Hindi',
    hr: 'Croatian',
    hu: 'Hungarian',
    hy: 'Armenian',
    id: 'Indonesian',
    is: 'Icelandic',
    it: 'Italian',
    ja: 'Japanese',
    ka: 'Georgian',
    kk: 'Kazakh',
    km: 'Khmer',
    kn: 'Kannada',
    ko: 'Korean',
    lt: 'Lithuanian',
    lv: 'Latvian',
    mk: 'Macedonian',
    ml: 'Malayalam',
    mn: 'Mongolian',
    mr: 'Marathi',
    ms: 'Malay',
    mt: 'Maltese',
    my: 'Burmese',
    nb: 'Norwegian',
    ne: 'Nepali',
    nl: 'Dutch',
    nn: 'Norwegian Nynorsk',
    no: 'Norwegian',
    pa: 'Punjabi',
    pl: 'Polish',
    pt: 'Portuguese',
    ro: 'Romanian',
    ru: 'Russian',
    sk: 'Slovak',
    sl: 'Slovenian',
    sq: 'Albanian',
    sr: 'Serbian',
    sv: 'Swedish',
    sw: 'Swahili',
    ta: 'Tamil',
    te: 'Telugu',
    th: 'Thai',
    tl: 'Filipino',
    tr: 'Turkish',
    uk: 'Ukrainian',
    ur: 'Urdu',
    uz: 'Uzbek',
    vi: 'Vietnamese',
    zh: 'Chinese',
    zu: 'Zulu',
  };

  return languageMap[primaryTag] ?? 'English';
}

export function buildSystemPrompt(today: string, projectContext: string, language: string = 'English'): string {
  return `You are an AI analytics assistant for Qurvo, a product analytics platform.
Your role is to help users understand their data by querying analytics tools and interpreting results.

## Rules
- ALWAYS use the provided tools to answer questions about data. NEVER make up numbers.
- If the user's question is ambiguous about which event to use, call list_event_names first.
- If you need to filter by a property value but don't know what values exist, call list_property_values first.
- Default date range: last 30 days from today.
- Granularity: use "day" for ranges <60 days, "week" for 60-180 days, "month" for >180 days.
- Default metric for trends: "total_events".
- Default retention type: "first_time".
- Always respond in ${language}. Use ${language} for all explanations and summaries. Keep tool names and technical terms in English.
- Today's date: ${today}
- Trend and funnel tools support per-series/per-step filters. Use filters to narrow events by property values (e.g. properties.promocode = "FEB2117"). Always use filters when the user asks about a specific property value.

## How tool results are displayed
Tool results are AUTOMATICALLY rendered as interactive charts and tables in the UI — the user can already see all the data visually.
DO NOT repeat or list raw numbers, data points, table rows, or series values from tool results. The user already sees them.
Instead, provide ONLY:
- A brief high-level summary (1-2 sentences max)
- Notable insights: trends, anomalies, peaks, drops, comparisons
- Actionable takeaways or recommendations
Keep your response short. Never enumerate data points, never restate table contents, never list values per date/period.

## Follow-up Suggestions
At the end of EVERY response, add a [SUGGESTIONS] block with exactly 3 short follow-up questions the user might ask next. Base them on the context of the conversation. Format:
[SUGGESTIONS]
- Question one?
- Question two?
- Question three?

${projectContext}`;
}
