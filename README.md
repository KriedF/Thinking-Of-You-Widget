# Thinking of You 💛

A gentle app for letting someone know you're thinking of them — no words needed.

## What is this?

Sometimes the most powerful thing you can do is simply let someone know they're in your thoughts. This app creates a quiet space for that connection.

- **One button** — tap to send a notification
- **Push notifications** — works even when the app is closed
- **Works on Android & iPhone** — just add to home screen
- **Up to 5 connections** — a small, intimate circle
- **Customizable** — choose your emoji and message

## How to Use

### Step 1: Add to Home Screen

**iPhone (Safari):**
1. Open the app URL in Safari
2. Tap the Share button (square with arrow)
3. Tap "Add to Home Screen"

**Android (Chrome):**
1. Open the app URL in Chrome
2. Tap the menu (3 dots)
3. Tap "Add to Home Screen"

### Step 2: Allow Notifications

When prompted, tap **Allow** to receive push notifications.

### Step 3: Connect with Someone

- **Share your code** — Give your unique code (like "gentle-sun-42") to someone
- **Enter their code** — Or enter someone else's code to connect

### Step 4: Send Love

Tap the big golden button. That's it. They'll get a notification. 💛

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS (PWA)
- **Backend:** Node.js + Express
- **Real-time:** WebSockets
- **Push Notifications:** Web Push API

## Self-Hosting

### Prerequisites
- Node.js 18+
- A server/hosting platform (Render, Railway, etc.)

### Setup

```bash
# Install dependencies
npm install

# Start the server
npm start
```

The server runs on port 3000 by default (or `PORT` environment variable).

### Environment

No environment variables required — VAPID keys are included in the code. For production, you may want to move these to environment variables.

## Privacy

- No tracking or analytics
- No accounts required
- Connections stored in memory (reset on server restart)
- Push subscriptions only used for notifications

## License

MIT

---

Made with care for those who need a gentle way to stay connected. 💛
