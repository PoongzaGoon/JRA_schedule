import { z } from 'zod';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.').refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, '실제 존재하는 날짜를 입력하세요.');
const text = z.string().trim().min(1).max(160);
const url = z.url().max(2000).refine(v => { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; }, '인증 정보가 없는 HTTPS 출처 URL을 입력하세요.');
export const nameSchema = z.strictObject({
  ja: text.nullable(), ko: text.nullable(), koKind: z.enum(['official', 'ai', 'unverified']).nullable(),
});
const entry = z.strictObject({
  raceNumber: z.number().int().min(1).max(12).nullable(),
  venue: nameSchema.nullable(), raceName: nameSchema.nullable(),
  surface: z.enum(['turf', 'dirt', 'jump']).nullable(),
  distanceM: z.number().int().min(100).max(10000).nullable(),
  horse: nameSchema.nullable(), sex: z.enum(['male', 'female', 'gelding']).nullable(),
  age: z.number().int().min(1).max(30).nullable(), jockey: nameSchema.nullable(),
  weightKg: z.number().min(20).max(100).multipleOf(0.5).nullable(),
  review: z.strictObject({ required: z.boolean(), notes: z.string().max(1000).nullable() }),
  extras: z.strictObject({
    popularity: z.number().int().min(1).max(30).nullable(), gate: z.number().int().min(1).max(8).nullable(),
    horseNumber: z.number().int().min(1).max(30).nullable(), trainer: nameSchema.nullable(),
    finishPosition: z.number().int().min(1).max(30).nullable(),
    previousRace: text.nullable(), interval: text.nullable(),
  }),
});
export const scheduleSchema = z.strictObject({
  schemaVersion: z.literal('1.0.0'), isExample: z.boolean(), referenceDate: date,
  sourceUrl: url, notes: z.string().max(2000).nullable(),
  stallions: z.array(z.strictObject({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80), name: nameSchema,
    sourceUrl: url.nullable(),
    raceDays: z.array(z.strictObject({ date, entries: z.array(entry).max(200) })).max(60),
  })).min(1).max(50),
});
export const jsonSchema = z.toJSONSchema(scheduleSchema);
const pathText = path => '$' + path.map(v => typeof v === 'number' ? `[${v}]` : `.${v}`).join('');
const normalized = text => (text ?? '').normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ja');
export function validateSchedule(raw) {
  let input;
  try { input = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { return { ok: false, errors: [{ path: '$', message: 'JSON 문법을 확인하세요. 쉼표·따옴표·괄호와 마크다운 코드 블록 포함 여부를 확인하세요.' }], warnings: [] }; }
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map(issue => ({ path: pathText(issue.path), message: issue.message })), warnings: [] };
  const data = parsed.data, errors = [], warnings = [], counts = [];
  const error = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });
  const ids = new Set();
  let totalRows = 0;
  data.stallions.forEach((stallion, si) => {
    const sp = `$.stallions[${si}]`;
    if (ids.has(stallion.id)) error(`${sp}.id`, '중복 종마 ID입니다. 하나의 종마로 합치세요.');
    ids.add(stallion.id);
    if (!stallion.name.ja || !stallion.name.ko) warn(`${sp}.name`, '종마명 원문 또는 한국어 표기를 확인하세요.');
    const dates = new Set();
    stallion.raceDays.forEach((day, di) => {
      const dp = `${sp}.raceDays[${di}]`;
      if (dates.has(day.date)) error(`${dp}.date`, '같은 종마의 동일 날짜를 하나의 그룹으로 합치세요.');
      dates.add(day.date);
      counts.push({ stallionId: stallion.id, date: day.date, rows: day.entries.length });
      const seen = new Set();
      day.entries.forEach((row, ri) => {
        totalRows++;
        const rp = `${dp}.entries[${ri}]`;
        for (const field of ['raceNumber', 'venue', 'raceName', 'surface', 'distanceM', 'horse', 'sex', 'age', 'jockey', 'weightKg']) {
          const v = row[field];
          if (v === null || (typeof v === 'object' && (!v.ja || !v.ko))) warn(`${rp}.${field}`, '누락되거나 판독하지 못한 값입니다. 원본과 비교하세요.');
        }
        if (row.review.required) warn(`${rp}.review`, row.review.notes || '관리자 확인이 필요한 행입니다.');
        if (row.horse?.ja && row.venue?.ja && row.raceNumber) {
          const id = `${normalized(row.venue.ja)}|${row.raceNumber}|${normalized(row.horse.ja)}`;
          if (seen.has(id)) error(rp, '같은 날짜·경마장·경주·마명의 중복 행입니다. 원본과 비교 후 제거하세요.');
          seen.add(id);
        }
      });
    });
  });
  const walk = (value, path) => {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && 'ja' in value && 'ko' in value && 'koKind' in value) {
      if (value.ko && value.koKind === null) error(`${path}.koKind`, '한국어 표기가 있으면 official, ai, unverified 중 하나를 지정하세요.');
      if (value.koKind === 'unverified') warn(path, '한국어 표기가 미검증 상태입니다.');
      return;
    }
    for (const [key, child] of Object.entries(value)) walk(child, `${path}${Array.isArray(value) ? `[${key}]` : `.${key}`}`);
  };
  walk(data, '$');
  if (totalRows > 2000) error('$.stallions', '한 게시본은 최대 2,000행입니다. 범위를 줄이세요.');
  if (!totalRows) warn('$.stallions', '출주 데이터가 없습니다. 빈 일정 게시 여부를 확인하세요.');
  if (data.isExample) warn('$.isExample', '가상의 예시 데이터입니다. 공개 화면에도 예시 표시가 유지됩니다.');
  return { ok: errors.length === 0, errors, warnings, data, counts, totalRows };
}
