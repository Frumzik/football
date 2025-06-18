const API_BASE = 'http://localhost:3000';

function getToken() {
  return localStorage.getItem('token');
}

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { headers, ...options });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || `Ошибка ${res.status}`);
  return body;
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'none';
}

function toggleMenu() {
  const nav = document.querySelector('header nav');
  nav.style.display = nav.style.display === 'flex' ? 'none' : 'flex';
}

function logout() {
  localStorage.clear();
  window.location.href = 'login.html';
}

// ================================
// Авторизация
// ================================
function checkAuth() {
  const token = getToken();
  const page = location.pathname.split('/').pop();

  const publicPages = ['index.html', 'login.html'];

  // Если пользователь НЕ авторизован и пытается попасть на защищённую страницу
  if (!token && !publicPages.includes(page)) {
    location.href = '/pages/login.html';
    return;
  }

  // ❌ Убираем автопереход с index.html на teams.html
  // Разрешаем быть на index.html даже с токеном

  // Если пользователь авторизован и находится на login.html — редиректим в лк
  if (token && page === 'login.html') {
    location.href = '/pages/teams.html';
  }
}

async function handleRegister(e) {
    e.preventDefault();
    const { username, password } = e.target;
    try {
        const resp = await apiFetch('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ 
                username: username.value, 
                password: password.value 
            })
        });
        alert(resp.message);
        if (resp.success) {
            window.location.href = 'login.html';
        }
    } catch (err) {
        alert(err.message || 'Ошибка при регистрации');
    }
}

async function handleLogin(e) {
  e.preventDefault();
  const { username, password } = e.target;
  try {
    const resp = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: username.value, password: password.value })
    });
    if (!resp.token) throw new Error(resp.message);
    localStorage.setItem('token', resp.token);
    localStorage.setItem('userId', resp.userId);
    localStorage.setItem('username', username.value);
    location.href = 'teams.html';
  } catch (err) {
    alert(err.message);
  }
}

// ================================
// Заполнение селектов командами
// ================================
async function populateTeamSelects() {
  try {
    const teams = await apiFetch('/teams');
    const playerForm = document.getElementById('playerForm');
    const matchForm = document.getElementById('matchForm');
    if (playerForm) {
      const sel = playerForm.querySelector('select[name="team_id"]');
      sel.innerHTML = teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }
    if (matchForm) {
      const sel1 = matchForm.querySelector('select[name="team1_id"]');
      const sel2 = matchForm.querySelector('select[name="team2_id"]');
      sel1.innerHTML = teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
      sel2.innerHTML = teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }
  } catch (err) {
    console.error('populateTeamSelects:', err);
  }
}

// ================================
// CRUD: Команды и Игроки
// ================================
let editTeamId = null;
let editPlayerId = null;

