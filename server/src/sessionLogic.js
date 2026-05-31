import { createId, now } from './db.js';

export function makeRoomCode(existingCodes = []) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const used = new Set(existingCodes);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!used.has(code)) return code;
  }

  return String(Date.now()).slice(-6);
}

export function createSession(quiz, organizerId, existingCodes) {
  return {
    id: createId(),
    quizId: quiz.id,
    organizerId,
    code: makeRoomCode(existingCodes),
    status: 'lobby',
    currentQuestionIndex: -1,
    questionStartedAt: null,
    createdAt: now(),
    startedAt: null,
    endedAt: null,
    participants: [],
    answers: []
  };
}

export function buildSessionState(session, quiz, viewerRole = 'participant') {
  const currentQuestion = quiz.questions[session.currentQuestionIndex] || null;
  const participantCount = session.participants.length;
  const answeredCount = currentQuestion
    ? session.answers.filter((answer) => answer.questionId === currentQuestion.id).length
    : 0;

  return {
    id: session.id,
    code: session.code,
    status: session.status,
    currentQuestionIndex: session.currentQuestionIndex,
    questionStartedAt: session.questionStartedAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    participantCount,
    answeredCount,
    totalQuestions: quiz.questions.length,
    quiz: {
      id: quiz.id,
      title: quiz.title,
      category: quiz.category,
      timeLimitSec: quiz.timeLimitSec,
      rules: quiz.rules
    },
    currentQuestion: currentQuestion ? publicQuestion(currentQuestion, viewerRole) : null,
    leaderboard: buildLeaderboard(session, quiz)
  };
}

export function publicQuestion(question, viewerRole = 'participant') {
  const base = {
    id: question.id,
    type: question.type,
    text: question.text,
    imageUrl: question.imageUrl,
    answerMode: question.answerMode,
    points: question.points,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text
    }))
  };

  if (viewerRole === 'organizer') {
    base.options = question.options.map((option) => ({
      id: option.id,
      text: option.text,
      isCorrect: option.isCorrect
    }));
  }

  return base;
}

export function buildLeaderboard(session, quiz) {
  return session.participants
    .map((participant) => {
      const answers = session.answers.filter((answer) => answer.participantId === participant.id);
      const score = answers.reduce((sum, answer) => sum + answer.points, 0);

      return {
        participantId: participant.id,
        userId: participant.userId,
        name: participant.name,
        score,
        correct: answers.filter((answer) => answer.isCorrect).length,
        totalAnswered: answers.length,
        totalQuestions: quiz.questions.length
      };
    })
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
}

export function scoreAnswer(question, selectedOptionIds) {
  const selected = [...new Set(selectedOptionIds)];
  const correct = question.options
    .filter((option) => option.isCorrect)
    .map((option) => option.id)
    .sort();
  const normalized = selected.sort();
  const isCorrect =
    correct.length === normalized.length &&
    correct.every((optionId, index) => optionId === normalized[index]);

  return {
    isCorrect,
    points: isCorrect ? question.points : 0
  };
}
