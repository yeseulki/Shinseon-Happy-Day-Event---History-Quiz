import { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';

const POLL_INTERVAL = 1500;

const EMPTY_QUESTION = {
  id: null,
  category: '한국사',
  question: '',
  answer: '',
  hint: '',
  hint_type: 'text',
  image: null,
  invalid_answers: [],
  note: '',
};

export default function AdminPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [serverState, setServerState] = useState({
    phase: 'idle',
    teamId: 1,
    questionIndex: 0,
    questionId: null,
    timerStartedAt: null,
    timerTotal: 90,
    solvedIds: [],
  });
  const [questions, setQuestions] = useState([]);
  const [questionsMetadata, setQuestionsMetadata] = useState({});
  const [timerDisplay, setTimerDisplay] = useState(90);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // 문제 편집 모달
  const [editModal, setEditModal] = useState(null); // null | { mode: 'add'|'edit', draft: {...} }
  const [isSavingQ, setIsSavingQ] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // 선택 중인 문제 (시작 전에만 변경 가능)
  const [selectedQ0, setSelectedQ0] = useState(null);
  const [selectedQ1, setSelectedQ1] = useState(null);

  const timerIntervalRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const loadQuestions = useCallback(() => {
    fetch('/questions.json')
      .then((r) => r.json())
      .then((data) => {
        const qs = data.questions || [];
        setQuestions(qs);
        setQuestionsMetadata({ event: data.event, date: data.date, note: data.note });
        setSelectedQ0((prev) => prev ?? (qs[0]?.id ?? null));
        setSelectedQ1((prev) => prev ?? (qs[1]?.id ?? null));
      });
  }, []);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  // 폴링
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) return;
        const data = await res.json();
        setServerState(data);
      } catch {}
    };
    poll();
    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(pollIntervalRef.current);
  }, []);

  // 타이머 카운트다운
  useEffect(() => {
    clearInterval(timerIntervalRef.current);
    const isRunning = serverState.phase === 'question' || serverState.phase === 'hint';
    if (isRunning && serverState.timerStartedAt) {
      const tick = () => {
        const elapsed = (Date.now() - new Date(serverState.timerStartedAt).getTime()) / 1000;
        const remaining = Math.max(0, Math.ceil(serverState.timerTotal - elapsed));
        setTimerDisplay(remaining);
        setElapsedSeconds(elapsed);
        if (remaining <= 0) clearInterval(timerIntervalRef.current);
      };
      tick();
      timerIntervalRef.current = setInterval(tick, 500);
    } else {
      setTimerDisplay(serverState.timerTotal || 90);
      setElapsedSeconds(0);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [serverState.phase, serverState.timerStartedAt, serverState.timerTotal]);

  const postState = useCallback(async (update) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      if (res.ok) setServerState(await res.json());
    } catch {}
    setIsSaving(false);
  }, []);

  const isActive = serverState.phase === 'question' || serverState.phase === 'hint';
  const isUrgent = timerDisplay <= 10 && isActive;
  const timerPct = serverState.timerTotal > 0 ? timerDisplay / serverState.timerTotal : 1;

  const currentSlotQId = serverState.questionIndex === 0 ? selectedQ0 : selectedQ1;
  const currentQuestion = questions.find((q) => q.id === serverState.questionId) || null;
  const solvedIds = serverState.solvedIds || [];

  const handleStartQuestion = () => {
    if (!currentSlotQId) return;
    postState({
      phase: 'question',
      questionId: currentSlotQId,
      timerStartedAt: new Date().toISOString(),
      timerTotal: 90,
    });
  };

  const handleOpenHint = () => postState({ phase: 'hint' });

  const handleRevealAnswer = () => {
    const newSolved = solvedIds.includes(serverState.questionId)
      ? solvedIds
      : [...solvedIds, serverState.questionId];
    postState({ phase: 'answer', solvedIds: newSolved });
  };

  const handleNextQuestion = () =>
    postState({ phase: 'idle', questionIndex: 1, questionId: null, timerStartedAt: null });

  const handleFinish = () =>
    postState({ phase: 'idle', questionIndex: 0, questionId: null, timerStartedAt: null });

  const handleReset = () => {
    if (!window.confirm('진행 중인 문제를 종료하고 대기 화면으로 돌아갈까요?')) return;
    postState({ phase: 'idle', questionIndex: 0, questionId: null, timerStartedAt: null });
  };

  const handleClearSolved = () => {
    if (!window.confirm('풀이 완료 표시를 모두 초기화할까요?')) return;
    postState({ solvedIds: [] });
  };

  // 문제 편집/추가 핸들러
  const openAddModal = () => {
    const maxId = questions.reduce((m, q) => Math.max(m, q.id), 0);
    setEditModal({
      mode: 'add',
      draft: { ...EMPTY_QUESTION, id: maxId + 1 },
      invalidAnswersText: '',
    });
  };

  const openEditModal = (q) => {
    setEditModal({
      mode: 'edit',
      draft: { ...q },
      invalidAnswersText: (q.invalid_answers || []).join(', '),
    });
  };

  const closeModal = () => setEditModal(null);

  const updateDraft = (field, value) => {
    setEditModal((prev) => ({ ...prev, draft: { ...prev.draft, [field]: value } }));
  };

  const handleImageFile = (file) => {
    if (!file) return;
    const MAX = 10 * 1024 * 1024;
    if (file.size > MAX) { alert('파일 크기는 10MB 이하여야 합니다.'); return; }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, contentType: file.type, data: base64 }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'upload failed');
        updateDraft('image', json.url);
      } catch (err) {
        alert('이미지 업로드 실패: ' + err.message);
      }
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const saveQuestion = async () => {
    const { draft, invalidAnswersText } = editModal;
    if (!draft.question.trim() || !draft.answer.trim()) {
      alert('문제와 정답은 필수입니다.');
      return;
    }
    const invalid = invalidAnswersText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const finalQ = {
      ...draft,
      invalid_answers: invalid,
      image: draft.hint_type === 'image' ? (draft.image || null) : null,
      note: draft.note || undefined,
    };
    if (!finalQ.note) delete finalQ.note;

    let newQuestions;
    if (editModal.mode === 'add') {
      newQuestions = [...questions, finalQ];
    } else {
      newQuestions = questions.map((q) => (q.id === finalQ.id ? finalQ : q));
    }

    const payload = { ...questionsMetadata, questions: newQuestions };
    setIsSavingQ(true);
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('save failed');
      setQuestions(newQuestions);
      closeModal();
    } catch {
      alert('저장에 실패했습니다. 다시 시도해주세요.');
    }
    setIsSavingQ(false);
  };

  const deleteQuestion = async (qId) => {
    if (!window.confirm('이 문제를 삭제할까요?')) return;
    const newQuestions = questions.filter((q) => q.id !== qId);
    const payload = { ...questionsMetadata, questions: newQuestions };
    setIsSavingQ(true);
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('save failed');
      setQuestions(newQuestions);
    } catch {
      alert('삭제에 실패했습니다.');
    }
    setIsSavingQ(false);
  };

  // 문제 선택 핸들러 (슬롯 0 or 1)
  const selectQuestion = (slotIdx, qId) => {
    if (slotIdx === 0) setSelectedQ0(qId);
    else setSelectedQ1(qId);
  };

  // 슬롯별 선택 가능 여부
  const canSelectSlot = (slotIdx) => {
    if (isActive && serverState.questionIndex === slotIdx) return false;
    if (serverState.phase === 'answer' && serverState.questionIndex === slotIdx) return false;
    return true;
  };

  const phaseLabel = {
    idle: '⏸ 대기',
    question: '▶ 문제 진행',
    hint: '💡 힌트 공개',
    answer: '✅ 정답 공개',
  }[serverState.phase] || '';

  if (!mounted) return null;

  return (
    <>
      <Head>
        <title>출제자 화면 · 역사퀴즈</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <style>{`
        html, body {
          background: #1B3358;
          min-height: 100%;
          font-family: 'A2Z', 'Noto Sans KR', sans-serif;
          color: #fff;
        }
        .page {
          min-height: 100vh;
          background: #1B3358;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          max-width: 960px;
          margin: 0 auto;
        }
        .page-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
        }
        .page-title {
          font-weight: 900;
          font-size: 20px;
          letter-spacing: 1px;
        }
        .saving { font-size: 12px; color: rgba(255,255,255,0.45); }

        /* 패널 */
        .panel {
          background: #fff;
          border-radius: 16px;
          padding: 18px 20px;
          color: #1B3358;
        }
        .panel-title {
          font-weight: 700;
          font-size: 11px;
          color: #8A97A6;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          margin-bottom: 12px;
        }

        /* 상태 배지 + 타이머 */
        .status-row {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        .phase-badge {
          font-weight: 700;
          font-size: 13px;
          padding: 4px 12px;
          border-radius: 999px;
        }
        .phase-idle     { background:#F1F5F9; color:#64748B; }
        .phase-question { background:#DCFCE7; color:#16A34A; }
        .phase-hint     { background:#FEF9C3; color:#CA8A04; }
        .phase-answer   { background:#DBEAFE; color:#1D4ED8; }

        .timer-big {
          font-weight: 900;
          font-size: 48px;
          line-height: 1;
          color: #1B3358;
          min-width: 64px;
          text-align: right;
        }
        .timer-big.urgent { color: #EF4444; }
        .timer-track {
          flex: 1;
          min-width: 120px;
          height: 12px;
          background: #EAF3F7;
          border-radius: 999px;
          overflow: hidden;
        }
        .timer-fill {
          height: 100%;
          background: #FF8FA3;
          border-radius: 999px;
          transform-origin: left center;
          transition: transform 0.5s linear, background 0.4s;
        }
        .timer-fill.urgent { background: #FF5C7A; }

        /* 제어 버튼 */
        .btn-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .btn {
          font-family: 'A2Z', sans-serif;
          font-weight: 700;
          font-size: 15px;
          border: none;
          border-radius: 12px;
          padding: 13px 20px;
          cursor: pointer;
          color: #fff;
          transition: opacity 0.15s, transform 0.1s;
          white-space: nowrap;
        }
        .btn:hover:not(:disabled) { opacity: 0.85; }
        .btn:active:not(:disabled) { transform: scale(0.96); }
        .btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .btn-start  { background: #22C55E; }
        .btn-hint   { background: #FFC94A; color: #1B3358; }
        .btn-answer { background: #2CADD9; }
        .btn-next   { background: #64748B; }
        .btn-finish { background: #EF4444; }
        .btn-reset  { background: transparent; border: 2px solid rgba(255,255,255,0.25); color: rgba(255,255,255,0.6); font-size: 13px; padding: 8px 14px; border-radius: 10px; cursor: pointer; font-family: 'A2Z', sans-serif; font-weight: 700; transition: all 0.15s; }
        .btn-reset:hover { border-color: #EF4444; color: #EF4444; }

        /* 오답 경고 */
        .invalid-box {
          background: #FFF3CD;
          border: 2px solid #F59E0B;
          border-radius: 10px;
          padding: 12px 16px;
          display: flex;
          gap: 10px;
          align-items: flex-start;
          margin-top: 10px;
        }
        .invalid-box-body { font-weight: 700; font-size: 14px; color: #7C4400; }
        .invalid-tag {
          display: inline-block;
          background: #FDE68A;
          border-radius: 6px;
          padding: 1px 8px;
          margin: 2px;
          color: #7C4400;
        }

        /* 문제 목록 */
        .q-list {
          display: flex;
          flex-direction: column;
          gap: 0;
          max-height: 420px;
          overflow-y: auto;
          border: 1.5px solid #DCE6EC;
          border-radius: 10px;
        }
        .q-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          cursor: pointer;
          border-bottom: 1px solid #F1F5F9;
          transition: background 0.1s;
          position: relative;
        }
        .q-item:last-child { border-bottom: none; }
        .q-item:hover:not(.q-disabled) { background: #F0F9FF; }
        .q-item.q-disabled { cursor: default; opacity: 0.6; }

        .q-num {
          font-weight: 900;
          font-size: 13px;
          color: #8A97A6;
          min-width: 28px;
          text-align: center;
        }
        .q-cat {
          font-weight: 700;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .cat-한국사 { background: #EFF6FF; color: #3B82F6; }
        .cat-세계사 { background: #F0FDF4; color: #22C55E; }

        .q-text {
          font-weight: 600;
          font-size: 13px;
          color: #1B3358;
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .q-answer {
          font-weight: 900;
          font-size: 13px;
          color: #2CADD9;
          white-space: nowrap;
        }

        /* 슬롯 배지 */
        .slot-tag {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 6px;
          white-space: nowrap;
        }
        .slot-tag-0 { background: #2CADD9; color: #fff; }
        .slot-tag-1 { background: #FF8FA3; color: #fff; }

        /* 완료 표시 */
        .solved-check {
          font-size: 15px;
          color: #22C55E;
          flex-shrink: 0;
        }

        /* 슬롯 선택 버튼 */
        .slot-btn-group {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }
        .slot-btn {
          font-family: 'A2Z', sans-serif;
          font-weight: 700;
          font-size: 11px;
          border: 1.5px solid #DCE6EC;
          border-radius: 6px;
          padding: 3px 8px;
          cursor: pointer;
          background: #fff;
          color: #8A97A6;
          transition: all 0.1s;
        }
        .slot-btn:hover:not(:disabled) { border-color: #2CADD9; color: #2CADD9; }
        .slot-btn.active-0 { background: #2CADD9; border-color: #2CADD9; color: #fff; }
        .slot-btn.active-1 { background: #FF8FA3; border-color: #FF8FA3; color: #fff; }
        .slot-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        /* 현재 선택된 슬롯 표시 */
        .slots-summary {
          display: flex;
          gap: 10px;
          margin-bottom: 10px;
          flex-wrap: wrap;
        }
        .slot-summary-item {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #F8FAFC;
          border: 1.5px solid #DCE6EC;
          border-radius: 8px;
          padding: 7px 12px;
          font-size: 13px;
          font-weight: 600;
          color: #1B3358;
          flex: 1;
          min-width: 200px;
        }
        .slot-summary-item.active-slot { border-color: #2CADD9; background: #EBF7FC; }
        .slot-arrow { color: #8A97A6; font-size: 11px; margin: 0 2px; }

        /* 편집 버튼 */
        .btn-edit {
          font-family: 'A2Z', sans-serif;
          font-weight: 700;
          font-size: 11px;
          border: 1.5px solid #DCE6EC;
          border-radius: 6px;
          padding: 3px 8px;
          cursor: pointer;
          background: #fff;
          color: #8A97A6;
          transition: all 0.1s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .btn-edit:hover { border-color: #8B5CF6; color: #8B5CF6; }

        .btn-add-q {
          font-family: 'A2Z', sans-serif;
          font-weight: 700;
          font-size: 13px;
          border: 2px dashed #DCE6EC;
          border-radius: 8px;
          padding: 8px 16px;
          cursor: pointer;
          background: transparent;
          color: #8A97A6;
          transition: all 0.15s;
          width: 100%;
          margin-top: 8px;
        }
        .btn-add-q:hover { border-color: #22C55E; color: #22C55E; }

        /* 모달 오버레이 */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .modal {
          background: #fff;
          border-radius: 20px;
          padding: 28px 28px 24px;
          width: 100%;
          max-width: 560px;
          max-height: 90vh;
          overflow-y: auto;
          color: #1B3358;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .modal-title {
          font-weight: 900;
          font-size: 18px;
          color: #1B3358;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-label {
          font-weight: 700;
          font-size: 11px;
          color: #8A97A6;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .form-input, .form-select, .form-textarea {
          font-family: 'A2Z', 'Noto Sans KR', sans-serif;
          font-size: 14px;
          border: 1.5px solid #DCE6EC;
          border-radius: 8px;
          padding: 10px 12px;
          color: #1B3358;
          background: #F8FAFC;
          transition: border-color 0.15s;
          outline: none;
        }
        .form-input:focus, .form-select:focus, .form-textarea:focus {
          border-color: #2CADD9;
          background: #fff;
        }
        .form-textarea {
          resize: vertical;
          min-height: 80px;
        }
        .form-row {
          display: flex;
          gap: 12px;
        }
        .form-row .form-group { flex: 1; }

        .modal-footer {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          padding-top: 4px;
          border-top: 1px solid #F1F5F9;
          margin-top: 4px;
        }
        .btn-modal-cancel {
          font-family: 'A2Z', sans-serif;
          font-weight: 700;
          font-size: 14px;
          border: 1.5px solid #DCE6EC;
          border-radius: 10px;
          padding: 11px 20px;
          cursor: pointer;
          background: #fff;
          color: #8A97A6;
          transition: all 0.15s;
        }
        .btn-modal-cancel:hover { border-color: #64748B; color: #64748B; }
        .btn-modal-save {
          font-family: 'A2Z', sans-serif;
          font-weight: 700;
          font-size: 14px;
          border: none;
          border-radius: 10px;
          padding: 11px 24px;
          cursor: pointer;
          background: #2CADD9;
          color: #fff;
          transition: opacity 0.15s;
        }
        .btn-modal-save:hover:not(:disabled) { opacity: 0.85; }
        .btn-modal-save:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-modal-delete {
          font-family: 'A2Z', sans-serif;
          font-weight: 700;
          font-size: 14px;
          border: 1.5px solid #FCA5A5;
          border-radius: 10px;
          padding: 11px 16px;
          cursor: pointer;
          background: #fff;
          color: #EF4444;
          transition: all 0.15s;
          margin-right: auto;
        }
        .btn-modal-delete:hover { background: #FEF2F2; }

        .hint-type-row {
          display: flex;
          gap: 8px;
        }
        .hint-type-btn {
          flex: 1;
          font-family: 'A2Z', sans-serif;
          font-weight: 700;
          font-size: 13px;
          border: 1.5px solid #DCE6EC;
          border-radius: 8px;
          padding: 9px;
          cursor: pointer;
          background: #F8FAFC;
          color: #8A97A6;
          transition: all 0.15s;
        }
        .hint-type-btn.active { border-color: #FFC94A; background: #FEF9C3; color: #CA8A04; }

        /* 이미지 업로드 */
        .img-upload-zone {
          border: 2px dashed #DCE6EC;
          border-radius: 10px;
          padding: 20px 16px;
          text-align: center;
          cursor: pointer;
          background: #F8FAFC;
          transition: border-color 0.15s, background 0.15s;
          min-height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .img-upload-zone:hover { border-color: #2CADD9; background: #EBF7FC; }
        .img-upload-status {
          font-size: 14px;
          color: #8A97A6;
          line-height: 1.8;
        }
      `}</style>

      <div className="page">
        <div className="page-header">
          <div className="page-title">출제자 화면</div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {isSaving && <div className="saving">저장 중…</div>}
            {serverState.phase !== 'idle' && (
              <button className="btn-reset" onClick={handleReset}>⏹ 대기 화면으로</button>
            )}
          </div>
        </div>

        {/* 상태 + 타이머 */}
        <div className="panel">
          <div className="status-row">
            <span className={`phase-badge phase-${serverState.phase}`}>{phaseLabel}</span>
            <div className={`timer-big${isUrgent ? ' urgent' : ''}`}>{timerDisplay}</div>
            <div className="timer-track">
              <div
                className={`timer-fill${isUrgent ? ' urgent' : ''}`}
                style={{ transform: `scaleX(${isActive ? timerPct : 1})` }}
              />
            </div>
          </div>
          {serverState.phase === 'question' && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#8A97A6' }}>
              힌트: 언제든지 공개 가능 (테스트 모드)
            </div>
          )}
        </div>

        {/* 오답 경고 (진행 중 문제에 invalid_answers 있을 때) */}
        {currentQuestion?.invalid_answers?.length > 0 && serverState.phase !== 'idle' && (
          <div className="panel" style={{ padding: '14px 20px' }}>
            <div className="invalid-box" style={{ margin: 0 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div className="invalid-box-body">
                <div style={{ fontSize: 12, color: '#B45309', marginBottom: 4 }}>오답 처리 주의</div>
                다음은 정답으로 인정하지 않습니다:{' '}
                {currentQuestion.invalid_answers.map((a) => (
                  <span key={a} className="invalid-tag">{a}</span>
                ))}
                {currentQuestion.note && (
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 500, color: '#92400E' }}>
                    {currentQuestion.note}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 제어 버튼 */}
        <div className="panel">
          <div className="panel-title">진행 제어</div>
          <div className="btn-row">
            <button
              className="btn btn-start"
              onClick={handleStartQuestion}
              disabled={isActive || serverState.phase === 'answer' || !currentSlotQId}
            >
              ▶ 문제 시작
            </button>
            <button
              className="btn btn-hint"
              onClick={handleOpenHint}
              disabled={serverState.phase !== 'question'}
            >
              💡 힌트 열기
            </button>
            <button
              className="btn btn-answer"
              onClick={handleRevealAnswer}
              disabled={serverState.phase !== 'question' && serverState.phase !== 'hint'}
            >
              ✅ 정답 공개
            </button>
            {serverState.phase === 'answer' && serverState.questionIndex === 0 && (
              <button className="btn btn-next" onClick={handleNextQuestion}>
                ▷ 다음 문제
              </button>
            )}
            {serverState.phase === 'answer' && serverState.questionIndex === 1 && (
              <button className="btn btn-finish" onClick={handleFinish}>
                ⏹ 끝내기
              </button>
            )}
          </div>
        </div>

        {/* 문제 편집 모달 */}
        {editModal && (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
            <div className="modal">
              <div className="modal-title">
                {editModal.mode === 'add' ? '➕ 문제 추가' : `✏️ 문제 #${editModal.draft.id} 편집`}
              </div>

              <div className="form-row">
                <div className="form-group" style={{ maxWidth: 80 }}>
                  <div className="form-label">번호</div>
                  <input
                    className="form-input"
                    type="number"
                    value={editModal.draft.id ?? ''}
                    onChange={(e) => updateDraft('id', Number(e.target.value))}
                    disabled={editModal.mode === 'edit'}
                  />
                </div>
                <div className="form-group">
                  <div className="form-label">분류</div>
                  <select
                    className="form-select"
                    value={editModal.draft.category}
                    onChange={(e) => updateDraft('category', e.target.value)}
                  >
                    <option value="한국사">한국사</option>
                    <option value="세계사">세계사</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <div className="form-label">문제</div>
                <textarea
                  className="form-textarea"
                  value={editModal.draft.question}
                  onChange={(e) => updateDraft('question', e.target.value)}
                  placeholder="문제 텍스트를 입력하세요"
                />
              </div>

              <div className="form-group">
                <div className="form-label">정답</div>
                <input
                  className="form-input"
                  type="text"
                  value={editModal.draft.answer}
                  onChange={(e) => updateDraft('answer', e.target.value)}
                  placeholder="정답"
                />
              </div>

              <div className="form-group">
                <div className="form-label">힌트 유형</div>
                <div className="hint-type-row">
                  <button
                    className={`hint-type-btn${editModal.draft.hint_type === 'text' ? ' active' : ''}`}
                    onClick={() => updateDraft('hint_type', 'text')}
                  >
                    📝 텍스트
                  </button>
                  <button
                    className={`hint-type-btn${editModal.draft.hint_type === 'image' ? ' active' : ''}`}
                    onClick={() => updateDraft('hint_type', 'image')}
                  >
                    🖼 이미지
                  </button>
                </div>
              </div>

              <div className="form-group">
                <div className="form-label">힌트 텍스트</div>
                <input
                  className="form-input"
                  type="text"
                  value={editModal.draft.hint}
                  onChange={(e) => updateDraft('hint', e.target.value)}
                  placeholder={editModal.draft.hint_type === 'image' ? '이미지 설명 (예: 사진을 확인해보세요!)' : '힌트 텍스트 (예: ○조법)'}
                />
              </div>

              {editModal.draft.hint_type === 'image' && (
                <div className="form-group">
                  <div className="form-label">힌트 이미지</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleImageFile(e.target.files?.[0])}
                  />
                  <div
                    className="img-upload-zone"
                    onClick={() => !isUploading && fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleImageFile(e.dataTransfer.files?.[0]);
                    }}
                  >
                    {isUploading ? (
                      <div className="img-upload-status">⏳ 업로드 중…</div>
                    ) : editModal.draft.image ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        <img
                          src={editModal.draft.image}
                          alt="힌트 이미지 미리보기"
                          style={{ maxHeight: 140, maxWidth: '100%', borderRadius: 8, objectFit: 'contain' }}
                        />
                        <span style={{ fontSize: 11, color: '#8A97A6' }}>클릭하면 다른 이미지로 교체</span>
                      </div>
                    ) : (
                      <div className="img-upload-status">
                        📁 클릭하거나 사진을 여기에 끌어놓으세요<br />
                        <span style={{ fontSize: 11, color: '#8A97A6' }}>PC 파일 · 핸드폰 사진첩 · 드래그&드롭</span>
                      </div>
                    )}
                  </div>
                  {editModal.draft.image && !isUploading && (
                    <button
                      style={{ marginTop: 4, fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                      onClick={() => updateDraft('image', null)}
                    >
                      ✕ 이미지 제거
                    </button>
                  )}
                </div>
              )}

              <div className="form-group">
                <div className="form-label">오답 처리 목록 (쉼표로 구분)</div>
                <input
                  className="form-input"
                  type="text"
                  value={editModal.invalidAnswersText}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, invalidAnswersText: e.target.value }))}
                  placeholder="예: 태조, 세조"
                />
              </div>

              <div className="form-group">
                <div className="form-label">관리자 메모 (선택)</div>
                <input
                  className="form-input"
                  type="text"
                  value={editModal.draft.note || ''}
                  onChange={(e) => updateDraft('note', e.target.value)}
                  placeholder="예: '태조'는 시호이므로 오답 처리"
                />
              </div>

              <div className="modal-footer">
                {editModal.mode === 'edit' && (
                  <button
                    className="btn-modal-delete"
                    onClick={() => { deleteQuestion(editModal.draft.id); closeModal(); }}
                  >
                    🗑 삭제
                  </button>
                )}
                <button className="btn-modal-cancel" onClick={closeModal}>취소</button>
                <button
                  className="btn-modal-save"
                  onClick={saveQuestion}
                  disabled={isSavingQ}
                >
                  {isSavingQ ? '저장 중…' : '저장'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 문제 목록 */}
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="panel-title" style={{ marginBottom: 0 }}>문제 선택</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {solvedIds.length > 0 && (
                <button className="btn-edit" style={{ fontSize: 12, padding: '4px 12px', borderColor: '#FCA5A5', color: '#EF4444' }} onClick={handleClearSolved}>
                  ↺ 현황 초기화
                </button>
              )}
              <button className="btn-edit" style={{ fontSize: 12, padding: '4px 12px' }} onClick={openAddModal}>
                ➕ 문제 추가
              </button>
            </div>
          </div>

          {/* 현재 선택된 슬롯 요약 */}
          <div className="slots-summary">
            {[0, 1].map((si) => {
              const qId = si === 0 ? selectedQ0 : selectedQ1;
              const q = questions.find((x) => x.id === qId);
              const isCurrent = serverState.questionIndex === si && serverState.phase !== 'idle';
              return (
                <div key={si} className={`slot-summary-item${isCurrent ? ' active-slot' : ''}`}>
                  <span className={`slot-tag slot-tag-${si}`}>{si + 1}번째</span>
                  <span className="slot-arrow">→</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {q ? `#${q.id} ${q.answer}` : '미선택'}
                  </span>
                  {q && solvedIds.includes(q.id) && <span className="solved-check">✓</span>}
                </div>
              );
            })}
          </div>

          {/* 문제 리스트 */}
          <div className="q-list">
            {questions.map((q) => {
              const isSolved = solvedIds.includes(q.id);
              const isSlot0 = selectedQ0 === q.id;
              const isSlot1 = selectedQ1 === q.id;
              const isRunningNow = serverState.questionId === q.id && serverState.phase !== 'idle';
              const canSlot0 = canSelectSlot(0);
              const canSlot1 = canSelectSlot(1);

              return (
                <div key={q.id} className={`q-item${isRunningNow ? ' q-disabled' : ''}`}>
                  {isSolved ? (
                    <span className="solved-check">✓</span>
                  ) : (
                    <span className="q-num">{q.id}</span>
                  )}
                  <span className={`q-cat cat-${q.category}`}>{q.category}</span>
                  <span className="q-text">{q.question}</span>
                  <span className="q-answer">{q.answer}</span>
                  <div className="slot-btn-group">
                    <button
                      className={`slot-btn${isSlot0 ? ' active-0' : ''}`}
                      onClick={() => !isRunningNow && selectQuestion(0, q.id)}
                      disabled={!canSlot0 || isRunningNow}
                      title="1번째 문제로 설정"
                    >
                      1
                    </button>
                    <button
                      className={`slot-btn${isSlot1 ? ' active-1' : ''}`}
                      onClick={() => !isRunningNow && selectQuestion(1, q.id)}
                      disabled={!canSlot1 || isRunningNow}
                      title="2번째 문제로 설정"
                    >
                      2
                    </button>
                    <button
                      className="btn-edit"
                      onClick={(e) => { e.stopPropagation(); openEditModal(q); }}
                      title="문제 편집"
                    >
                      ✏️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="btn-add-q" onClick={openAddModal}>➕ 새 문제 추가</button>
        </div>
      </div>
    </>
  );
}
