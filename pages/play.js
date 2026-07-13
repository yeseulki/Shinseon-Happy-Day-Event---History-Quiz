import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';

const POLL_INTERVAL = 1500;

export default function PlayPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const waitingScreen = (
    <div style={{ width:'100%', height:'100vh', background:'#FFFCF6', display:'flex', alignItems:'center', justifyContent:'center', padding:'28px' }}>
      <style>{`@keyframes spin-pre { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      <div style={{ width:'100%', maxWidth:'min(86vw,1180px)', height:'min(80vh,740px)', background:'#fff', border:'5px solid #2CADD9', borderRadius:'36px', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <svg style={{ width:80, height:80, animation:'spin-pre 6s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="#2CADD9" strokeWidth="1.6">
          <path d="M12 2 L14 9 L21 9 L15 13.5 L17.5 21 L12 16.5 L6.5 21 L9 13.5 L3 9 L10 9 Z" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );

  const [state, setState] = useState({
    phase: 'idle',
    teamId: 1,
    questionIndex: 0,
    questionId: null,
    timerStartedAt: null,
    timerTotal: 90,
  });
  const [questions, setQuestions] = useState([]);
  const [timerRemaining, setTimerRemaining] = useState(90);
  const [isUrgent, setIsUrgent] = useState(false);
  const [flashCard, setFlashCard] = useState(false);

  const prevPhaseRef = useRef('idle');
  const timerIntervalRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const cardRef = useRef(null);

  const loadQuestions = useCallback(() => {
    fetch('/api/questions')
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data) => {
        if (data.questions) setQuestions(data.questions);
      })
      .catch(() => {
        // API 실패 시 정적 파일로 폴백
        fetch('/questions.json')
          .then((r) => r.json())
          .then((data) => setQuestions(data.questions || []));
      });
  }, []);

  // Load questions on mount
  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  // questionId가 있는데 questions에 없으면 다시 로드 (questions가 로드된 후에도 재체크)
  useEffect(() => {
    if (!state.questionId) return;
    if (!questions.find((q) => q.id === state.questionId)) {
      loadQuestions();
    }
  }, [state.questionId, questions.length]);

  // Polling
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) return;
        const data = await res.json();
        setState((prev) => {
          if (
            JSON.stringify(prev) !== JSON.stringify(data)
          ) {
            return data;
          }
          return prev;
        });
      } catch {}
    };

    poll();
    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(pollIntervalRef.current);
  }, []);

  // React to phase changes
  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    const currentPhase = state.phase;

    // Flash card on answer reveal
    if (currentPhase === 'answer' && prevPhase !== 'answer') {
      setFlashCard(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFlashCard(true);
          setTimeout(() => setFlashCard(false), 800);
        });
      });
    }

    // Start or clear timer
    if (currentPhase === 'question' || currentPhase === 'hint') {
      startClientTimer(state.timerStartedAt, state.timerTotal);
    } else {
      clearInterval(timerIntervalRef.current);
      if (currentPhase === 'answer') {
        setTimerRemaining(0);
      } else {
        setTimerRemaining(state.timerTotal || 90);
        setIsUrgent(false);
      }
    }

    prevPhaseRef.current = currentPhase;
  }, [state]);

  function startClientTimer(timerStartedAt, timerTotal) {
    clearInterval(timerIntervalRef.current);

    const tick = () => {
      if (!timerStartedAt) {
        setTimerRemaining(timerTotal);
        return;
      }
      const elapsed = (Date.now() - new Date(timerStartedAt).getTime()) / 1000;
      const remaining = Math.max(0, Math.ceil(timerTotal - elapsed));
      setTimerRemaining(remaining);
      setIsUrgent(remaining <= 10);
      if (remaining <= 0) {
        clearInterval(timerIntervalRef.current);
      }
    };

    tick();
    timerIntervalRef.current = setInterval(tick, 500);
  }

  const currentQuestion = questions.find((q) => q.id === state.questionId) || null;
  const showTimer = state.phase === 'question' || state.phase === 'hint';
  const timerPct = state.timerTotal > 0 ? timerRemaining / state.timerTotal : 0;

  if (!mounted) return waitingScreen;

  // 이모티콘이 포함된 힌트 텍스트를 크게 렌더링
  function renderHintText(text) {
    const parts = text.split(/(\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic}|\uFE0F)*)/gu);
    return parts.map((part, i) =>
      /\p{Extended_Pictographic}/u.test(part)
        ? <span key={i} className="hint-emoji">{part}</span>
        : part
    );
  }

  return (
    <>
      <Head>
        <title>신선 행복DAY · 역사를 알자</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <style>{`
        html, body {
          background: var(--cream);
          overflow: hidden;
          height: 100%;
          width: 100%;
        }

        .stage {
          position: relative;
          width: 100%;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 28px;
        }

        /* Doodle decorations */
        .doodle {
          position: absolute;
          pointer-events: none;
          opacity: 0.9;
        }
        .doodle svg { width: 100%; height: 100%; display: block; }

        /* Card */
        .card {
          position: relative;
          width: 100%;
          max-width: min(86vw, 1180px);
          height: min(80vh, 740px);
          background: #fff;
          border: clamp(4px, 0.38vw, 6px) solid var(--sky);
          border-radius: clamp(26px, 2.6vw, 40px);
          box-shadow: 0 18px 0 -6px rgba(27,51,88,0.08), 0 24px 50px rgba(27,51,88,0.12);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .card::before {
          content: '';
          position: absolute;
          inset: clamp(9px, 1.1vw, 16px);
          border: clamp(2px, 0.22vw, 3px) dashed #BFE4EF;
          border-radius: clamp(18px, 2vw, 30px);
          pointer-events: none;
          z-index: 1;
        }
        .card.flash {
          animation: flash-bg 0.7s ease;
        }
        @keyframes flash-bg {
          0%   { background: #fff; border-color: var(--sky); }
          35%  { background: #EAFBF3; border-color: #4FD69C; }
          100% { background: #fff; border-color: var(--sky); }
        }

        /* Topbar */
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: clamp(20px, 3vh, 36px) clamp(26px, 4vw, 40px) 0 clamp(26px, 4vw, 40px);
          position: relative;
          z-index: 3;
        }
        .topbar-left {
          flex: 1;
          display: flex;
          align-items: center;
          min-width: 0;
        }
        .idle-label {
          font-family: 'A2Z', sans-serif;
          font-weight: 700;
          font-size: clamp(13px, 1.1vw, 17px);
          color: #8A97A6;
        }
        .brand {
          font-family: 'A2Z', sans-serif;
          font-weight: 700;
          font-size: clamp(11px, 0.85vw, 14px);
          color: var(--sky-deep);
          letter-spacing: 2px;
          opacity: 0.75;
          white-space: nowrap;
        }

        /* Timer */
        .timer-wrap {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .timer-track-bar {
          flex: 1;
          height: clamp(12px, 1.2vw, 18px);
          background: #EAF3F7;
          border-radius: 999px;
          overflow: hidden;
          position: relative;
        }
        .timer-prog-bar {
          height: 100%;
          background: var(--pink);
          border-radius: 999px;
          transform-origin: left center;
          transition: transform 0.5s linear, background 0.4s ease;
        }
        .timer-prog-bar.urgent {
          background: #FF5C7A;
        }
        .timer-num {
          font-family: 'A2Z', sans-serif;
          font-weight: 900;
          font-size: clamp(16px, 1.6vw, 24px);
          color: var(--navy);
          min-width: 2ch;
          text-align: right;
        }

        /* Body area */
        .body-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: clamp(14px, 2vh, 26px);
          padding: clamp(8px, 1.3vh, 16px) clamp(10px, 1.6vw, 20px) clamp(20px, 3vh, 36px);
          position: relative;
          z-index: 2;
          text-align: center;
        }

        .state {
          display: none;
          width: 100%;
          flex-direction: column;
          align-items: center;
          gap: 22px;
        }
        .state.active { display: flex; }

        /* Idle */
        .waiting-star {
          width: clamp(60px, 7vw, 100px);
          height: clamp(60px, 7vw, 100px);
          animation: spin-slow 6s linear infinite;
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .wait-label {
          font-family: 'A2Z', sans-serif;
          font-weight: 700;
          font-size: clamp(18px, 2vw, 26px);
          color: var(--sky-deep);
        }
        .wait-sub {
          font-family: 'A2Z', sans-serif;
          font-weight: 500;
          font-size: clamp(13px, 1.3vw, 18px);
          color: #8A97A6;
        }

        /* Category tag */
        .category-tag {
          font-family: 'A2Z', sans-serif;
          font-weight: 700;
          font-size: clamp(12px, 1.1vw, 16px);
          color: var(--pink);
          background: #FFF1F4;
          padding: clamp(5px, 0.6vw, 8px) clamp(14px, 1.6vw, 20px);
          border-radius: 999px;
          letter-spacing: 1px;
        }

        /* Question text */
        .question-text {
          font-family: 'A2Z', sans-serif;
          font-weight: 900;
          font-size: clamp(24px, 3vw, 44px);
          line-height: 1.4;
          color: var(--ink);
          max-width: min(96%, 900px);
          animation: pop-in 0.55s cubic-bezier(.2,1.4,.4,1) both;
        }
        @keyframes pop-in {
          0%   { opacity: 0; transform: scale(0.85) translateY(14px); }
          60%  { opacity: 1; transform: scale(1.03) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }

        /* Raise hand hint */
        .raise-hand-hint {
          font-family: 'A2Z', sans-serif;
          font-weight: 600;
          font-size: clamp(13px, 1.1vw, 18px);
          color: #8A97A6;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .raise-hand-hint .hand { font-size: 1.2em; }

        /* Hint card */
        .hint-card {
          width: 100%;
          max-width: min(80%, 820px);
          background: #FFF7E8;
          border: clamp(2px, 0.25vw, 4px) dashed var(--yellow);
          border-radius: 22px;
          padding: clamp(14px, 1.6vw, 22px) clamp(20px, 2.4vw, 34px);
          display: flex;
          align-items: center;
          gap: 14px;
          animation: slide-up 0.5s cubic-bezier(.2,1.2,.4,1) both;
        }
        @keyframes slide-up {
          0%   { opacity: 0; transform: translateY(24px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .hint-icon {
          font-family: 'A2Z', sans-serif;
          font-weight: 900;
          font-size: clamp(13px, 1.2vw, 18px);
          color: #fff;
          background: var(--yellow);
          width: clamp(30px, 2.6vw, 42px);
          height: clamp(30px, 2.6vw, 42px);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .hint-text {
          font-family: 'A2Z', sans-serif;
          font-weight: 600;
          font-size: clamp(14px, 1.3vw, 20px);
          color: #7A5B12;
          text-align: left;
        }
        .hint-emoji {
          font-size: 3em;
          line-height: 1;
          vertical-align: middle;
        }
        .hint-image-wrap {
          width: 100%;
          max-width: min(88%, 760px);
          background: #FFF7E8;
          border: clamp(2px, 0.25vw, 4px) dashed var(--yellow);
          border-radius: 22px;
          padding: clamp(14px, 1.8vw, 26px);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: slide-up 0.5s cubic-bezier(.2,1.2,.4,1) both;
        }
        .hint-image {
          max-height: min(38vh, 340px);
          max-width: 100%;
          object-fit: contain;
          border-radius: 10px;
          display: block;
        }
        .answer-hint-image-wrap {
          width: 100%;
          max-width: min(80%, 600px);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 4px;
        }
        .answer-hint-image {
          max-height: min(28vh, 220px);
          max-width: 100%;
          object-fit: contain;
          border-radius: 10px;
          opacity: 0.9;
          display: block;
        }
        .answer-hint-text {
          font-family: 'A2Z', sans-serif;
          font-weight: 600;
          font-size: clamp(13px, 1.1vw, 17px);
          color: #8A97A6;
          margin-top: 4px;
        }

        /* Answer */
        .answer-icon {
          width: clamp(46px, 5.2vw, 76px);
          height: clamp(46px, 5.2vw, 76px);
          animation: bounce-in 0.6s cubic-bezier(.2,1.5,.4,1) both;
        }
        @keyframes bounce-in {
          0%   { opacity: 0; transform: scale(0.3) rotate(-15deg); }
          60%  { opacity: 1; transform: scale(1.15) rotate(4deg); }
          100% { opacity: 1; transform: scale(1) rotate(0); }
        }
        .answer-label {
          font-family: 'A2Z', sans-serif;
          font-weight: 700;
          font-size: clamp(13px, 1.2vw, 17px);
          color: var(--sky-deep);
          letter-spacing: 1px;
        }
        .answer-text {
          font-family: 'A2Z', sans-serif;
          font-weight: 900;
          font-size: clamp(28px, 3.8vw, 58px);
          color: var(--navy);
          animation: pop-in 0.5s 0.1s cubic-bezier(.2,1.4,.4,1) both;
        }
      `}</style>

      <div className="stage">
        <div className={`card${flashCard ? ' flash' : ''}`} ref={cardRef}>

          {/* Topbar */}
          <div className="topbar">
            <div className="topbar-left">
              {showTimer && (
                <div className="timer-wrap">
                  <div className="timer-track-bar">
                    <div
                      className={`timer-prog-bar${isUrgent ? ' urgent' : ''}`}
                      style={{ transform: `scaleX(${timerPct})` }}
                    />
                  </div>
                  <div className="timer-num">{timerRemaining}</div>
                </div>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="body-area">

            {/* Idle */}
            <div className={`state${state.phase === 'idle' ? ' active' : ''}`} id="state-idle">
              <svg className="waiting-star" viewBox="0 0 24 24" fill="none" stroke="#2CADD9" strokeWidth="1.6">
                <path d="M12 2 L14 9 L21 9 L15 13.5 L17.5 21 L12 16.5 L6.5 21 L9 13.5 L3 9 L10 9 Z" strokeLinejoin="round" />
              </svg>
              <p className="wait-label">문제를 기다리고 있어요</p>
              <p className="wait-sub">출제자가 곧 문제를 시작합니다</p>
            </div>

            {/* Question */}
            <div className={`state${state.phase === 'question' ? ' active' : ''}`} id="state-question">
              {currentQuestion && (
                <>
                  <div className="category-tag">{currentQuestion.category}</div>
                  <div className="question-text" key={`q-${currentQuestion.id}`}>
                    {currentQuestion.question}
                  </div>
                  <div className="raise-hand-hint">
                    <span className="hand">✋</span>손을 들고 답을 외쳐보세요!
                  </div>
                </>
              )}
            </div>

            {/* Hint */}
            <div className={`state${state.phase === 'hint' ? ' active' : ''}`} id="state-hint">
              {currentQuestion && (
                <>
                  <div className="category-tag">{currentQuestion.category}</div>
                  <div className="question-text" key={`h-${currentQuestion.id}`}>
                    {currentQuestion.question}
                  </div>
                  {currentQuestion.hint_type === 'image' && currentQuestion.image ? (
                    <div className="hint-image-wrap">
                      <img
                        className="hint-image"
                        src={`/${currentQuestion.image}`}
                        alt="힌트 이미지"
                      />
                    </div>
                  ) : (
                    <div className="hint-card">
                      <div className="hint-icon">?</div>
                      <div className="hint-text">{renderHintText(currentQuestion.hint)}</div>
                    </div>
                  )}
                  <div className="raise-hand-hint">
                    <span className="hand">✋</span>손을 들고 답을 외쳐보세요!
                  </div>
                </>
              )}
            </div>

            {/* Answer */}
            <div className={`state${state.phase === 'answer' ? ' active' : ''}`} id="state-answer">
              {currentQuestion && (
                <>
                  <svg className="answer-icon" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" fill="#4FD69C" />
                    <path
                      d="M7 12.5 L10.5 16 L17 8.5"
                      stroke="#fff"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="answer-label">정답</div>
                  <div className="answer-text" key={`a-${currentQuestion.id}`}>
                    {currentQuestion.answer}
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
