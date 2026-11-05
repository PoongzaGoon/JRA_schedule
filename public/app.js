const main = document.querySelector('#main');
const isAdmin = location.pathname === '/admin';
const state = { publication: null, configured: false, demo: false, selected: 'all', originals: false, extras: false, csrf: null, revisionId: 0, raw: '', dirty: false, result: null, confirmed: false, history: [], capture: null, restoringId: null, busy: false, message: '', error: '' };
const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = value => value?.ko || value?.ja || '확인 필요';
const textName = (value, original = false, css = '') => value ? `<span class="${css}">${h(label(value))}</span>${value.koKind === 'ai' ? '<span class="badge ai" title="AI 번역·음역">AI</span>' : value.koKind === 'unverified' ? '<span class="badge warning">미검증</span>' : value.koKind === 'official' ? '<span class="badge ai" title="관리자가 공식 표기로 입력한 값">공식 표기</span>' : ''}${!value.ko ? '<span class="missing"> · 번역 확인 필요</span>' : ''}${original && value.ja ? `<span class="ja" lang="ja">${h(value.ja)}</span>` : ''}` : '<span class="missing">확인 필요</span>';
const dateText = value => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeZone: 'Asia/Seoul' }).format(new Date(`${value}T00:00:00+09:00`));
const weekday = value => new Intl.DateTimeFormat('ko-KR', { weekday: 'long', timeZone: 'Asia/Seoul' }).format(new Date(`${value}T00:00:00+09:00`));
const timeText = value => value ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(value)) + ' KST' : '아직 게시되지 않음';
const totalRows = data => data.stallions.reduce((n, s) => n + s.raceDays.reduce((m, d) => m + d.entries.length, 0), 0);
const safeLink = url => { try { return new URL(url).protocol === 'https:' ? h(url) : '#'; } catch { return '#'; } };
async function api(path, body) {
  const res = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(state.csrf ? { 'X-CSRF-Token': state.csrf } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await res.json();
  if (!res.ok) { const error = new Error(value.message || value.errors?.[0]?.message || '요청을 처리하지 못했습니다.'); error.status = res.status; throw error; }
  return value;
}
let toastTimer;
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 6000); }
function download(name, content, type = 'application/json') { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function table(data, originals = false, selected = 'all', extras = false) {
  return data.stallions.filter(s => selected === 'all' || selected === s.id).map(s => `<section aria-label="${h(label(s.name))} 출주 일정"><div class="stallion-heading"><div><h3>${h(label(s.name))}</h3><span class="original-name" lang="ja">${h(s.name.ja)}</span></div><a href="${safeLink(s.sourceUrl || data.sourceUrl)}" target="_blank" rel="noopener noreferrer">원본 출처 ↗</a></div>${s.raceDays.length ? s.raceDays.map(day => `<article class="day-card"><div class="day-header"><div class="day-label"><span class="day-number">${h(day.date.slice(-2))}</span><div><h4>${h(dateText(day.date))} <span class="weekday">${h(weekday(day.date))}</span></h4><small>${h(label(s.name))} 산구 · 출주 일정</small></div></div><span class="badge">${day.entries.length}두</span></div>${day.entries.length ? `<div class="table-scroll" role="region" aria-label="${h(day.date)} 출주표, 가로 스크롤 가능" tabindex="0"><table><thead><tr><th scope="col">경마장</th><th scope="col">R</th><th scope="col">경주명</th><th scope="col">코스</th><th scope="col">마명</th><th scope="col">성별·나이</th><th scope="col">기수</th><th scope="col">부담중량</th>${extras ? '<th scope="col">인기</th><th scope="col">게이트</th><th scope="col">마번</th><th scope="col">조교사</th><th scope="col">착순</th><th scope="col">이전 경주</th><th scope="col">간격</th>' : ''}</tr></thead><tbody>${day.entries.map(row => {
    const review = row.review.required || ['raceNumber', 'venue', 'raceName', 'surface', 'distanceM', 'horse', 'sex', 'age', 'jockey', 'weightKg'].some(k => row[k] === null);
    return `<tr class="${review ? 'review-row' : ''}"><td>${textName(row.venue, originals)}</td><td><span class="race-number">${row.raceNumber === null ? '<span class="missing">확인 필요</span>' : row.raceNumber + 'R'}</span></td><td>${textName(row.raceName, originals)}</td><td><span class="course"><i class="course-dot ${row.surface === 'dirt' ? 'dirt' : ''}" aria-hidden="true"></i>${({ turf: '잔디', dirt: '더트', jump: '장애' })[row.surface] ?? '확인 필요'} ${row.distanceM === null ? '—' : h(row.distanceM) + 'm'}</span></td><td>${textName(row.horse, originals, 'horse-name')}${review ? `<span class="review-note">⚑ ${h(row.review.notes || '원본 확인 필요')}</span>` : ''}</td><td>${({ male: '수', female: '암', gelding: '거세' })[row.sex] ?? '—'} ${row.age ?? '—'}세</td><td>${textName(row.jockey, originals)}</td><td>${row.weightKg === null ? '<span class="missing">확인 필요</span>' : h(row.weightKg.toFixed(1)) + 'kg'}</td>${extras ? `<td>${row.extras.popularity ?? '—'}</td><td>${row.extras.gate ?? '—'}</td><td>${row.extras.horseNumber ?? '—'}</td><td>${row.extras.trainer ? textName(row.extras.trainer, originals) : '—'}</td><td>${row.extras.finishPosition ?? '—'}</td><td>${h(row.extras.previousRace || '—')}</td><td>${h(row.extras.interval || '—')}</td>` : ''}</tr>`;
  }).join('')}</tbody></table></div>` : '<p class="source-note">이 날짜에 등록된 출주 행이 없습니다.</p>'}</article>`).join('') : '<div class="empty"><p>등록된 출주 일정이 없습니다.</p></div>'}</section>`).join('');
}
function renderPublic() {
  const pub = state.publication, data = pub?.data;
  if (!data) {
    main.innerHTML = `<section class="hero"><div><span class="eyebrow">Weekly JRA runners · Capture review</span><h1>JRA 종마별 산구<br>출주 일정</h1><p>원본에서 확인하고, 한국어로 함께 읽는 출주 기록.</p></div><div class="hero-side"><span class="status-dot">첫 번째 출주 노트를 기다리는 중</span><div class="edition">Journal<small>CAPTURE · REVIEW · PUBLISH</small></div></div></section><div class="empty"><div class="empty-symbol" aria-hidden="true">▤</div><h2>아직 게시된 일정이 없습니다</h2><p>관리자가 원본과 대조한 출주표를 게시하면 여기에 표시됩니다.<br>지금은 가상의 예시로 화면과 표 구성을 살펴볼 수 있습니다.</p><button data-action="demo">가상 예시 살펴보기 <span aria-hidden="true">→</span></button> <a class="button secondary" href="/admin">관리자 작업실</a></div>${!state.configured ? '<div class="notice info">서버 인증·저장소 설정이 필요합니다. 관리자 화면에서 설정 상태를 확인할 수 있습니다.</div>' : ''}`;
    return;
  }
  const dates = [...new Set(data.stallions.flatMap(s => s.raceDays.map(d => d.date)))].sort();
  main.innerHTML = `<section class="hero"><div><span class="eyebrow">Weekly JRA runners · Capture review</span><h1>JRA 종마별 산구<br>출주 일정</h1><p class="date-line">${dates.length ? `${h(dateText(dates[0]))} — ${h(dateText(dates.at(-1)))}` : '등록된 일정 없음'}</p><p>자료 기준일 ${h(data.referenceDate)} · 마지막 게시 ${h(timeText(pub.publishedAt))}</p></div><div class="hero-side"><span class="status-dot">${data.isExample ? '가상 예시 · 실제 출주 정보 아님' : '관리자 검토 후 게시된 자료'}</span><div class="edition">${h(data.referenceDate.slice(5).replace('-', '.'))}<small>THE WEEKLY EDITION</small></div></div></section>${data.isExample ? `<div class="notice"><strong>가상 예시</strong><span>실제 캡처를 전사한 자료가 아닙니다. 경기·말·기수 정보는 UI 검토를 위한 예시입니다.</span>${state.demo ? '<button class="ghost small" data-action="exit-demo">닫기</button>' : ''}</div>` : ''}<div class="stats"><div class="stat"><span>등록 종마</span><strong>${data.stallions.length}<small>종</small></strong></div><div class="stat"><span>출주 일정</span><strong>${dates.length}<small>일</small></strong></div><div class="stat"><span>전체 출주</span><strong>${totalRows(data)}<small>두</small></strong></div></div><div class="section-title"><div><span class="eyebrow">Runners by stallion</span><h2>이번 주 출주 노트</h2><p>종마를 선택해 출주 일정을 확인하세요.</p></div><button class="secondary small" data-action="print">인쇄 / PDF ↗</button></div><div class="controls"><div class="tabs" role="group" aria-label="종마 선택"><button class="tab ${state.selected === 'all' ? 'active' : ''}" aria-pressed="${state.selected === 'all'}" data-stallion="all">전체</button>${data.stallions.map(s => `<button class="tab ${state.selected === s.id ? 'active' : ''}" aria-pressed="${state.selected === s.id}" data-stallion="${h(s.id)}">${h(label(s.name))}<b>${s.raceDays.reduce((n, d) => n + d.entries.length, 0)}</b></button>`).join('')}</div><label class="switch"><input id="extras" type="checkbox" ${state.extras ? 'checked' : ''}> 부가 열 보기</label><label class="switch"><input id="originals" type="checkbox" ${state.originals ? 'checked' : ''}> 일본어 원문 함께 보기</label></div>${table(data, state.originals, state.selected, state.extras)}<p class="source-note">${h(data.notes || '')}<br>AI 표시: AI 번역·음역 · 미검증: 추가 확인 필요 · 공식 표기: 관리자가 공식 표기로 입력한 값<br>출처 <a href="${safeLink(data.sourceUrl)}" target="_blank" rel="noopener noreferrer">원본 페이지 확인 ↗</a></p>`;
}
function renderLogin() {
  main.innerHTML = `<div class="login-layout"><section class="login-intro"><span class="eyebrow">The editor's desk</span><h1>확인한 기록을,<br>함께 읽는 일정으로.</h1><p>GPT로 추출한 표를 붙여넣고 원본과 대조하세요.<br>검증과 미리보기를 거친 자료만 공개 일정에 반영됩니다.</p><div class="workflow"><span>01 데이터 입력</span><span>02 원본 대조</span><span>03 검토 후 게시</span></div><div class="notice info">이 프로토타입은 웹 수집이나 GPT API를 호출하지 않습니다.</div></section><section class="panel login-panel"><span class="eyebrow">Administrator</span><h2>관리자 로그인</h2>${!state.configured ? '<div class="notice error">서버 설정이 필요합니다. 관리자 비밀번호 해시, 영속 저장소 경로, 사이트 주소를 설정하세요.</div><ul class="setup-list"><li><code>ADMIN_PASSWORD_HASH</code>: 서버 전용 비밀번호 해시</li><li><code>DATABASE_PATH</code>: 영속 SQLite 파일</li><li><code>APP_ORIGIN</code>: 이 사이트의 정확한 origin</li></ul>' : '<p>게시·복원 권한은 서버에서 확인합니다.</p>'}<form id="login-form"><label class="field-label" for="password">관리자 비밀번호</label><input id="password" type="password" autocomplete="current-password" required maxlength="256" ${!state.configured ? 'disabled' : ''}><p id="login-error" class="error-text help" role="alert">${h(state.error)}</p><button type="submit" ${!state.configured ? 'disabled' : ''}>관리자 작업실 열기 →</button></form><p class="help">공유 PC에서는 작업 후 반드시 로그아웃하세요.</p></section></div>`;
}
function renderValidation() {
  const r = state.result;
  if (!r) return '<p class="help">입력한 내용을 검증하면 오류·경고와 날짜별 행 수가 표시됩니다.</p>';
  return `<div class="validation-summary"><span class="badge ${r.ok ? '' : 'warning'}">${r.ok ? '형식 검증 통과' : '수정 필요'}</span><span>오류 ${r.errors.length} · 경고 ${r.warnings.length}</span></div>${r.totalRows !== undefined ? `<p>전체 <strong>${r.totalRows}행</strong> · ${r.counts.map(c => `${h(c.stallionId)} / ${h(c.date)} ${c.rows}행`).join(' · ')}</p>` : ''}${r.errors.length ? `<ul class="error-text">${r.errors.map(e => `<li><code>${h(e.path)}</code>${h(e.message)}</li>`).join('')}</ul>` : ''}${r.warnings.length ? `<details open><summary class="warning-text">원본 대조가 필요한 경고 ${r.warnings.length}개</summary><ul class="warning-text">${r.warnings.map(e => `<li><code>${h(e.path)}</code>${h(e.message)}</li>`).join('')}</ul></details>` : ''}`;
}
function renderAdmin() {
  if (!state.csrf) return renderLogin();
  main.innerHTML = `<div class="page-heading"><div><span class="eyebrow">The editor's desk</span><h1>관리자 작업실</h1><p>원본과 대조한 뒤 게시하세요. 입력과 미리보기는 공개 화면을 바꾸지 않습니다.</p></div><button class="secondary small" data-action="logout">로그아웃</button></div>${state.message ? `<div class="notice info" role="status">${h(state.message)}</div>` : ''}${state.error ? `<div class="notice error" role="alert">${h(state.error)}</div>` : ''}<div class="editor-layout"><div><section class="panel editor"><h2><span class="step-label">01</span>출주 데이터 입력</h2><p>GPT가 출력한 JSON 객체를 그대로 붙여넣거나 파일을 불러오세요.</p><div class="toolbar"><label class="button secondary small" for="json-file">JSON 파일 열기</label><input id="json-file" type="file" accept="application/json,.json" hidden><button class="ghost small" data-action="load-example">가상 예시 불러오기</button><button class="ghost small" data-action="load-current">현재 게시본 불러오기</button></div><label class="field-label" for="json-editor">출주표 JSON · 최대 2MB</label><textarea id="json-editor" spellcheck="false" placeholder='{"schemaVersion": "1.0.0", ...}'>${h(state.raw)}</textarea><div class="toolbar"><button data-action="validate" ${state.busy ? 'disabled' : ''}>검증하고 미리보기 →</button><button class="secondary" data-action="export">JSON 저장</button></div><div class="help">입력 내용은 자동 저장되지 않습니다. 이동·로그아웃 전에 필요한 초안을 JSON으로 저장하세요.</div></section><section class="panel validation" id="validation-panel"><h2><span class="step-label">02</span>검증 결과</h2>${renderValidation()}<div class="publish-controls" ${!state.result?.ok ? 'hidden' : ''}><label class="review-check"><input id="confirm-review" type="checkbox" ${state.confirmed ? 'checked' : ''}> 원본·행 수·경고를 검토했습니다. ${state.restoringId ? '이전 게시본으로 복원하는 것' : '전체 공개 일정이 이 데이터로 교체되는 것'}을 확인합니다.</label><div class="publish-bar"><button data-action="publish" ${!state.result?.ok || !state.confirmed || state.busy ? 'disabled' : ''}>${state.restoringId ? '#' + state.restoringId + ' 게시본으로 복원' : '검토한 일정 게시'}</button><p>검증 기준 게시본 #${state.revisionId}<br>다른 게시가 먼저 반영되면 다시 검증해야 합니다.</p></div></div></section>${state.result?.ok ? `<section id="preview" class="preview-table"><div class="preview-heading"><strong>03 · 공개 화면 미리보기${state.restoringId ? ' · 복원 대상 #' + state.restoringId : ''}</strong><span>아직 게시되지 않았습니다</span></div>${table(state.result.data, true, 'all', true)}</section>` : ''}</div><aside><section class="panel side-panel"><h2>원본 캡처와 비교</h2><p>출주표를 날짜별로 크게 캡처하면 대조하기 쉽습니다.</p><div class="file-area"><label for="capture-file">비교할 이미지 열기</label><input id="capture-file" type="file" accept="image/png,image/jpeg,image/webp"><p class="help">PNG·JPEG·WebP / 최대 10MB<br>이미지는 이 브라우저에서만 표시하며 서버로 전송하거나 게시하지 않습니다.</p></div>${state.capture ? `<div class="toolbar"><button class="secondary small" data-action="zoom">원본 크기 전환</button><button class="ghost small" data-action="clear-capture">닫기</button></div><div class="capture-frame"><img src="${h(state.capture)}" alt="관리자가 대조용으로 선택한 원본 캡처"></div>` : ''}</section><section class="panel side-panel"><h2>GPT 추출 도구</h2><p>스키마가 포함된 프롬프트를 복사한 뒤 GPT에 캡처와 함께 전달하세요.</p><div class="toolbar"><button class="secondary small" data-action="copy-prompt">프롬프트 복사</button><a class="button secondary small" href="/extraction-prompt.txt" download>TXT 저장</a></div><details class="prompt-details"><summary>스키마와 작성 규칙 보기</summary><pre id="prompt-preview">${h(state.prompt || '프롬프트 불러오는 중…')}</pre></details><p class="help"><a href="/schedule.schema.json" download>JSON Schema 다운로드 ↗</a><br>AI 전사·번역의 정확성은 보장되지 않습니다.</p></section></aside></div><section class="panel"><div class="section-title no-margin"><div><h2>게시 이력</h2><p>복원도 새 게시본으로 기록되며 이전 이력은 남습니다. 최근 100개를 표시합니다.</p></div><button class="secondary small" data-action="refresh-history">새로고침</button></div><ul class="history-list">${state.history.length ? state.history.map(r => `<li class="history-item"><div><strong>#${r.id} · ${r.kind === 'restore' ? '#' + r.restoredFrom + ' 복원' : '일정 게시'} ${r.id === state.currentId ? '<span class="badge">현재 공개본</span>' : ''}</strong><small>${h(timeText(r.publishedAt))}</small></div><button class="secondary small" data-revision="${r.id}">검토${r.id === state.currentId ? '' : '·복원'}</button></li>`).join('') : '<p class="help">아직 게시 이력이 없습니다.</p>'}</ul></section>`;
}
async function refreshHistory() { const result = await api('/api/admin/history'); state.history = result.revisions; state.currentId = result.currentId; }
async function validate() {
  const snapshot = state.raw;
  const result = await api('/api/admin/validate', { raw: snapshot });
  if (state.raw !== snapshot) throw new Error('검증 중 입력이 변경되었습니다. 최신 내용을 다시 검증하세요.');
  state.result = result; state.revisionId = result.revisionId; state.confirmed = false;
}
async function perform(action, el) {
  if (state.busy) return;
  state.busy = true; if (el) el.disabled = true;
  try {
    state.error = '';
    if (action === 'demo') { state.publication = { data: await (await fetch('/example.json')).json(), publishedAt: null }; state.demo = true; state.selected = 'all'; renderPublic(); }
    if (action === 'exit-demo') { const r = await api('/api/public'); state.publication = r.publication; state.demo = false; renderPublic(); }
    if (action === 'print') window.print();
    if (action === 'logout') {
      await api('/api/admin/logout', {}); state.csrf = null; state.raw = ''; state.dirty = false; state.result = null; state.history = []; state.error = ''; state.message = '';
      if (state.capture) URL.revokeObjectURL(state.capture); state.capture = null; renderLogin();
    }
    if (action === 'validate') { await validate(); renderAdmin(); document.querySelector('#validation-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    if (action === 'load-example') { state.raw = JSON.stringify(await (await fetch('/example.json')).json(), null, 2); state.dirty = true; state.result = null; state.confirmed = false; state.restoringId = null; renderAdmin(); }
    if (action === 'load-current') {
      const r = await api('/api/public');
      if (!r.publication) throw new Error('아직 게시된 일정이 없습니다.');
      state.raw = JSON.stringify(r.publication.data, null, 2); state.dirty = false; state.result = null; state.confirmed = false; state.restoringId = null; renderAdmin();
    }
    if (action === 'export') {
      if (!state.raw.trim()) throw new Error('저장할 입력이 없습니다.');
      download('schedule-draft.json', state.raw); toast('초안을 JSON 파일로 저장했습니다.');
    }
    if (action === 'copy-prompt') {
      try { await navigator.clipboard.writeText(state.prompt); toast('GPT 추출 프롬프트를 복사했습니다.'); }
      catch { download('GPT-PROMPT.txt', state.prompt, 'text/plain'); toast('클립보드에 접근할 수 없어 TXT 파일로 저장했습니다.'); }
    }
    if (action === 'zoom') { document.querySelector('.capture-frame')?.classList.toggle('zoom'); document.querySelector('.capture-frame img')?.classList.toggle('zoom'); }
    if (action === 'clear-capture') { if (state.capture) URL.revokeObjectURL(state.capture); state.capture = null; renderAdmin(); }
    if (action === 'refresh-history') { await refreshHistory(); renderAdmin(); }
    if (action === 'revision') {
      const { revision } = await api(`/api/admin/revisions/${el.dataset.revision}`);
      state.raw = JSON.stringify(revision.data, null, 2); state.restoringId = revision.id;
      await validate(); renderAdmin(); document.querySelector('#validation-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (action === 'publish') {
      if (!state.result?.ok || !state.confirmed) throw new Error('검증과 원본 대조 확인이 필요합니다.');
      const result = await api(state.restoringId ? '/api/admin/restore' : '/api/admin/publish', { raw: state.raw, revisionId: state.restoringId, expectedRevision: state.revisionId, confirmWarnings: state.confirmed });
      state.message = `게시본 #${result.publication.id}이 ${state.restoringId ? '복원되어' : '저장되어'} 공개 화면에 반영되었습니다.`;
      state.result = null; state.confirmed = false; state.restoringId = null; state.dirty = false; await refreshHistory(); renderAdmin(); toast('공개 출주 일정이 갱신되었습니다.');
    }
  } catch (error) {
    if (error.status === 401 && isAdmin) { state.csrf = null; state.error = error.message; renderLogin(); }
    else if (isAdmin) { state.error = error.message; if (error.status === 409) state.result = null; renderAdmin(); }
    else toast(error.message);
  } finally {
    state.busy = false;
    // Re-enable freshly rendered validation controls after an asynchronous action.
    main.querySelectorAll('[data-action="validate"]').forEach(b => b.disabled = false);
    const publish = main.querySelector('[data-action="publish"]'); if (publish) publish.disabled = !state.result?.ok || !state.confirmed;
    if (el?.isConnected) el.disabled = false;
  }
}
main.addEventListener('click', event => {
  const filter = event.target.closest('[data-stallion]');
  if (filter) { state.selected = filter.dataset.stallion; renderPublic(); return; }
  const el = event.target.closest('[data-action], [data-revision]');
  if (el) void perform(el.dataset.action || 'revision', el);
});
main.addEventListener('submit', async event => {
  if (event.target.id !== 'login-form') return;
  event.preventDefault();
  const button = event.target.querySelector('button'); button.disabled = true;
  try {
    const result = await api('/api/admin/login', { password: document.querySelector('#password').value });
    document.querySelector('#password').value = '';
    state.csrf = result.csrf; state.revisionId = result.revisionId; state.error = ''; await refreshHistory(); renderAdmin();
  } catch (error) { const box = document.querySelector('#login-error'); if (box) box.textContent = error.message; }
  finally { if (button.isConnected) button.disabled = false; }
});
main.addEventListener('input', event => {
  if (event.target.id !== 'json-editor') return;
  state.raw = event.target.value; state.dirty = true; state.result = null; state.confirmed = false; state.restoringId = null;
  document.querySelector('#preview')?.remove();
  document.querySelector('.publish-controls')?.setAttribute('hidden', '');
  const panel = document.querySelector('#validation-panel');
  if (panel) panel.innerHTML = '<h2>검증 결과</h2><p class="help">내용이 변경되었습니다. 다시 검증하세요.</p>';
});
main.addEventListener('change', async event => {
  if (event.target.id === 'extras') { state.extras = event.target.checked; renderPublic(); }
  if (event.target.id === 'originals') { state.originals = event.target.checked; renderPublic(); }
  if (event.target.id === 'confirm-review') { state.confirmed = event.target.checked; const b = document.querySelector('[data-action="publish"]'); if (b) b.disabled = !state.confirmed; }
  if (event.target.id === 'json-file') {
    const file = event.target.files[0]; if (!file) return;
    if (state.busy) { event.target.value = ''; return toast('진행 중인 작업이 끝난 뒤 파일을 다시 선택하세요.'); }
    if (file.size > 2 * 1024 * 1024) return toast('JSON 파일은 최대 2MB입니다.');
    const raw = await file.text();
    if (state.busy) return toast('진행 중인 작업이 끝난 뒤 파일을 다시 선택하세요.');
    state.raw = raw; state.dirty = true; state.result = null; state.confirmed = false; state.restoringId = null; renderAdmin();
  }
  if (event.target.id === 'capture-file') {
    const file = event.target.files[0]; if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) return toast('10MB 이하의 PNG·JPEG·WebP를 선택하세요.');
    if (state.capture) URL.revokeObjectURL(state.capture); state.capture = URL.createObjectURL(file); renderAdmin();
  }
});
window.addEventListener('beforeunload', event => { if (isAdmin && state.dirty && state.csrf) { event.preventDefault(); event.returnValue = ''; } });
document.querySelector(isAdmin ? '#admin-nav' : '#public-nav').classList.add('active');
try {
  const result = await api('/api/public'); state.publication = result.publication; state.configured = result.configured;
  if (isAdmin) {
    state.prompt = await (await fetch('/extraction-prompt.txt')).text();
    try { const session = await api('/api/admin/session'); state.csrf = session.csrf; state.revisionId = session.revisionId; await refreshHistory(); } catch { /* Login or setup screen. */ }
    renderAdmin();
  } else renderPublic();
} catch (error) { main.innerHTML = `<div class="empty"><h2>화면을 불러오지 못했습니다</h2><p>${h(error.message)}</p><a class="button" href="${isAdmin ? '/admin' : '/'}">다시 시도</a></div>`; }
