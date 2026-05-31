import jwt from 'jsonwebtoken';
import { getData } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'quizluv-dev-secret';

export function signUser(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Нужна авторизация' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getData().users.find((item) => item.id === payload.id);

    if (!user) {
      return res.status(401).json({ message: 'Пользователь не найден' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Сессия истекла, войдите заново' });
  }
}

export function requireOrganizer(req, res, next) {
  if (req.user.role !== 'organizer') {
    return res.status(403).json({ message: 'Доступно только организатору' });
  }

  next();
}

export function userFromSocket(socket) {
  const token = socket.handshake.auth?.token;

  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return getData().users.find((item) => item.id === payload.id) || null;
  } catch {
    return null;
  }
}
