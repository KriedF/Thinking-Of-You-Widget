// State
let state = {
  user: null,
  connections: [],
  selectedConnection: null,
  pairingCode: null,
  pairingExpiry: null,
  ws: null
};

// DOM Elements
const elements = {
  onboardingScreen: document.getElementById('onboardingScreen'),
  homeScreen: document.getElementById('homeScreen'),
  connectionsScreen: document.getElementById('connectionsScreen'),
  nameInput: document.getElementById('nameInput'),
  startBtn: document.getElementById('startBtn'),
  userGreeting: document.getElementById('userGreeting'),
  emptyState: document.getElementById('emptyState'),
  connectionView: document.getElementById('connectionView'),
  thinkingButton: document.getElementById('thinkingButton'),
  buttonEmoji: document.getElementById('buttonEmoji'),
  selectedName: document.getElementById('selectedName'),
  addFirstConnection: document.getElementById('addFirstConnection'),
  connectionsList: document.getElementById('connectionsList'),
  pairingCode: document.getElementById('pairingCode'),
  pairingTimer: document.getElementById('pairingTimer'),
  copyCodeBtn: document.getElementById('copyCodeBtn'),
  joinCodeInput: document.getElementById('joinCodeInput'),
  joinCodeBtn: document.getElementById('joinCodeBtn'),
  bottomNav: document.getElementById('bottomNav'),
  navTabs: document.querySelectorAll('.nav-tab'),
  navBtns: document.querySelectorAll('.nav-btn'),
  connectionsTab: document.getElementById('connectionsTab'),
  addTab: document.getElementById('addTab'),
  toast: document.getElementById('toast'),
  toastEmoji: document.getElementById('toastEmoji'),
  toastFrom: document.getElementById('toastFrom'),
  toastMessage: document.getElementById('toastMessage'),
  customizeModal: document.getElementById('customizeModal'),
  closeModal: document.getElementById('closeModal'),
  emojiPicker: document.getElementById('emojiPicker'),
  customMessage: document.getElementById('customMessage'),
  saveCustomization: document.getElementById('saveCustomization'),
  installPrompt: document.getElementById('installPrompt'),
  installBtn: document.getElementById('installBtn'),
  dismissInstall: document.getElementById('dismissInstall')
};

async function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service worker registered');

      // Subscribe to push notifications after SW is ready
      navigator.serviceWorker.ready.then(subscribeToPush);
    } catch (e) {
      console.error('Service worker registration failed:', e);
    }
  }

  const savedUserId = localStorage.getItem('userId');
  const savedName = localStorage.getItem('userName');

  if (savedUserId) {
    await loadUser(savedUserId, savedName);
  } else {
    showScreen('onboarding');
  }

  setupEventListeners();
  setupInstallPrompt();
}

// Subscribe to push notifications
async function subscribeToPush(registration) {
  if (!state.user) return;

  try {
    // Get VAPID public key from server
    const response = await fetch('/api/vapid-public-key');
    const { publicKey } = await response.json();

    // Convert VAPID key to Uint8Array
    const vapidPublicKey = urlBase64ToUint8Array(publicKey);

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Subscribe to push
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey
      });
      console.log('Push subscription created');
    }

    // Send subscription to server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: state.user.id,
        subscription: subscription.toJSON()
      })
    });
    console.log('Push subscription sent to server');
  } catch (error) {
    console.error('Push subscription failed:', error);
  }
}

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function loadUser(userId, name) {
  try {
    const response = await fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, name })
    });

    const data = await response.json();

    if (data.user) {
      state.user = data.user;
      state.connections = data.connections || [];
      localStorage.setItem('userId', data.user.id);
      localStorage.setItem('userName', data.user.name);

      elements.userGreeting.textContent = `Hi, ${data.user.name}`;
      connectWebSocket();
      updateHomeScreen();
      showScreen('home');
      elements.bottomNav.style.display = 'block';

      // Subscribe to push after user is loaded
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(subscribeToPush);
      }
    }
  } catch (e) {
    console.error('Failed to load user:', e);
    showScreen('onboarding');
  }
}

