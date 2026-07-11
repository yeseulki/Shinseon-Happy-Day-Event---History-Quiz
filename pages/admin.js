import { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';

const POLL_INTERVAL = 1500;

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
  const [timerDisplay, setTimerDisplay] = useState(90);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // 선택 중인 문제 (시작 전에만 변경 가능)
  const [selectedQ0, setSelectedQ0] = useState(null);
  const [selectedQ1, setSelectedQ1] = useState(null);

  const timerIntervalRef = useRef(null);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    fetch('/questions.json')
      .then((r) => r.json())
      .then((data) => {
        const qs = data.questions || [];
        setQuestions(qs);
        setSelectedQ0(qs[0]?.id ?? null);
        setSelectedQ1(qs[1]?.id ?? null);
      });
  }, []);

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

        {/* 문제 목록 */}
        <div className="panel">
          <div className="panel-title">문제 선택</div>

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
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
