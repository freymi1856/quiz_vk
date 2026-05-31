import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import {
  BarChart3,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Crown,
  DoorOpen,
  History,
  ListChecks,
  LogOut,
  Play,
  Plus,
  Save,
  Settings,
  Trophy,
  UserRound,
  X
} from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const emptyQuiz = {
  title: 'Новый квиз',
  description: '',
  category: 'Общее',
  timeLimitSec: 30,
  rules: 'За правильный ответ начисляются баллы. Побеждает участник с наибольшим счетом.',
  questions: [
    {
      type: 'text',
      text: 'Первый вопрос',
      imageUrl: '',
      answerMode: 'single',
      points: 100,
      options: [
        { text: 'Правильный ответ', isCorrect: true },
        { text: 'Другой вариант', isCorrect: false }
      ]
    }
  ]
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('quizluv_token'));
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [quizzes, setQuizzes] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeView, setActiveView] = useState('dashboard');
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [liveSession, setLiveSession] = useState(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const authedFetch = useMemo(() => makeApi(token), [token]);

  useEffect(() => {
    if (!token) return;

    authedFetch('/api/me')
      .then(({ user: loadedUser }) => setUser(loadedUser))
      .catch(() => logout());
  }, [token, authedFetch]);

  useEffect(() => {
    if (!user) return;
    refreshData();
  }, [user]);

  function persistAuth(nextToken, nextUser) {
    localStorage.setItem('quizluv_token', nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }

  function logout() {
    localStorage.removeItem('quizluv_token');
    setToken(null);
    setUser(null);
    setQuizzes([]);
    setHistory([]);
    setLiveSession(null);
    setEditingQuiz(null);
  }

  async function refreshData() {
    const [quizData, historyData] = await Promise.all([
      authedFetch('/api/quizzes'),
      authedFetch('/api/history')
    ]);
    setQuizzes(quizData.quizzes || []);
    setHistory(historyData.history || []);
  }

  async function saveQuiz(quiz) {
    setLoading(true);
    try {
      const path = quiz.id ? `/api/quizzes/${quiz.id}` : '/api/quizzes';
      const method = quiz.id ? 'PUT' : 'POST';
      await authedFetch(path, { method, body: JSON.stringify(quiz) });
      setNotice('Квиз сохранен');
      setEditingQuiz(null);
      await refreshData();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function openQuiz(quizId) {
    const data = await authedFetch(`/api/quizzes/${quizId}`);
    setEditingQuiz(data.quiz);
    setActiveView('editor');
  }

  async function launchQuiz(quizId) {
    setLoading(true);
    try {
      const data = await authedFetch(`/api/quizzes/${quizId}/sessions`, { method: 'POST' });
      setLiveSession({ sessionId: data.session.id, code: data.session.code });
      setActiveView('live');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function joinByCode(code) {
    setLiveSession({ code: code.trim().toUpperCase() });
    setActiveView('live');
  }

  if (!user) {
    return (
      <AuthScreen
        mode={authMode}
        setMode={setAuthMode}
        onAuth={persistAuth}
        setNotice={setNotice}
        notice={notice}
      />
    );
  }

  const isOrganizer = user.role === 'organizer';

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">Q</span>
          <div>
            <strong>Quizluv</strong>
            <small>live quizzes</small>
          </div>
        </div>

        <nav className="nav-list" aria-label="Основная навигация">
          <NavButton icon={BarChart3} label="Кабинет" active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} />
          {isOrganizer && (
            <NavButton
              icon={Plus}
              label="Создать"
              active={activeView === 'editor'}
              onClick={() => {
                setEditingQuiz(structuredClone(emptyQuiz));
                setActiveView('editor');
              }}
            />
          )}
          <NavButton icon={DoorOpen} label="Войти по коду" active={activeView === 'join'} onClick={() => setActiveView('join')} />
          <NavButton icon={History} label="История" active={activeView === 'history'} onClick={() => setActiveView('history')} />
        </nav>

        <div className="profile-box">
          <UserRound size={18} />
          <div>
            <strong>{user.name}</strong>
            <small>{isOrganizer ? 'Организатор' : 'Участник'}</small>
          </div>
          <button className="icon-button" onClick={logout} title="Выйти">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewTitle(activeView, isOrganizer)}</h1>
            <p>{isOrganizer ? 'Создавайте, запускайте и ведите квизы в реальном времени.' : 'Подключайтесь к активным комнатам и смотрите свои результаты.'}</p>
          </div>
          {notice && (
            <button className="notice" onClick={() => setNotice('')}>
              {notice}
              <X size={16} />
            </button>
          )}
        </header>

        {activeView === 'dashboard' && (
          <Dashboard
            user={user}
            quizzes={quizzes}
            history={history}
            onCreate={() => {
              setEditingQuiz(structuredClone(emptyQuiz));
              setActiveView('editor');
            }}
            onEdit={openQuiz}
            onLaunch={launchQuiz}
            onJoin={joinByCode}
            loading={loading}
          />
        )}

        {activeView === 'editor' && isOrganizer && (
          <QuizEditor
            quiz={editingQuiz || structuredClone(emptyQuiz)}
            onCancel={() => setActiveView('dashboard')}
            onSave={saveQuiz}
            loading={loading}
          />
        )}

        {activeView === 'join' && <JoinRoom onJoin={joinByCode} />}

        {activeView === 'history' && <HistoryView history={history} role={user.role} />}

        {activeView === 'live' && liveSession && (
          <LiveRoom
            token={token}
            user={user}
            liveSession={liveSession}
            onClose={async () => {
              setLiveSession(null);
              setActiveView('dashboard');
              await refreshData();
            }}
          />
        )}
      </section>
    </main>
  );
}

function AuthScreen({ mode, setMode, onAuth, setNotice, notice }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'organizer'
  });
  const [loading, setLoading] = useState(false);
  const isLogin = mode === 'login';

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const data = await makeApi(null)(isLogin ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      onAuth(data.token, data.user);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <div className="brand auth-brand">
          <span className="brand-mark">Q</span>
          <div>
            <strong>Quizluv</strong>
            <small>интерактивные опросы</small>
          </div>
        </div>
        <h1>{isLogin ? 'Вход в кабинет' : 'Создать аккаунт'}</h1>
        <p>Черно-серый сервис для live-квизов с комнатами, таймером, баллами и лидербордом.</p>

        <form className="form-stack" onSubmit={submit}>
          {!isLogin && (
            <>
              <label>
                Имя
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              </label>
              <div className="segmented">
                <button type="button" className={form.role === 'organizer' ? 'active' : ''} onClick={() => setForm({ ...form, role: 'organizer' })}>
                  Организатор
                </button>
                <button type="button" className={form.role === 'participant' ? 'active' : ''} onClick={() => setForm({ ...form, role: 'participant' })}>
                  Участник
                </button>
              </div>
            </>
          )}
          <label>
            Email
            <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </label>
          <label>
            Пароль
            <input type="password" minLength="6" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          </label>
          {notice && <div className="inline-error">{notice}</div>}
          <button className="primary-button" disabled={loading}>
            {isLogin ? 'Войти' : 'Зарегистрироваться'}
            <ChevronRight size={18} />
          </button>
        </form>

        <button className="text-button" onClick={() => setMode(isLogin ? 'register' : 'login')}>
          {isLogin ? 'Нужен новый аккаунт' : 'Уже есть аккаунт'}
        </button>
      </section>

      <section className="auth-preview">
        <div className="preview-board">
          <div className="preview-question">
            <Clock3 size={18} />
            <span>00:24</span>
          </div>
          <h2>Какой протокол отвечает за realtime?</h2>
          <div className="preview-options">
            <span>REST</span>
            <span className="correct">WebSocket</span>
            <span>SMTP</span>
            <span>FTP</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function Dashboard({ user, quizzes, history, onCreate, onEdit, onLaunch, onJoin, loading }) {
  const isOrganizer = user.role === 'organizer';

  return (
    <div className="content-grid">
      <section className="metric-row">
        <Metric icon={ListChecks} label={isOrganizer ? 'Мои квизы' : 'Пройдено квизов'} value={isOrganizer ? quizzes.length : history.length} />
        <Metric icon={Trophy} label="Сессии" value={history.length} />
        <Metric icon={Crown} label="Роль" value={isOrganizer ? 'Host' : 'Player'} />
      </section>

      {isOrganizer ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Квизы</h2>
            <button className="primary-button compact" onClick={onCreate}>
              <Plus size={18} />
              Новый
            </button>
          </div>
          <div className="quiz-list">
            {quizzes.length === 0 && <EmptyState text="Пока нет квизов. Создайте первый набор вопросов." />}
            {quizzes.map((quiz) => (
              <article className="quiz-card" key={quiz.id}>
                <div>
                  <strong>{quiz.title}</strong>
                  <p>{quiz.description || quiz.rules}</p>
                  <small>{quiz.category} · {quiz.questionsCount} вопросов · {quiz.timeLimitSec} сек.</small>
                </div>
                <div className="card-actions">
                  <button className="secondary-button" onClick={() => onEdit(quiz.id)}>
                    <Settings size={17} />
                    Править
                  </button>
                  <button className="primary-button" disabled={loading} onClick={() => onLaunch(quiz.id)}>
                    <Play size={17} />
                    Запустить
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <JoinRoom onJoin={onJoin} />
      )}
    </div>
  );
}

function QuizEditor({ quiz, onCancel, onSave, loading }) {
  const [draft, setDraft] = useState(quiz);

  function updateQuestion(index, patch) {
    const next = [...draft.questions];
    next[index] = { ...next[index], ...patch };
    setDraft({ ...draft, questions: next });
  }

  function updateOption(questionIndex, optionIndex, patch) {
    const question = draft.questions[questionIndex];
    const options = [...question.options];

    if ('isCorrect' in patch && question.answerMode === 'single' && patch.isCorrect) {
      options.forEach((option) => {
        option.isCorrect = false;
      });
    }

    options[optionIndex] = { ...options[optionIndex], ...patch };
    updateQuestion(questionIndex, { options });
  }

  function addQuestion() {
    setDraft({
      ...draft,
      questions: [
        ...draft.questions,
        {
          type: 'text',
          text: `Вопрос ${draft.questions.length + 1}`,
          imageUrl: '',
          answerMode: 'single',
          points: 100,
          options: [
            { text: 'Вариант 1', isCorrect: true },
            { text: 'Вариант 2', isCorrect: false }
          ]
        }
      ]
    });
  }

  function removeQuestion(index) {
    setDraft({ ...draft, questions: draft.questions.filter((_, itemIndex) => itemIndex !== index) });
  }

  return (
    <div className="editor-layout">
      <section className="panel settings-panel">
        <div className="panel-head">
          <h2>Настройки</h2>
          <Save size={19} />
        </div>
        <div className="form-stack">
          <label>
            Название
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <label>
            Описание
            <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </label>
          <label>
            Категория
            <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
          </label>
          <label>
            Время на вопрос, сек.
            <input type="number" min="10" max="300" value={draft.timeLimitSec} onChange={(event) => setDraft({ ...draft, timeLimitSec: Number(event.target.value) })} />
          </label>
          <label>
            Правила
            <textarea value={draft.rules} onChange={(event) => setDraft({ ...draft, rules: event.target.value })} />
          </label>
          <div className="button-row">
            <button className="secondary-button" onClick={onCancel}>Отмена</button>
            <button className="primary-button" onClick={() => onSave(draft)} disabled={loading}>
              <Save size={17} />
              Сохранить
            </button>
          </div>
        </div>
      </section>

      <section className="question-column">
        <div className="panel-head outside-head">
          <h2>Вопросы</h2>
          <button className="secondary-button" onClick={addQuestion}>
            <Plus size={18} />
            Добавить
          </button>
        </div>

        {draft.questions.map((question, questionIndex) => (
          <article className="question-card" key={question.id || questionIndex}>
            <div className="question-top">
              <strong>Вопрос {questionIndex + 1}</strong>
              <button className="icon-button" onClick={() => removeQuestion(questionIndex)} title="Удалить вопрос">
                <X size={17} />
              </button>
            </div>

            <div className="form-grid">
              <label className="wide">
                Текст вопроса
                <input value={question.text} onChange={(event) => updateQuestion(questionIndex, { text: event.target.value })} />
              </label>
              <label>
                Баллы
                <input type="number" min="10" max="1000" value={question.points} onChange={(event) => updateQuestion(questionIndex, { points: Number(event.target.value) })} />
              </label>
              <label>
                Формат
                <select value={question.type} onChange={(event) => updateQuestion(questionIndex, { type: event.target.value })}>
                  <option value="text">Текст</option>
                  <option value="image">Изображение</option>
                </select>
              </label>
              {question.type === 'image' && (
                <label className="wide">
                  Ссылка на изображение
                  <input value={question.imageUrl} onChange={(event) => updateQuestion(questionIndex, { imageUrl: event.target.value })} placeholder="https://..." />
                </label>
              )}
            </div>

            <div className="segmented small">
              <button type="button" className={question.answerMode === 'single' ? 'active' : ''} onClick={() => updateQuestion(questionIndex, { answerMode: 'single' })}>
                Один ответ
              </button>
              <button type="button" className={question.answerMode === 'multiple' ? 'active' : ''} onClick={() => updateQuestion(questionIndex, { answerMode: 'multiple' })}>
                Несколько
              </button>
            </div>

            <div className="option-editor">
              {question.options.map((option, optionIndex) => (
                <label className="option-line" key={option.id || optionIndex}>
                  <input
                    type={question.answerMode === 'multiple' ? 'checkbox' : 'radio'}
                    name={`correct-${questionIndex}`}
                    checked={option.isCorrect}
                    onChange={(event) => updateOption(questionIndex, optionIndex, { isCorrect: event.target.checked })}
                  />
                  <input value={option.text} onChange={(event) => updateOption(questionIndex, optionIndex, { text: event.target.value })} />
                </label>
              ))}
              <button
                className="text-button"
                onClick={() =>
                  updateQuestion(questionIndex, {
                    options: [...question.options, { text: `Вариант ${question.options.length + 1}`, isCorrect: false }]
                  })
                }
              >
                Добавить вариант
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function JoinRoom({ onJoin }) {
  const [code, setCode] = useState('');
  const join = onJoin || (() => {});

  return (
    <section className="panel join-panel">
      <DoorOpen size={24} />
      <h2>Подключение к квизу</h2>
      <div className="join-row">
        <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="КОД КОМНАТЫ" maxLength="6" />
        <button className="primary-button" onClick={() => code && join(code)}>
          Войти
          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}

function LiveRoom({ token, user, liveSession, onClose }) {
  const [socket, setSocket] = useState(null);
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState([]);
  const [answerResult, setAnswerResult] = useState(null);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(null);
  const isOrganizer = user.role === 'organizer';

  useEffect(() => {
    const connection = io(API_URL, { auth: { token } });
    setSocket(connection);

    connection.emit('session:join', liveSession, (response) => {
      if (!response?.ok) {
        setError(response?.message || 'Не удалось подключиться');
        return;
      }
      setState(response.state);
    });

    connection.on('session:state', (nextState) => {
      setState(nextState);
      setSelected([]);
      setAnswerResult(null);
    });

    return () => connection.disconnect();
  }, [token, liveSession.sessionId, liveSession.code]);

  useEffect(() => {
    if (!state?.questionStartedAt || !state.currentQuestion || state.status !== 'question') {
      setRemaining(null);
      return;
    }

    const tick = () => {
      const elapsed = Math.floor((Date.now() - new Date(state.questionStartedAt).getTime()) / 1000);
      setRemaining(Math.max(0, state.quiz.timeLimitSec - elapsed));
    };

    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [state?.questionStartedAt, state?.status, state?.currentQuestion?.id]);

  function emitAction(eventName) {
    socket.emit(eventName, { sessionId: state.id }, (response) => {
      if (!response?.ok) setError(response?.message || 'Действие не выполнено');
    });
  }

  function toggleAnswer(optionId) {
    if (state.currentQuestion.answerMode === 'single') {
      setSelected([optionId]);
      return;
    }
    setSelected((current) =>
      current.includes(optionId)
        ? current.filter((item) => item !== optionId)
        : [...current, optionId]
    );
  }

  function submitAnswer() {
    socket.emit(
      'answer:submit',
      { sessionId: state.id, questionId: state.currentQuestion.id, optionIds: selected },
      (response) => {
        if (!response?.ok) {
          setError(response?.message || 'Ответ не принят');
          return;
        }
        setAnswerResult(response.answer);
      }
    );
  }

  if (error) {
    return (
      <section className="panel">
        <h2>{error}</h2>
        <button className="secondary-button" onClick={onClose}>Вернуться</button>
      </section>
    );
  }

  if (!state) {
    return <section className="panel"><h2>Подключение...</h2></section>;
  }

  return (
    <div className="live-layout">
      <section className="live-main">
        <div className="live-head">
          <div>
            <small>Комната</small>
            <button className="room-code" onClick={() => navigator.clipboard?.writeText(state.code)} title="Скопировать код">
              {state.code}
              <Copy size={16} />
            </button>
          </div>
          <div className="live-stat">
            <UserRound size={17} />
            {state.participantCount}
          </div>
          {remaining !== null && (
            <div className="live-stat timer">
              <Clock3 size={17} />
              {remaining}
            </div>
          )}
        </div>

        {state.status === 'lobby' && (
          <div className="stage-center">
            <h2>{state.quiz.title}</h2>
            <p>Участники подключаются по коду. Когда все готовы, организатор запускает первый вопрос.</p>
            {isOrganizer && (
              <button className="primary-button large" onClick={() => emitAction('session:start')}>
                <Play size={18} />
                Начать
              </button>
            )}
          </div>
        )}

        {state.status === 'question' && state.currentQuestion && (
          <div className="question-stage">
            <small>{state.currentQuestionIndex + 1} / {state.totalQuestions}</small>
            <h2>{state.currentQuestion.text}</h2>
            {state.currentQuestion.type === 'image' && state.currentQuestion.imageUrl && (
              <img className="question-image" src={state.currentQuestion.imageUrl} alt="" />
            )}
            <div className="answer-grid">
              {state.currentQuestion.options.map((option) => (
                <button
                  key={option.id}
                  className={selected.includes(option.id) ? 'answer-option selected' : 'answer-option'}
                  onClick={() => toggleAnswer(option.id)}
                  disabled={isOrganizer || Boolean(answerResult)}
                >
                  {option.text}
                  {isOrganizer && option.isCorrect && <Check size={18} />}
                </button>
              ))}
            </div>
            {!isOrganizer && (
              <div className="button-row">
                <button className="primary-button" disabled={!selected.length || Boolean(answerResult)} onClick={submitAnswer}>
                  Ответить
                  <ChevronRight size={18} />
                </button>
                {answerResult && (
                  <span className={answerResult.isCorrect ? 'answer-good' : 'answer-bad'}>
                    {answerResult.isCorrect ? `+${answerResult.points}` : '0 баллов'}
                  </span>
                )}
              </div>
            )}
            {isOrganizer && (
              <div className="button-row">
                <span className="muted">Ответили: {state.answeredCount} из {state.participantCount}</span>
                <button className="secondary-button" onClick={() => emitAction('session:end')}>Завершить</button>
                <button className="primary-button" onClick={() => emitAction('session:next')}>
                  Следующий
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        )}

        {state.status === 'ended' && (
          <div className="stage-center">
            <Trophy size={44} />
            <h2>Квиз завершен</h2>
            <p>Итоги сохранены в истории.</p>
            <button className="primary-button" onClick={onClose}>В кабинет</button>
          </div>
        )}
      </section>

      <Leaderboard items={state.leaderboard} />
    </div>
  );
}

function Leaderboard({ items }) {
  return (
    <aside className="leaderboard">
      <div className="panel-head">
        <h2>Лидерборд</h2>
        <Trophy size={19} />
      </div>
      <div className="leader-list">
        {items.length === 0 && <EmptyState text="Результаты появятся после ответов." />}
        {items.map((item, index) => (
          <div className="leader-row" key={item.participantId}>
            <span>{index + 1}</span>
            <strong>{item.name}</strong>
            <b>{item.score}</b>
          </div>
        ))}
      </div>
    </aside>
  );
}

function HistoryView({ history, role }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>История</h2>
        <History size={19} />
      </div>
      <div className="quiz-list">
        {history.length === 0 && <EmptyState text="Здесь появятся завершенные и активные сессии." />}
        {history.map((item) => (
          <article className="quiz-card" key={item.id}>
            <div>
              <strong>{item.quizTitle}</strong>
              <p>Код {item.code} · участников {item.participantCount} · статус {statusLabel(item.status)}</p>
              {role === 'participant' && <small>Ваш счет: {item.myScore || 0}, верных: {item.correct || 0}</small>}
              {role === 'organizer' && <small>Лидеров в таблице: {item.leaderboard?.length || 0}</small>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="metric-card">
      <Icon size={20} />
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function NavButton({ icon: Icon, label, active, onClick }) {
  return (
    <button className={active ? 'nav-button active' : 'nav-button'} onClick={onClick}>
      <Icon size={18} />
      {label}
    </button>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

function makeApi(token) {
  return async function api(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'Ошибка запроса');
    }
    return data;
  };
}

function viewTitle(view, isOrganizer) {
  if (view === 'editor') return 'Конструктор квиза';
  if (view === 'join') return 'Вход в комнату';
  if (view === 'history') return 'История';
  if (view === 'live') return 'Live-сессия';
  return isOrganizer ? 'Кабинет организатора' : 'Кабинет участника';
}

function statusLabel(status) {
  if (status === 'lobby') return 'ожидание';
  if (status === 'question') return 'идет';
  return 'завершен';
}

createRoot(document.getElementById('root')).render(<App />);
