const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const users = new Map();
const connections = new Map();
const pairingCodes = new Map();
const wsClients = new Map();

const adjectives = ['gentle', 'warm', 'soft', 'kind', 'calm', 'quiet', 'tender', 'sweet', 'bright', 'light'];
const nouns = ['sun', 'moon', 'star', 'river', 'ocean', 'mountain', 'forest', 'meadow', 'garden', 'cloud'];

function generatePairingCode() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}-${noun}-${num}`;
}

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

app.post('/api/user', (req, res) => {
  const { userId, name } = req.body;
  if (userId && users.has(userId)) {
    const user = users.get(userId);
    if (name) user.name = name;
    return res.json({ user, connections: connections.get(userId) || [] });
  }
  const newUserId = uuidv4();
  const newUser = { id: newUserId, name: name || 'Friend', createdAt: Date.now() };
  users.set(newUserId, newUser);
  connections.set(newUserId, []);
  res.json({ user: newUser, connections: [] });
});

app.post('/api/pairing/generate', (req, res) => {
  const { userId } = req.body;
  if (!userId || !users.has(userId)) return res.status(400).json({ error: 'Invalid user' });
  for (const [code, data] of pairingCodes.entries()) {
    if (data.userId === userId) pairingCodes.delete(code);
  }
  const code = generatePairingCode();
  pairingCodes.set(code, { userId, expiresAt: Date.now() + 10 * 60 * 1000 });
  res.json({ code });
});

app.post('/api/pairing/join', (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !users.has(userId)) return res.status(400).json({ error: 'Invalid user' });
  const pairingData = pairingCodes.get(code);
  if (!pairingData) return res.status(404).json({ error: 'Code not found' });
  if (Date.now() > pairingData.expiresAt) { pairingCodes.delete(code); return res.status(410).json({ error: 'Code expired' }); }
  if (pairingData.userId === userId) return res.status(400).json({ error: 'Cannot connect with yourself' });

  const otherUserId = pairingData.userId;
  const otherUser = users.get(otherUserId);
  const currentUser = users.get(userId);
  const userConnections = connections.get(userId) || [];
  const otherConnections = connections.get(otherUserId) || [];

  if (userConnections.some(c => c.partnerId === otherUserId)) return res.status(400).json({ error: 'Already connected' });
  if (userConnections.length >= 5) return res.status(400).json({ error: 'Maximum connections reached' });

  const connectionId = uuidv4();
  const now = Date.now();
  const connectionForUser = { id: connectionId, partnerId: otherUserId, partnerName: otherUser.name, emoji: '💛', message: 'is thinking of you', createdAt: now };
  const connectionForOther = { id: connectionId, partnerId: userId, partnerName: currentUser.name, emoji: '💛', message: 'is thinking of you', createdAt: now };

  userConnections.push(connectionForUser);
  otherConnections.push(connectionForOther);
  connections.set(userId, userConnections);
  connections.set(otherUserId, otherConnections);
  pairingCodes.delete(code);

  const otherWs = wsClients.get(otherUserId);
  if (otherWs && otherWs.readyState === WebSocket.OPEN) {
    otherWs.send(JSON.stringify({ type: 'new_connection', connection: connectionForOther }));
  }
  res.json({ connection: connectionForUser });
});

app.put('/api/connection/:connectionId', (req, res) => {
  const { userId, emoji, message } = req.body;
  const { connectionId } = req.params;
  if (!userId || !users.has(userId)) return res.status(400).json({ error: 'Invalid user' });
  const userConnections = connections.get(userId) || [];
  const connection = userConnections.find(c => c.id === connectionId);
  if (!connection) return res.status(404).json({ error: 'Connection not found' });
  if (emoji) connection.emoji = emoji;
  if (message) connection.message = message;
  res.json({ connection });
});

app.post('/api/thinking', (req, res) => {
  const { userId, connectionId } = req.body;
  if (!userId || !users.has(userId)) return res.status(400).json({ error: 'Invalid user' });
  const userConnections = connections.get(userId) || [];
  const connection = userConnections.find(c => c.id === connectionId);
  if (!connection) return res.status(404).json({ error: 'Connection not found' });

  const sender = users.get(userId);
  const recipientId = connection.partnerId;
  const recipientConnections = connections.get(recipientId) || [];
  const recipientConnection = recipientConnections.find(c => c.id === connectionId);

  const recipientWs = wsClients.get(recipientId);
  if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
    recipientWs.send(JSON.stringify({
      type: 'thinking_of_you', from: sender.name, emoji: recipientConnection?.emoji || '💛',
      message: recipientConnection?.message || 'is thinking of you', connectionId, timestamp: Date.now()
    }));
  }
  res.json({ sent: true });
});

wss.on('connection', (ws) => {
  let currentUserId = null;
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'register') { currentUserId = data.userId; wsClients.set(currentUserId, ws); ws.send(JSON.stringify({ type: 'registered', userId: currentUserId })); }
    } catch (e) { console.error('WebSocket error:', e); }
  });
  ws.on('close', () => { if (currentUserId) wsClients.delete(currentUserId); });
});

setInterval(() => { const now = Date.now(); for (const [code, data] of pairingCodes.entries()) { if (now > data.expiresAt) pairingCodes.delete(code); } }, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
