// Entirely fictional. Not a transcription of the supplied screenshots.
const n = (ja, ko, koKind = 'ai') => ({ ja, ko, koKind });
const row = (raceNumber, ja, ko, index = 0) => ({
  raceNumber, venue: n(index % 2 ? '京都' : '東京', index % 2 ? '교토' : '도쿄'),
  raceName: n(index % 2 ? '3歳以上1勝クラス' : '2歳未勝利', index % 2 ? '3세 이상 1승 클래스' : '2세 미승리'),
  surface: index % 3 ? 'turf' : 'dirt', distanceM: index % 3 ? 2000 : 1600,
  horse: n(ja, ko), sex: index % 2 ? 'female' : 'male', age: index % 2 ? 3 : 2,
  jockey: n('例示騎手' + (index + 1), '예시 기수 ' + (index + 1)), weightKg: index % 2 ? 54 : 56,
  review: { required: false, notes: null },
  extras: { popularity: null, gate: null, horseNumber: null, trainer: null, finishPosition: null, previousRace: null, interval: null },
});
export const example = {
  schemaVersion: '1.0.0', isExample: true, referenceDate: '2026-11-05',
  sourceUrl: 'https://example.com/fictional-jra-table',
  notes: 'UI 검토를 위한 가상 데이터입니다. 첨부 캡처의 실제 출주 정보를 전사한 자료가 아닙니다.',
  stallions: [
    { id: 'contrail', name: n('コントレイル', '콘트레일'), sourceUrl: null, raceDays: [
      { date: '2026-11-07', entries: [row(2, 'サンプルホース一', '예시 호스 원'), row(6, 'サンプルホース二', '예시 호스 투', 1), row(12, 'サンプルホース三', '예시 호스 쓰리', 2)] },
      { date: '2026-11-08', entries: [row(1, 'サンプルホース四', '예시 호스 포'), row(9, 'サンプルホース五', '예시 호스 파이브', 1)] },
    ] },
    { id: 'kitasan-black', name: n('キタサンブラック', '키타산 블랙'), sourceUrl: null, raceDays: [
      { date: '2026-11-07', entries: [row(5, 'デモホース', '데모 호스', 1)] },
    ] },
    { id: 'gold-ship', name: n('ゴールドシップ', '골드 쉽'), sourceUrl: null, raceDays: [
      { date: '2026-11-08', entries: [{ ...row(4, '確認待ちホース', '검토 대기 호스'), weightKg: null, review: { required: true, notes: '부담중량이 판독되지 않은 가상 사례' } }] },
    ] },
  ],
};