async function loadTeams() {
  const container = document.getElementById('teams-list');
  if (!container) return;
  try {
    const teams = await apiFetch('/teams');
    container.innerHTML = teams.map(t => `
      <div class="card" data-id="${t.id}">
        <h3>${t.name}</h3>
        <p>Тренер: ${t.coach || '-'}</p>
        <div class="card-actions">
          <button onclick="openEditTeam(${t.id})">Редактировать</button>
          <button onclick="removeTeam(${t.id})">Удалить</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p>Ошибка загрузки команд.</p>';
  }
}

async function loadPlayers() {
    const container = document.getElementById('players-list');
    if (!container) return;
    
    try {
        const players = await apiFetch('/players');
        container.innerHTML = players.map(p => `
            <div class="card" data-id="${p.id}">
                <h3>${p.name}</h3>
                <p>Команда: ${p.team_name || 'Не назначена'}</p>
                <p>Номер: ${p.number}</p>
                <p>Позиция: ${p.position}</p>
                <div class="card-actions">
                    <button onclick="openEditPlayer(${p.id})" class="btn-edit">Редактировать</button>
                    <button onclick="removePlayer(${p.id})" class="btn-delete">Удалить</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Ошибка загрузки игроков:', err);
        container.innerHTML = '<p>Ошибка загрузки игроков</p>';
    }
}

function openAddTeam() {
  editTeamId = null;
  document.getElementById('teamForm').reset();
  openModal('teamModal');
}

async function openEditTeam(id) {
    editTeamId = id;
    try {
        const team = await apiFetch(`/teams/${id}`);
        const form = document.getElementById('teamForm');
        if (!form) throw new Error('Форма не найдена');
        
        form.name.value = team.name || '';
        form.coach.value = team.coach || '';
        openModal('teamModal');
    } catch (err) {
        console.error('Ошибка при загрузке команды:', err);
        showToast(err.message || 'Ошибка при загрузке команды', true);
    }
}

async function removeTeam(id) {
    try {
        const response = await apiFetch(`/teams/${id}`, { 
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (response.success) {
            const teamElement = document.querySelector(`.card[data-id="${id}"]`);
            if (teamElement) {
                teamElement.remove();
            }
            showToast('Команда успешно удалена');
            await loadTeams(); // Перезагружаем список команд
            await populateTeamSelects(); // Обновляем селекты
        }
    } catch (err) {
        console.error('Ошибка при удалении команды:', err);
        showToast('Ошибка при удалении команды', true);
    }
}

function openAddPlayer() {
  editPlayerId = null;
  document.getElementById('playerForm').reset();
  openModal('playerModal');
}

async function openEditPlayer(id) {
    editPlayerId = id;
    try {
        const player = await apiFetch(`/players/${id}`);
        const form = document.getElementById('playerForm');
        if (!form) throw new Error('Форма не найдена');

        // Заполняем форму данными игрока
        form.name.value = player.name || '';
        form.team_id.value = player.team_id || '';
        form.number.value = player.number || '';
        form.position.value = player.position || '';
        
        openModal('playerModal');
    } catch (err) {
        console.error('Ошибка при загрузке игрока:', err);
        showToast('Ошибка при загрузке игрока', true);
    }
}

async function removePlayer(id) {
    try {
        const response = await apiFetch(`/players/${id}`, { 
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (response.success) {
            const playerElement = document.querySelector(`.card[data-id="${id}"]`);
            if (playerElement) {
                playerElement.remove();
            }
            showToast('Игрок успешно удален');
            await loadPlayers(); // Перезагружаем список игроков
        }
    } catch (err) {
        console.error('Ошибка при удалении игрока:', err);
        showToast('Ошибка при удалении игрока', true);
    }
}

async function submitTeamForm(e) {
  e.preventDefault();
  const { name, coach } = e.target;
  try {
    const url = editTeamId ? `/teams/${editTeamId}` : '/teams';
    const method = editTeamId ? 'PUT' : 'POST';
    await apiFetch(url, { method, body: JSON.stringify({ name: name.value, coach: coach.value }) });
    closeModal('teamModal');
    loadTeams();
    populateTeamSelects();
  } catch (err) {
    alert(err.message);
  }
}

async function submitPlayerForm(e) {
    e.preventDefault();
    e.stopPropagation(); // Добавляем это для предотвращения всплытия события
    const form = e.target;
    
    if (form.dataset.submitting) return; // Предотвращаем повторную отправку
    form.dataset.submitting = 'true';
    
    try {
        const playerData = {
            name: form.name.value,
            team_id: parseInt(form.team_id.value),
            number: parseInt(form.number.value),
            position: form.position.value
        };

        const url = editPlayerId ? `/players/${editPlayerId}` : '/players';
        const method = editPlayerId ? 'PUT' : 'POST';

        await apiFetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(playerData)
        });

        closeModal('playerModal');
        await loadPlayers();
        editPlayerId = null;
        showToast('Игрок успешно сохранен');
    } catch (err) {
        console.error('Ошибка при сохранении игрока:', err);
        showToast('Ошибка при сохранении игрока', true);
    } finally {
        delete form.dataset.submitting; // Очищаем флаг отправки
    }
}

// ================================
// CRUD: Матчи и Симуляция
// ================================
const simulators = {};

async function loadMatches() {
  const container = document.getElementById('matches-list');
  if (!container) return;
  try {
    const matches = await apiFetch('/matches');
    container.innerHTML = matches.map(match => {
      const matchDate = new Date(match.date);
      const now = new Date();
      let statusClass = 'match-upcoming';
      let statusText = '';
      if (match.status === 'finished') {
        statusClass = 'match-finished';
        statusText = `Матч окончен. Счёт: ${match.score_team1} - ${match.score_team2}`;
      } else if (matchDate <= now) {
        statusClass = 'match-live';
        statusText = 'Матч идет';
      } else {
        const diff = matchDate - now;
        const minutes = Math.floor(diff / 60000);
        statusText = `До начала: ${minutes} мин.`;
      }
      return `
        <div class="match-card ${statusClass}" id="match-${match.id}" data-date="${match.date}" data-team1="${match.team1_name}" data-team2="${match.team2_name}">
          <div class="match-header">
            <h3>${match.team1_name} vs ${match.team2_name}</h3>
            <span class="match-status">${statusText}</span>
          </div>
          <div class="match-info">
            <div class="match-score">${match.status === 'finished' ? 
                `${match.score_team1} - ${match.score_team2}` : '0 - 0'}</div>
            <div class="match-timer">${match.status === 'finished' ? '' : '30с'}</div>
            <div class="match-date">${matchDate.toLocaleString()}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Ошибка загрузки матчей:', err);
    container.innerHTML = '<p>Ошибка загрузки матчей</p>';
  }
}

class MatchSimulator {
  constructor(match) {
    this.match = match;
    this.timeLeft = 30;
    this.score1 = 0;
    this.score2 = 0;
    this.isRunning = false;
    this.matchElement = document.getElementById(`match-${match.id}`);
    this.interval = null;
    this.scoreInterval = null;
  }

  shouldStart() {
    const matchDate = new Date(this.match.date);
    return matchDate <= new Date() && !this.isRunning && this.match.status !== 'finished';
  }

  start() {
    if (this.isRunning || !this.matchElement) return;
    this.isRunning = true;
    this.matchElement.classList.add('match-live');
    this.interval = setInterval(() => this.tick(), 1000);
    this.scoreInterval = setInterval(() => this.updateScore(), 5000);
    this.updateUI();
  }

  stop() {
    clearInterval(this.interval);
    clearInterval(this.scoreInterval);
    this.isRunning = false;
    delete simulators[this.match.id];
  }

  updateScore() {
    if (!this.isRunning) return;
    if (Math.random() < 0.3) this.score1++;
    if (Math.random() < 0.3) this.score2++;
    this.updateUI();
  }

  updateUI() {
    if (!this.matchElement) return;
    const statusEl = this.matchElement.querySelector('.match-status');
    const scoreEl = this.matchElement.querySelector('.match-score');
    const timerEl = this.matchElement.querySelector('.match-timer');
    if (this.isRunning) {
      statusEl.textContent = 'Матч идет';
      scoreEl.textContent = `${this.score1} - ${this.score2}`;
      if (timerEl) timerEl.textContent = `${this.timeLeft}с`;
    } else {
      scoreEl.textContent = `${this.score1} - ${this.score2}`;
      statusEl.textContent = 'Матч завершен';
      if (timerEl) timerEl.remove();
      this.matchElement.classList.remove('match-live');
      this.matchElement.classList.add('match-finished');
    }
  }

  async finish() {
    this.stop();
    try {
      await apiFetch(`/matches/${this.match.id}`, {
        method: 'PUT',
        body: JSON.stringify({ score_team1: this.score1, score_team2: this.score2, status: 'finished' })
      });
      this.updateUI();
      showToast(`Матч завершен! ${this.match.team1_name} ${this.score1} - ${this.score2} ${this.match.team2_name}`);
      if (typeof loadStats === 'function') loadStats();
    } catch (err) {
      console.error('Ошибка при завершении матча:', err);
    }
  }

  tick() {
    if (!this.isRunning) return;
    this.timeLeft--;
    this.updateUI();
    if (this.timeLeft <= 0) this.finish();
  }
}

// Функция для отображения уведомлений
function showToast(message, isError = false) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast${isError ? ' error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Автоматический запуск симуляторов
setInterval(() => {
  document.querySelectorAll('.match-card').forEach(el => {
    const id = el.id.split('-')[1];
    if (!simulators[id]) {
      const match = {
        id,
        date: el.dataset.date,
        team1_name: el.dataset.team1,
        team2_name: el.dataset.team2,
        status: el.classList.contains('match-finished') ? 'finished' : 'upcoming'
      };
      const sim = new MatchSimulator(match);
      simulators[id] = sim;
      if (sim.shouldStart()) sim.start();
    }
  });
}, 1000);

// ================================
// Страница статистики
// ================================
async function loadStats() {
    const container = document.getElementById('stats-table');
    if (!container) return;

    try {
        const stats = await apiFetch('/stats');
        
        if (!stats.length) {
            container.innerHTML = '<p>Нет данных для отображения статистики</p>';
            return;
        }

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Команда</th>
                        <th>Матчи</th>
                        <th>Победы</th>
                        <th>Забито</th>
                        <th>Пропущено</th>
                        <th>Винрейт</th>
                    </tr>
                </thead>
                <tbody>
        `;

        stats.forEach(team => {
            const winRate = team.total_games ? 
                ((team.wins / team.total_games) * 100).toFixed(1) : 0;
            const goalDiff = team.goals_scored - team.goals_conceded;

            html += `
                <tr>
                    <td>${team.name}</td>
                    <td>${team.total_games || 0}</td>
                    <td>${team.wins || 0}</td>
                    <td>${team.goals_scored || 0}</td>
                    <td>${team.goals_conceded || 0}</td>
                    <td>${winRate}%</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (err) {
        console.error('Ошибка загрузки статистики:', err);
        container.innerHTML = '<p>Ошибка при загрузке статистики</p>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  document.getElementById('register-form')?.addEventListener('submit', handleRegister);
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('addTeamBtn')?.addEventListener('click', openAddTeam);
  document.getElementById('teamForm')?.addEventListener('submit', submitTeamForm);
  document.getElementById('addPlayerBtn')?.addEventListener('click', openAddPlayer);
  document.getElementById('playerForm')?.addEventListener('submit', submitPlayerForm);
  document.getElementById('addMatchBtn')?.addEventListener('click', openMatchModal);
  document.getElementById('matchForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const team1Id = +form.team1_id.value;
    const team2Id = +form.team2_id.value;
    if (team1Id === team2Id) { alert('Команда не может играть сама с собой!'); return; }
    const date = new Date(form.date.value);
    if (date < new Date()) { alert('Нельзя создать матч в прошлом!'); return; }
    try {
      const resp = await apiFetch('/matches', { method: 'POST', body: JSON.stringify({ team1_id: team1Id, team2_id: team2Id, date: date.toISOString() }) });
      if (resp.id) { closeModal('matchModal'); await loadMatches(); showToast('Матч успешно создан'); }
    } catch (err) { alert('Ошибка при создании матча'); console.error(err); }
  });
  document.querySelectorAll('.modal .close').forEach(btn => btn.closest('.modal-overlay').style.display = 'none');
  if (location.pathname.includes('teams.html')) loadTeams();
  if (location.pathname.includes('players.html')) { loadPlayers(); populateTeamSelects(); }
  if (location.pathname.includes('matches.html')) { loadMatches(); populateTeamSelects(); }
  if (location.pathname.includes('stats.html')) loadStats();
});

async function openMatchModal() {
  const modal = document.getElementById('matchModal');
  const sel1 = document.querySelector('#matchForm select[name="team1_id"]');
  const sel2 = document.querySelector('#matchForm select[name="team2_id"]');
  try {
    const teams = await apiFetch('/teams');
    if (teams.length < 2) { alert('Нужно минимум две команды'); return; }
    const opts = teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    sel1.innerHTML = opts; sel2.innerHTML = opts;
    modal.style.display = 'flex';
  } catch (err) { alert('Ошибка загрузки команд'); console.error(err); }
}