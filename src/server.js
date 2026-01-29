const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const webpush = require('web-push');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// VAPID keys for push notifications
const VAPID_PUBLIC_KEY = 'BOCXo29qxQYNBjx5DJHv31F5xWUsqnOz8Qr2-I7wyvsS-z58QSolp-cJnTImMtIhqa7h7cO6QQ5gfMYrFGgOmlM';
const VAPID_PRIVATE_KEY = 'h67MFj1ZMV0W-DoKVWEdqbdwNFHAoaddGA9HLe2eSpI';

webpush.setVapidDetails(
  'mailto:thinkingofyou@example.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// In-memory storage
const users = new Map();
const connections = new Map();
const pairingCodes = new Map();
const wsClients = new Map();
const pushSubscriptions = new Map(); // userId -> push subscription

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

// Get VAPID public key
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Save push subscription
app.post('/api/push/subscribe', (req, res) => {
  const { userId, subscription } = req.body;
  if (!userId || !subscription) {
    return res.status(400).json({ error: 'Missing userId or subscription' });
  }
  pushSubscriptions.set(userId, subscription);
  console.log(`Push subscription saved for user ${userId}`);
  res.json({ success: true });
});

// Send push notification helper
async function sendPushNotification(userId, payload) {
  const subscription = pushSubscriptions.get(userId);
  if (!subscription) {
    console.log(`No push subscription for user ${userId}`);
    return false;
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    console.log(`Push sent to user ${userId}`);
    return true;
  } catch (error) {
    console.error(`Push failed for user ${userId}:`, error.message);
    if (error.statusCode === 410) {
      // Subscription expired, remove it
      pushSubscriptions.delete(userId);
    }
    return false;
  }
}

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

app.post('/api/pairing/join', async (req, res) => {
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

  // Notify via WebSocket
  const otherWs = wsClients.get(otherUserId);
  if (otherWs && otherWs.readyState === WebSocket.OPEN) {
    otherWs.send(JSON.stringify({ type: 'new_connection', connection: connectionForOther }));
  }

  // Also send push notification
  await sendPushNotification(otherUserId, {
    title: 'New Connection! 🎉',
    body: `${currentUser.name} connected with you`,
    data: { type: 'new_connection' }
  });

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

app.post('/api/thinking', async (req, res) => {
  const { userId, connectionId } = req.body;
  if (!userId || !users.has(userId)) return res.status(400).json({ error: 'Invalid user' });
  const userConnections = connections.get(userId) || [];
  const connection = userConnections.find(c => c.id === connectionId);
  if (!connection) return res.status(404).json({ error: 'Connection not found' });

  const sender = users.get(userId);
  const recipientId = connection.partnerId;
  const recipientConnections = connections.get(recipientId) || [];
  const recipientConnection = recipientConnections.find(c => c.id === connectionId);

  const emoji = recipientConnection?.emoji || '💛';
  const message = recipientConnection?.message || 'is thinking of you';

  // Send via WebSocket (for when app is open)
  const recipientWs = wsClients.get(recipientId);
  if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
    recipientWs.send(JSON.stringify({
      type: 'thinking_of_you', from: sender.name, emoji, message, connectionId, timestamp: Date.now()
    }));
  }

  // Send push notification (for when app is closed)
  await sendPushNotification(recipientId, {
    title: `${emoji} ${sender.name}`,
    body: message,
    data: { type: 'thinking_of_you', from: sender.name, emoji, message }
  });

  res.json({ sent: true });
});

wss.on('connection', (ws) => {
  let currentUserId = null;
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'register') {
        currentUserId = data.userId;
        wsClients.set(currentUserId, ws);
        ws.send(JSON.stringify({ type: 'registered', userId: currentUserId }));
      }
    } catch (e) { console.error('WebSocket error:', e); }
  });
  ws.on('close', () => { if (currentUserId) wsClients.delete(currentUserId); });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, data] of pairingCodes.entries()) {
    if (now > data.expiresAt) pairingCodes.delete(code);
  }
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`💛 Server running on port ${PORT}`));
