import bcrypt from 'bcryptjs';
import express from 'express';
import { authenticate, publicUser, requireOrganizer, signUser } from './auth.js';
import { createId, getData, mutate, now } from './db.js';
import { createSession, publicQuestion } from './sessionLogic.js';

export function createApiRouter(io) {
  const router = express.Router();

  router.post('/auth/register', async (req, res) => {
    const { name, email, password, role } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(name || '').trim();
    const cleanRole = role === 'organizer' ? 'organizer' : 'participant';

    if (!cleanName || !normalizedEmail || !password || String(password).length < 6) {
      return res.status(400).json({ message: 'Введите имя, email и пароль от 6 символов' });
    }

    const existing = getData().users.find((user) => user.email === normalizedEmail);
    if (existing) {
      return res.status(409).json({ message: 'Пользователь с таким email уже есть' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await mutate((data) => {
      const created = {
        id: createId(),
        name: cleanName,
        email: normalizedEmail,
        passwordHash,
        role: cleanRole,
        createdAt: now()
      };
      data.users.push(created);
      return created;
    });

    res.status(201).json({ user: publicUser(user), token: signUser(user) });
  });

  router.post('/auth/login', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = getData().users.find((item) => item.email === email);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Неверный email или пароль' });
    }

    res.json({ user: publicUser(user), token: signUser(user) });
  });

  router.get('/me', authenticate, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  router.get('/quizzes', authenticate, (req, res) => {
    const data = getData();

    if (req.user.role === 'organizer') {
      const quizzes = data.quizzes
        .filter((quiz) => quiz.organizerId === req.user.id)
        .map((quiz) => summarizeQuiz(quiz, data.sessions));
      return res.json({ quizzes });
    }

    const quizIds = new Set(
      data.sessions
        .filter((session) =>
          session.participants.some((participant) => participant.userId === req.user.id)
        )
        .map((session) => session.quizId)
    );
    const quizzes = data.quizzes
      .filter((quiz) => quizIds.has(quiz.id))
      .map((quiz) => summarizeQuiz(quiz, data.sessions));
    res.json({ quizzes });
  });

  router.get('/quizzes/:id', authenticate, (req, res) => {
    const quiz = getData().quizzes.find((item) => item.id === req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: 'Квиз не найден' });
    }

    if (req.user.role === 'organizer' && quiz.organizerId !== req.user.id) {
      return res.status(403).json({ message: 'Это не ваш квиз' });
    }

    res.json({ quiz: serializeQuiz(quiz, req.user.role) });
  });

  router.post('/quizzes', authenticate, requireOrganizer, async (req, res) => {
    const quiz = normalizeQuizPayload(req.body, req.user.id);
    const created = await mutate((data) => {
      data.quizzes.push(quiz);
      return quiz;
    });

    res.status(201).json({ quiz: serializeQuiz(created, 'organizer') });
  });

  router.put('/quizzes/:id', authenticate, requireOrganizer, async (req, res) => {
    const updated = await mutate((data) => {
      const index = data.quizzes.findIndex((quiz) => quiz.id === req.params.id);
      if (index === -1) return null;
      if (data.quizzes[index].organizerId !== req.user.id) return false;

      data.quizzes[index] = {
        ...normalizeQuizPayload(req.body, req.user.id, data.quizzes[index].id),
        createdAt: data.quizzes[index].createdAt,
        updatedAt: now()
      };
      return data.quizzes[index];
    });

    if (updated === null) return res.status(404).json({ message: 'Квиз не найден' });
    if (updated === false) return res.status(403).json({ message: 'Это не ваш квиз' });

    res.json({ quiz: serializeQuiz(updated, 'organizer') });
  });

  router.post('/quizzes/:id/sessions', authenticate, requireOrganizer, async (req, res) => {
    const created = await mutate((data) => {
      const quiz = data.quizzes.find((item) => item.id === req.params.id);
      if (!quiz) return null;
      if (quiz.organizerId !== req.user.id) return false;
      if (quiz.questions.length === 0) return 'empty';

      const session = createSession(
        quiz,
        req.user.id,
        data.sessions.map((item) => item.code)
      );
      data.sessions.push(session);
      return session;
    });

    if (created === null) return res.status(404).json({ message: 'Квиз не найден' });
    if (created === false) return res.status(403).json({ message: 'Это не ваш квиз' });
    if (created === 'empty') return res.status(400).json({ message: 'Добавьте хотя бы один вопрос' });

    io.to(`session:${created.id}`).emit('session:updated');
    res.status(201).json({ session: created });
  });

  router.get('/sessions/by-code/:code', authenticate, (req, res) => {
    const data = getData();
    const session = data.sessions.find(
      (item) => item.code.toUpperCase() === req.params.code.toUpperCase()
    );

    if (!session) {
      return res.status(404).json({ message: 'Комната не найдена' });
    }

    const quiz = data.quizzes.find((item) => item.id === session.quizId);
    res.json({
      session: {
        id: session.id,
        code: session.code,
        status: session.status,
        quizTitle: quiz?.title || 'Квиз',
        participantCount: session.participants.length
      }
    });
  });

  router.get('/history', authenticate, (req, res) => {
    const data = getData();

    if (req.user.role === 'organizer') {
      const sessions = data.sessions
        .filter((session) => session.organizerId === req.user.id)
        .map((session) => {
          const quiz = data.quizzes.find((item) => item.id === session.quizId);
          return {
            ...sessionSummary(session, quiz),
            leaderboard: quiz ? buildHistoryLeaderboard(session, quiz) : []
          };
        });
      return res.json({ history: sessions });
    }

    const history = data.sessions
      .filter((session) =>
        session.participants.some((participant) => participant.userId === req.user.id)
      )
      .map((session) => {
        const quiz = data.quizzes.find((item) => item.id === session.quizId);
        const participant = session.participants.find((item) => item.userId === req.user.id);
        const answers = session.answers.filter((answer) => answer.participantId === participant?.id);
        return {
          ...sessionSummary(session, quiz),
          myScore: answers.reduce((sum, answer) => sum + answer.points, 0),
          correct: answers.filter((answer) => answer.isCorrect).length
        };
      });

    res.json({ history });
  });

  return router;
}

