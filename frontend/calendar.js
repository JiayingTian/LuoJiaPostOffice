const formatterCache = new Map();

function formatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }));
  }
  return formatterCache.get(timeZone);
}

export function calendarParts(value, timeZone = 'Asia/Shanghai') {
  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
    ? `${value}Z`
    : value;
  const instant = normalized instanceof Date ? normalized : new Date(normalized);
  if (!Number.isFinite(instant.getTime())) return null;
  const values = Object.fromEntries(
    formatter(timeZone).formatToParts(instant)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]),
  );
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  return {
    year,
    month,
    day,
    hour: values.hour,
    minute: values.minute,
    key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

export function letterMoment(letter) {
  if (!letter || !['pendingReview', 'published', 'private'].includes(letter.workflowState)) return null;
  if (letter.workflowState === 'private') return letter.createdAt || letter.updatedAt || null;
  return letter.submittedAt || letter.publishedAt || letter.createdAt || null;
}

export function sentLetterEntries(letters, timeZone = 'Asia/Shanghai') {
  return (Array.isArray(letters) ? letters : [])
    .map(letter => {
      const moment = letterMoment(letter);
      const parts = moment ? calendarParts(moment, timeZone) : null;
      return parts ? { letter, moment, parts } : null;
    })
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.moment) - Date.parse(left.moment));
}

export function groupEntriesByDate(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    const list = grouped.get(entry.parts.key) || [];
    list.push(entry);
    grouped.set(entry.parts.key, list);
  }
  return grouped;
}
