// OpenClaw Control UI Application
// Connects to gateway via WebSocket

class OpenClawApp {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.connId = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.seq = 0;

    this.initElements();
    this.initEventListeners();
  }

  initElements() {
    // Auth
    this.authModal = document.getElementById('auth-modal');
    this.authForm = document.getElementById('auth-form');
    this.authMode = document.getElementById('auth-mode');
    this.tokenGroup = document.getElementById('token-group');
    this.passwordGroup = document.getElementById('password-group');
    this.authToken = document.getElementById('auth-token');
    this.authPassword = document.getElementById('auth-password');

    // Status
    this.connectionStatus = document.getElementById('connection-status');

    // Main content
    this.mainContent = document.getElementById('main-content');

    // Navigation
    this.navItems = document.querySelectorAll('.nav-item');

    // Views
    this.views = {
      overview: document.getElementById('view-overview'),
      chat: document.getElementById('view-chat'),
      sessions: document.getElementById('view-sessions'),
      channels: document.getElementById('view-channels'),
      agents: document.getElementById('view-agents'),
      config: document.getElementById('view-config'),
    };

    // Chat
    this.chatForm = document.getElementById('chat-form');
    this.chatInput = document.getElementById('chat-input');
    this.chatMessages = document.getElementById('chat-messages');

    // Stats
    this.statConnections = document.getElementById('stat-connections');
    this.statMessages = document.getElementById('stat-messages');
    this.statChannels = document.getElementById('stat-channels');
    this.statUptime = document.getElementById('stat-uptime');

    // Lists
    this.channelList = document.getElementById('channel-list');
    this.sessionsList = document.getElementById('sessions-list');
    this.agentsList = document.getElementById('agents-list');
    this.configContent = document.getElementById('config-content');
  }

  initEventListeners() {
    // Auth mode toggle
    this.authMode.addEventListener('change', () => {
      const mode = this.authMode.value;
      this.tokenGroup.classList.toggle('hidden', mode !== 'token');
      this.passwordGroup.classList.toggle('hidden', mode !== 'password');
    });

    // Auth form submit
    this.authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.connect();
    });

    // Navigation
    this.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        this.showView(view);
      });
    });

    // Chat form
    this.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.sendChatMessage();
    });
  }

  connect() {
    const mode = this.authMode.value;
    const token = this.authToken.value;
    const password = this.authPassword.value;

    const wsUrl = `ws://${window.location.host}`;
    console.log('Connecting to:', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      alert('Failed to connect to gateway');
      return;
    }

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.sendConnect(mode, token, password);
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed');
      this.setDisconnected();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.setDisconnected();
    };
  }

  sendConnect(mode, token, password) {
    const connectParams = {
      minProtocol: 1,
      maxProtocol: 1,
      client: {
        id: 'control-ui-' + Math.random().toString(36).substr(2, 9),
        displayName: 'Control UI',
        version: '1.0.0',
        platform: navigator.platform,
        mode: 'control-ui',
      },
      caps: ['chat', 'config'],
      auth: {},
    };

    if (mode === 'token' && token) {
      connectParams.auth.token = token;
    } else if (mode === 'password' && password) {
      connectParams.auth.password = password;
    }

    this.ws.send(JSON.stringify(connectParams));
  }

  handleMessage(data) {
    let message;
    try {
      message = JSON.parse(data);
    } catch (error) {
      console.error('Failed to parse message:', error);
      return;
    }

    console.log('Received:', message);

    // Handle hello-ok
    if (message.type === 'hello-ok') {
      this.connId = message.server?.connId;
      this.setConnected();
      this.loadInitialData();
      return;
    }

    // Handle response
    if (message.type === 'res') {
      const callback = this.pendingRequests.get(message.id);
      if (callback) {
        this.pendingRequests.delete(message.id);
        callback(message);
      }
      return;
    }

    // Handle events
    if (message.type === 'event') {
      this.handleEvent(message);
      return;
    }
  }

  handleEvent(event) {
    switch (event.event) {
      case 'tick':
        // Update uptime display
        break;
      case 'chat':
        this.handleChatEvent(event.payload);
        break;
      case 'presence':
        // Update presence
        break;
    }
  }

  handleChatEvent(payload) {
    if (payload?.delta?.text) {
      this.appendAssistantMessage(payload.delta.text);
    }
  }

  setConnected() {
    this.connected = true;
    this.connectionStatus.classList.remove('disconnected');
    this.connectionStatus.classList.add('connected');
    this.connectionStatus.querySelector('.status-text').textContent = 'Connected';

    this.authModal.classList.add('hidden');
    this.mainContent.classList.remove('hidden');
  }

  setDisconnected() {
    this.connected = false;
    this.connectionStatus.classList.remove('connected');
    this.connectionStatus.classList.add('disconnected');
    this.connectionStatus.querySelector('.status-text').textContent = 'Disconnected';

    this.authModal.classList.remove('hidden');
    this.mainContent.classList.add('hidden');
  }

  sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = `req-${++this.requestId}`;
      const frame = {
        type: 'req',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, (response) => {
        if (response.ok) {
          resolve(response.payload);
        } else {
          reject(response.error);
        }
      });

      this.ws.send(JSON.stringify(frame));

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }

  async loadInitialData() {
    try {
      // Load channels
      const channelsResponse = await this.sendRequest('channels.status');
      this.renderChannels(channelsResponse?.channels || []);

      // Load sessions
      const sessionsResponse = await this.sendRequest('sessions.list');
      this.renderSessions(sessionsResponse?.sessions || []);

      // Load agents
      const agentsResponse = await this.sendRequest('agents.list');
      this.renderAgents(agentsResponse?.agents || []);

      // Load config
      const configResponse = await this.sendRequest('config.get');
      this.renderConfig(configResponse?.config || {});

      // Update stats
      this.updateStats(channelsResponse?.channels || []);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  }

  renderChannels(channels) {
    const icons = {
      whatsapp: '📱',
      telegram: '✈️',
      discord: '🎮',
      slack: '💬',
      signal: '🔒',
      imessage: '💬',
    };

    this.channelList.innerHTML = channels.map(ch => `
      <div class="channel-card">
        <div class="channel-icon">${icons[ch.type] || '📡'}</div>
        <div class="channel-info">
          <div class="channel-name">${ch.type.charAt(0).toUpperCase() + ch.type.slice(1)}</div>
          <div class="channel-account">${ch.account?.phone || ch.account?.username || ch.account?.teamName || '-'}</div>
        </div>
        <span class="channel-status ${ch.status}">${ch.status}</span>
      </div>
    `).join('');
  }

  renderSessions(sessions) {
    this.sessionsList.innerHTML = sessions.map(s => `
      <div class="session-item">
        <div class="session-info">
          <div class="session-key">${s.key}</div>
          <div class="session-meta">${s.messageCount} messages · ${s.tokenCount} tokens</div>
        </div>
      </div>
    `).join('');
  }

  renderAgents(agents) {
    this.agentsList.innerHTML = agents.map(a => `
      <div class="agent-card">
        <div class="agent-header">
          <span class="agent-avatar">${a.emoji || '🤖'}</span>
          <div>
            <div class="agent-name">${a.name}</div>
            <div class="agent-id">${a.id}</div>
          </div>
        </div>
        <p>${a.description || 'No description'}</p>
      </div>
    `).join('');
  }

  renderConfig(config) {
    this.configContent.textContent = JSON.stringify(config, null, 2);
  }

  updateStats(channels) {
    const connectedCount = channels.filter(c => c.status === 'connected').length;
    this.statChannels.textContent = `${connectedCount}/${channels.length}`;
    this.statConnections.textContent = '1';
    this.statMessages.textContent = '0';
  }

  showView(viewName) {
    // Update nav
    this.navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    // Show view
    Object.entries(this.views).forEach(([name, el]) => {
      el.classList.toggle('hidden', name !== viewName);
    });
  }

  async sendChatMessage() {
    const text = this.chatInput.value.trim();
    if (!text) return;

    // Add user message to UI
    this.appendUserMessage(text);
    this.chatInput.value = '';

    try {
      await this.sendRequest('chat.send', {
        sessionKey: 'main',
        message: text,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  appendUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message user';
    div.innerHTML = `
      <div class="message-avatar">👤</div>
      <div class="message-content">
        <p>${this.escapeHtml(text)}</p>
      </div>
    `;
    this.chatMessages.appendChild(div);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  appendAssistantMessage(text) {
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.innerHTML = `
      <div class="message-avatar">🦞</div>
      <div class="message-content">
        <p>${this.escapeHtml(text)}</p>
      </div>
    `;
    this.chatMessages.appendChild(div);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Start the app
document.addEventListener('DOMContentLoaded', () => {
  window.app = new OpenClawApp();
});