async function createUser(name) {
  try {
    const response = await fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    const data = await response.json();

    if (data.user) {
      state.user = data.user;
      state.connections = [];
      localStorage.setItem('userId', data.user.id);
      localStorage.setItem('userName', data.user.name);

      elements.userGreeting.textContent = `Hi, ${data.user.name}`;
      connectWebSocket();
      updateHomeScreen();
      showScreen('home');
      elements.bottomNav.style.display = 'block';

      // Subscribe to push after user is created
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(subscribeToPush);
      }
    }
  } catch (e) {
    console.error('Failed to create user:', e);
    alert('Something went wrong. Please try again.');
  }
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    state.ws.send(JSON.stringify({
      type: 'register',
      userId: state.user.id
    }));
  };

  state.ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleWebSocketMessage(data);
  };

  state.ws.onclose = () => {
    setTimeout(connectWebSocket, 3000);
  };

  state.ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function handleWebSocketMessage(data) {
  switch (data.type) {
    case 'thinking_of_you':
      showNotification(data);
      break;
    case 'new_connection':
      state.connections.push(data.connection);
      renderConnectionsList();
      updateHomeScreen();
      showToast('🎉', 'New connection!', `${data.connection.partnerName} connected with you`);
      break;
    case 'registered':
      break;
  }
}

function showNotification(data) {
  showToast(data.emoji, data.from, data.message);

  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100]);
  }
}

function showToast(emoji, from, message) {
  elements.toastEmoji.textContent = emoji;
  elements.toastFrom.textContent = from;
  elements.toastMessage.textContent = message;
  elements.toast.classList.add('show');

  setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 4000);
}

function showScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  switch (screen) {
    case 'onboarding':
      elements.onboardingScreen.classList.add('active');
      break;
    case 'home':
      elements.homeScreen.classList.add('active');
      break;
    case 'connections':
      elements.connectionsScreen.classList.add('active');
      generatePairingCode();
      break;
  }

  elements.navBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === screen);
  });
}

function updateHomeScreen() {
  if (state.connections.length === 0) {
    elements.emptyState.style.display = 'block';
    elements.connectionView.style.display = 'none';
  } else {
    elements.emptyState.style.display = 'none';
    elements.connectionView.style.display = 'block';

    if (!state.selectedConnection) {
      state.selectedConnection = state.connections[0];
    }

    updateSelectedConnection();
  }
}

function updateSelectedConnection() {
  if (state.selectedConnection) {
    elements.buttonEmoji.textContent = state.selectedConnection.emoji;
    elements.selectedName.textContent = state.selectedConnection.partnerName;
  }
}

function renderConnectionsList() {
  if (state.connections.length === 0) {
    elements.connectionsList.innerHTML = `
      <div class="empty-state">
        <p>No connections yet. Create a code or enter someone else's to connect!</p>
      </div>
    `;
    return;
  }

  elements.connectionsList.innerHTML = state.connections.map(conn => `
    <div class="connection-card ${state.selectedConnection?.id === conn.id ? 'selected' : ''}"
         data-connection-id="${conn.id}">
      <div class="connection-emoji">${conn.emoji}</div>
      <div class="connection-info">
        <div class="connection-name">${conn.partnerName}</div>
        <div class="connection-message">${conn.emoji} ${conn.message}</div>
      </div>
      <button class="btn btn-secondary btn-small customize-btn" data-connection-id="${conn.id}">
        Edit
      </button>
    </div>
  `).join('');

  document.querySelectorAll('.connection-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.classList.contains('customize-btn')) {
        const connId = card.dataset.connectionId;
        state.selectedConnection = state.connections.find(c => c.id === connId);
        updateSelectedConnection();
        renderConnectionsList();
        showScreen('home');
      }
    });
  });

  document.querySelectorAll('.customize-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const connId = btn.dataset.connectionId;
      openCustomizeModal(connId);
    });
  });
}

async function generatePairingCode() {
  if (!state.user) return;

  try {
    const response = await fetch('/api/pairing/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: state.user.id })
    });

    const data = await response.json();

    if (data.code) {
      state.pairingCode = data.code;
      state.pairingExpiry = Date.now() + 10 * 60 * 1000;
      elements.pairingCode.textContent = data.code;
      startPairingTimer();
    }
  } catch (e) {
    console.error('Failed to generate pairing code:', e);
  }
}

let timerInterval;
function startPairingTimer() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    const remaining = state.pairingExpiry - Date.now();

    if (remaining <= 0) {
      clearInterval(timerInterval);
      elements.pairingTimer.textContent = 'Code expired';
      generatePairingCode();
      return;
    }

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    elements.pairingTimer.textContent = `Expires in ${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

async function joinWithCode(code) {
  if (!state.user || !code.trim()) return;

  try {
    const response = await fetch('/api/pairing/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: state.user.id,
        code: code.trim().toLowerCase()
      })
    });

    const data = await response.json();

    if (data.error) {
      alert(data.error);
      return;
    }

    if (data.connection) {
      state.connections.push(data.connection);
      state.selectedConnection = data.connection;
      elements.joinCodeInput.value = '';
      renderConnectionsList();
      updateHomeScreen();
      showScreen('home');
      showToast('🎉', 'Connected!', `You're now connected with ${data.connection.partnerName}`);
    }
  } catch (e) {
    console.error('Failed to join:', e);
    alert('Something went wrong. Please try again.');
  }
}