function normalizeQuizPayload(payload, organizerId, id = createId()) {
  const questions = Array.isArray(payload.questions) ? payload.questions : [];

  return {
    id,
    organizerId,
    title: String(payload.title || 'Новый квиз').trim(),
    description: String(payload.description || '').trim(),
    category: String(payload.category || 'Общее').trim(),
    timeLimitSec: clamp(Number(payload.timeLimitSec) || 30, 10, 300),
    rules: String(payload.rules || 'За правильный ответ начисляются баллы. Побеждает участник с наибольшим счетом.').trim(),
    createdAt: now(),
    updatedAt: now(),
    questions: questions.map((question, questionIndex) => normalizeQuestion(question, questionIndex))
  };
}

function normalizeQuestion(question, index) {
  const answerMode = question.answerMode === 'multiple' ? 'multiple' : 'single';
  const options = Array.isArray(question.options) ? question.options : [];
  const normalizedOptions = options.slice(0, 8).map((option) => ({
    id: option.id || createId(),
    text: String(option.text || '').trim() || 'Вариант ответа',
    isCorrect: Boolean(option.isCorrect)
  }));

  if (!normalizedOptions.some((option) => option.isCorrect) && normalizedOptions[0]) {
    normalizedOptions[0].isCorrect = true;
  }

  return {
    id: question.id || createId(),
    type: question.type === 'image' ? 'image' : 'text',
    text: String(question.text || `Вопрос ${index + 1}`).trim(),
    imageUrl: String(question.imageUrl || '').trim(),
    answerMode,
    points: clamp(Number(question.points) || 100, 10, 1000),
    options: normalizedOptions.length >= 2
      ? normalizedOptions
      : [
          { id: createId(), text: 'Да', isCorrect: true },
          { id: createId(), text: 'Нет', isCorrect: false }
        ]
  };
}

function serializeQuiz(quiz, role) {
  return {
    ...quiz,
    questions: quiz.questions.map((question) => publicQuestion(question, role))
  };
}

function summarizeQuiz(quiz, sessions) {
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    category: quiz.category,
    timeLimitSec: quiz.timeLimitSec,
    rules: quiz.rules,
    questionsCount: quiz.questions.length,
    sessionsCount: sessions.filter((session) => session.quizId === quiz.id).length,
    updatedAt: quiz.updatedAt
  };
}

function sessionSummary(session, quiz) {
  return {
    id: session.id,
    code: session.code,
    status: session.status,
    quizTitle: quiz?.title || 'Квиз',
    participantCount: session.participants.length,
    startedAt: session.startedAt,
    endedAt: session.endedAt
  };
}

function buildHistoryLeaderboard(session, quiz) {
  return session.participants
    .map((participant) => {
      const answers = session.answers.filter((answer) => answer.participantId === participant.id);
      return {
        name: participant.name,
        score: answers.reduce((sum, answer) => sum + answer.points, 0),
        correct: answers.filter((answer) => answer.isCorrect).length,
        totalQuestions: quiz.questions.length
      };
    })
    .sort((left, right) => right.score - left.score);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
