import cors from 'cors';
import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import { initDb } from './db.js';
import { createApiRouter } from './routes.js';
import { registerSocketHandlers } from './socket.js';

const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

await initDb();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true
  }
});

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, app: 'Quizluv' });
});

app.use('/api', createApiRouter(io));

registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`Quizluv API listening on http://localhost:${PORT}`);
});