async function sendThinkingOfYou() {
  if (!state.user || !state.selectedConnection) return;

  elements.thinkingButton.classList.add('sent');
  setTimeout(() => elements.thinkingButton.classList.remove('sent'), 600);

  if (navigator.vibrate) {
    navigator.vibrate(100);
  }

  try {
    await fetch('/api/thinking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: state.user.id,
        connectionId: state.selectedConnection.id
      })
    });
  } catch (e) {
    console.error('Failed to send:', e);
  }
}

let editingConnectionId = null;

function openCustomizeModal(connectionId) {
  editingConnectionId = connectionId;
  const connection = state.connections.find(c => c.id === connectionId);

  if (!connection) return;

  elements.customMessage.value = connection.message;

  document.querySelectorAll('.emoji-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.emoji === connection.emoji);
  });

  elements.customizeModal.classList.add('show');
}

function closeCustomizeModal() {
  elements.customizeModal.classList.remove('show');
  editingConnectionId = null;
}

async function saveCustomization() {
  if (!editingConnectionId) return;

  const selectedEmoji = document.querySelector('.emoji-option.selected')?.dataset.emoji || '💛';
  const message = elements.customMessage.value.trim() || 'is thinking of you';

  try {
    const response = await fetch(`/api/connection/${editingConnectionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: state.user.id,
        emoji: selectedEmoji,
        message
      })
    });

    const data = await response.json();

    if (data.connection) {
      const idx = state.connections.findIndex(c => c.id === editingConnectionId);
      if (idx !== -1) {
        state.connections[idx] = { ...state.connections[idx], ...data.connection };
      }

      if (state.selectedConnection?.id === editingConnectionId) {
        state.selectedConnection = state.connections[idx];
        updateSelectedConnection();
      }

      renderConnectionsList();
      closeCustomizeModal();
    }
  } catch (e) {
    console.error('Failed to save customization:', e);
  }
}

let deferredPrompt;

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    setTimeout(() => {
      if (!localStorage.getItem('installDismissed')) {
        elements.installPrompt.classList.add('show');
      }
    }, 30000);
  });

  elements.installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    }
    elements.installPrompt.classList.remove('show');
  });

  elements.dismissInstall.addEventListener('click', () => {
    elements.installPrompt.classList.remove('show');
    localStorage.setItem('installDismissed', 'true');
  });
}

async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    console.log('Notification permission:', permission);
  }
}

function setupEventListeners() {
  elements.startBtn.addEventListener('click', () => {
    const name = elements.nameInput.value.trim() || 'Friend';
    createUser(name);
    requestNotificationPermission();
  });

  elements.nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') elements.startBtn.click();
  });

  elements.thinkingButton.addEventListener('click', sendThinkingOfYou);

  elements.addFirstConnection.addEventListener('click', () => {
    showScreen('connections');
    document.querySelector('[data-tab="add"]').click();
  });

  elements.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      elements.navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const tabName = tab.dataset.tab;
      elements.connectionsTab.style.display = tabName === 'list' ? 'block' : 'none';
      elements.addTab.style.display = tabName === 'add' ? 'block' : 'none';

      if (tabName === 'list') renderConnectionsList();
    });
  });

  elements.navBtns.forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });

  elements.copyCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(state.pairingCode).then(() => {
      elements.copyCodeBtn.textContent = 'Copied!';
      setTimeout(() => elements.copyCodeBtn.textContent = 'Copy Code', 2000);
    });
  });

  elements.joinCodeBtn.addEventListener('click', () => joinWithCode(elements.joinCodeInput.value));

  elements.joinCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinWithCode(elements.joinCodeInput.value);
  });

  elements.closeModal.addEventListener('click', closeCustomizeModal);
  elements.customizeModal.addEventListener('click', (e) => {
    if (e.target === elements.customizeModal) closeCustomizeModal();
  });

  elements.emojiPicker.addEventListener('click', (e) => {
    if (e.target.classList.contains('emoji-option')) {
      document.querySelectorAll('.emoji-option').forEach(opt => opt.classList.remove('selected'));
      e.target.classList.add('selected');
    }
  });

  elements.saveCustomization.addEventListener('click', saveCustomization);
  elements.toast.addEventListener('click', () => elements.toast.classList.remove('show'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
