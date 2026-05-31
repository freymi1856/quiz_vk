import { randomUUID } from 'node:crypto';
import { userFromSocket } from './auth.js';
import { getData, mutate, now } from './db.js';
import { buildSessionState, scoreAnswer } from './sessionLogic.js';

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.user = userFromSocket(socket);

    socket.on('session:join', async ({ code, sessionId, displayName }, callback) => {
      const result = await mutate((data) => {
        const session = sessionId
          ? data.sessions.find((item) => item.id === sessionId)
          : data.sessions.find((item) => item.code.toUpperCase() === String(code || '').toUpperCase());
        if (!session) return { error: 'Комната не найдена' };

        const quiz = data.quizzes.find((item) => item.id === session.quizId);
        if (!quiz) return { error: 'Квиз не найден' };

        const isOrganizer = socket.user?.id === session.organizerId;
        const role = isOrganizer ? 'organizer' : 'participant';

        if (!isOrganizer) {
          if (session.status === 'ended') return { error: 'Квиз уже завершен' };

          const existing = session.participants.find(
            (participant) => participant.userId && participant.userId === socket.user?.id
          );

          if (!existing) {
            session.participants.push({
              id: randomUUID(),
              userId: socket.user?.id || null,
              name: socket.user?.name || String(displayName || 'Участник').trim(),
              joinedAt: now()
            });
          }
        }

        return { session, quiz, role };
      });

      if (result.error) {
        callback?.({ ok: false, message: result.error });
        return;
      }

      socket.join(`session:${result.session.id}`);
      socket.data.sessionId = result.session.id;
      socket.data.role = result.role;

      await emitSession(io, result.session.id);
      callback?.({
        ok: true,
        state: buildSessionState(result.session, result.quiz, result.role)
      });
    });

    socket.on('session:start', async ({ sessionId }, callback) => {
      const result = await organizerAction(socket, sessionId, (session) => {
        session.status = 'question';
        session.startedAt = session.startedAt || now();
        session.currentQuestionIndex = 0;
        session.questionStartedAt = now();
      });

      await respondAndEmit(io, callback, result);
    });

    socket.on('session:next', async ({ sessionId }, callback) => {
      const result = await organizerAction(socket, sessionId, (session, quiz) => {
        if (session.currentQuestionIndex + 1 >= quiz.questions.length) {
          session.status = 'ended';
          session.endedAt = now();
          return;
        }

        session.status = 'question';
        session.currentQuestionIndex += 1;
        session.questionStartedAt = now();
      });

      await respondAndEmit(io, callback, result);
    });

    socket.on('session:end', async ({ sessionId }, callback) => {
      const result = await organizerAction(socket, sessionId, (session) => {
        session.status = 'ended';
        session.endedAt = now();
      });

      await respondAndEmit(io, callback, result);
    });

    socket.on('answer:submit', async ({ sessionId, questionId, optionIds }, callback) => {
      if (!socket.user) {
        callback?.({ ok: false, message: 'Нужна авторизация' });
        return;
      }

      const result = await mutate((data) => {
        const session = data.sessions.find((item) => item.id === sessionId);
        if (!session) return { error: 'Комната не найдена' };
        if (session.status !== 'question') return { error: 'Сейчас нельзя отвечать' };

        const quiz = data.quizzes.find((item) => item.id === session.quizId);
        const question = quiz?.questions[session.currentQuestionIndex];
        if (!quiz || !question || question.id !== questionId) return { error: 'Вопрос уже сменился' };

        const participant = session.participants.find((item) => item.userId === socket.user.id);
        if (!participant) return { error: 'Вы не подключены к комнате' };

        const alreadyAnswered = session.answers.some(
          (answer) => answer.participantId === participant.id && answer.questionId === questionId
        );
        if (alreadyAnswered) return { error: 'Ответ уже принят' };

        const elapsedMs = new Date(now()).getTime() - new Date(session.questionStartedAt).getTime();
        if (elapsedMs > quiz.timeLimitSec * 1000) return { error: 'Время вышло' };

        const { isCorrect, points } = scoreAnswer(question, Array.isArray(optionIds) ? optionIds : []);
        session.answers.push({
          id: randomUUID(),
          sessionId: session.id,
          participantId: participant.id,
          userId: socket.user.id,
          questionId,
          selectedOptionIds: Array.isArray(optionIds) ? optionIds : [],
          isCorrect,
          points,
          answeredAt: now()
        });

        return { session, quiz, answer: { isCorrect, points } };
      });

      if (result.error) {
        callback?.({ ok: false, message: result.error });
        return;
      }

      await emitSession(io, result.session.id);
      callback?.({ ok: true, answer: result.answer });
    });
  });
}

async function organizerAction(socket, sessionId, changeSession) {
  if (!socket.user) return { error: 'Нужна авторизация' };

  return mutate((data) => {
    const session = data.sessions.find((item) => item.id === sessionId);
    if (!session) return { error: 'Комната не найдена' };
    if (session.organizerId !== socket.user.id) return { error: 'Это не ваша комната' };

    const quiz = data.quizzes.find((item) => item.id === session.quizId);
    if (!quiz) return { error: 'Квиз не найден' };

    changeSession(session, quiz);
    return { session, quiz };
  });
}

async function respondAndEmit(io, callback, result) {
  if (result.error) {
    callback?.({ ok: false, message: result.error });
    return;
  }

  await emitSession(io, result.session.id);
  callback?.({ ok: true });
}

async function emitSession(io, sessionId) {
  const data = getData();
  const session = data.sessions.find((item) => item.id === sessionId);
  const quiz = data.quizzes.find((item) => item.id === session?.quizId);
  if (!session || !quiz) return;

  const sockets = await io.in(`session:${sessionId}`).fetchSockets();
  sockets.forEach((roomSocket) => {
    const role = roomSocket.data.role || 'participant';
    roomSocket.emit('session:state', buildSessionState(session, quiz, role));
  });
}
