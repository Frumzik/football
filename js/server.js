const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const session = require('express-session');

const app = express();
const db = new sqlite3.Database('./database.sqlite');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Настраиваем статические пути для корневой директории проекта
app.use(express.static(path.join(__dirname, '..')));

// Добавляем поддержку сессий
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false
}));

// Middleware для проверки авторизации
const checkAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/pages/login.html');
    }
    next();
};

// Обработка всех HTML-запросов
app.get('*.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', req.path));
});

// Auth routes
app.post('/auth/index', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password) VALUES (?, ?)',
            [username, hashedPassword],
            function (err) {
                if (err) {
                    return res.status(400).json({ success: false, message: 'Ошибка при регистрации' });
                }
                res.json({ success: true, message: 'Регистрация успешна' });
            }
        );
    } catch (err) {
        res.status(400).json({ success: false, message: 'Ошибка при регистрации' });
    }
});

// Обработка регистрации
app.post('/auth/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Проверяем, существует ли пользователь
        db.get('SELECT id FROM users WHERE username = ?', [username], (err, user) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Ошибка сервера' });
            }
            if (user) {
                return res.status(400).json({ success: false, message: 'Пользователь уже существует' });
            }
            
            // Создаем нового пользователя
            db.run('INSERT INTO users (username, password) VALUES (?, ?)',
                [username, hashedPassword],
                function(err) {
                    if (err) {
                        return res.status(500).json({ success: false, message: 'Ошибка при регистрации' });
                    }
                    res.json({ success: true, message: 'Регистрация успешна' });
                }
            );
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Функция получения userId из токена
function getUserIdFromToken(authHeader) {
    if (!authHeader) return null;
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, 'your-secret-key');
        return decoded.userId;
    } catch (err) {
        return null;
    }
}

// Обновляем логин, чтобы возвращать userId
app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ message: 'Пользователь не найден' });
        }
        try {
            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) {
                return res.status(401).json({ message: 'Неверный пароль' });
            }
            const token = jwt.sign({ userId: user.id }, 'your-secret-key', { expiresIn: '24h' });
            req.session.user = { id: user.id, username: user.username }; // Сохраняем пользователя в сессии
            res.json({ token, userId: user.id });
        } catch (err) {
            res.status(400).json({ message: 'Ошибка при входе' });
        }
    });
});

// Обновляем получение команд с фильтрацией по пользователю
app.get('/teams', (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) {
        return res.status(401).json({ message: 'Необходима авторизация' });
    }
    
    db.all('SELECT * FROM teams WHERE user_id = ?', [userId], (err, teams) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(400).json({ message: 'Ошибка при получении команд' });
        }
        res.json(teams || []);
    });
});

// Обновляем создание команды
app.post('/teams', (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const { name, coach } = req.body;
    
    // Добавляем отладочные логи
    console.log('Creating team:', { name, coach, userId });
    
    db.run(
        'INSERT INTO teams (name, coach, user_id) VALUES (?, ?, ?)',
        [name, coach, userId],
        function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(400).json({ message: 'Ошибка при создании команды' });
            }
            const newTeam = {
                id: this.lastID,
                name,
                coach,
                user_id: userId
            };
            console.log('Team created:', newTeam);
            res.json(newTeam);
        }
    );
});

// Обновление команды
app.put('/teams/:id', (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { name, coach } = req.body;
    db.run('UPDATE teams SET name = ?, coach = ? WHERE id = ? AND user_id = ?',
        [name, coach, req.params.id, userId],
        function (err) {
            if (err) {
                return res.status(400).json({ message: 'Ошибка при обновлении команды' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ message: 'Команда не найдена' });
            }
            res.json({ success: true, message: 'Команда обновлена' });
        }
    );
});

// Удаление команды
app.delete('/teams/:id', (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    db.run('DELETE FROM teams WHERE id = ? AND user_id = ?', 
        [req.params.id, userId], 
        function (err) {
            if (err) {
                return res.status(400).json({ message: 'Ошибка при удалении команды' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ message: 'Команда не найдена' });
            }
            res.json({ success: true, message: 'Команда удалена' });
        }
    );
});

// Обновленный эндпоинт получения игроков
app.get('/players', (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    db.all(`
        SELECT p.*, t.name as team_name 
        FROM players p 
        LEFT JOIN teams t ON p.team_id = t.id 
        WHERE p.user_id = ?
    `, [userId], (err, players) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(400).json({ message: 'Ошибка при получении игроков' });
        }
        res.json(players || []);
    });
});

// Обновленный эндпоинт создания игрока
app.post('/players', (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const { name, team_id, number, position } = req.body;
    
    db.run(`
        INSERT INTO players (name, team_id, user_id, number, position) 
        VALUES (?, ?, ?, ?, ?)
    `, [name, team_id, userId, number, position], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(400).json({ message: 'Ошибка при создании игрока' });
        }
        res.json({ 
            id: this.lastID,
            name,
            team_id,
            number,
            position,
            user_id: userId
        });
    });
});

// Эндпоинты для матчей
app.get('/matches', (req, res) => {
  const userId = getUserIdFromToken(req.headers.authorization);
  db.all(`
    SELECT m.*, t1.name as team1_name, t2.name as team2_name 
    FROM matches m 
    LEFT JOIN teams t1 ON m.team1_id = t1.id 
    LEFT JOIN teams t2 ON m.team2_id = t2.id 
    WHERE m.user_id = ?
    ORDER BY m.date DESC`, 
    [userId], 
    (err, matches) => {
      if (err) return res.status(400).json({ message: 'Ошибка при получении матчей' });
      res.json(matches);
    });
});

// Обновляем эндпоинт для создания матчей
app.post('/matches', (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) {
        return res.status(401).json({ message: 'Необходима авторизация' });
    }

    const { team1_id, team2_id, date } = req.body;

    db.run(
        'INSERT INTO matches (team1_id, team2_id, user_id, date) VALUES (?, ?, ?, ?)',
        [team1_id, team2_id, userId, date],
        function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(400).json({ message: 'Ошибка при создании матча' });
            }
            res.json({
                id: this.lastID,
                team1_id,
                team2_id,
                date,
                user_id: userId
            });
        }
    );
});

// Endpoint для обновления результата матча
app.put('/matches/:id', (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    const { score_team1, score_team2, status } = req.body;

    db.run(
        'UPDATE matches SET score_team1 = ?, score_team2 = ?, status = ? WHERE id = ? AND user_id = ?',
        [score_team1, score_team2, status, req.params.id, userId],
        function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(400).json({ message: 'Ошибка при обновлении матча' });
            }
            res.json({ success: true });
        }
    );
});

// Обновленный endpoint для статистики
app.get('/stats', (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    db.all(`
        SELECT 
            t.id,
            t.name,
            COUNT(DISTINCT m.id) as total_games,
            SUM(CASE 
                WHEN (m.team1_id = t.id AND m.score_team1 > m.score_team2) OR 
                     (m.team2_id = t.id AND m.score_team2 > m.score_team1) 
                THEN 1 ELSE 0 END) as wins,
            SUM(CASE 
                WHEN m.team1_id = t.id THEN m.score_team1
                WHEN m.team2_id = t.id THEN m.score_team2
                ELSE 0 END) as goals_scored,
            SUM(CASE 
                WHEN m.team1_id = t.id THEN m.score_team2
                WHEN m.team2_id = t.id THEN m.score_team1
                ELSE 0 END) as goals_conceded
        FROM teams t
        LEFT JOIN matches m ON (t.id = m.team1_id OR t.id = m.team2_id) AND m.status = 'finished'
        WHERE t.user_id = ?
        GROUP BY t.id
    `, [userId], (err, stats) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(400).json({ message: 'Ошибка при получении статистики' });
        }
        res.json(stats || []);
    });
});

// Добавляем endpoint для удаления матча
app.delete('/matches/:id', (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    db.run('DELETE FROM matches WHERE id = ? AND user_id = ?', 
        [req.params.id, userId], 
        function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(400).json({ message: 'Ошибка при удалении матча' });
            }
            res.json({ success: true });
        }
    );
});

// Получение одной команды
app.get('/teams/:id', (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    db.get('SELECT * FROM teams WHERE id = ? AND user_id = ?', 
        [req.params.id, userId], 
        (err, team) => {
            if (err) return res.status(400).json({ message: 'Ошибка при получении команды' });
            if (!team) return res.status(404).json({ message: 'Команда не найдена' });
            res.json(team);
        }
    );
});

// Получение одной игрока
app.get('/players/:id', (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    db.get(`
        SELECT p.*, t.name as team_name 
        FROM players p 
        LEFT JOIN teams t ON p.team_id = t.id 
        WHERE p.id = ? AND p.user_id = ?`, 
        [req.params.id, userId], 
        (err, player) => {
            if (err) return res.status(400).json({ message: 'Ошибка при получении игрока' });
            if (!player) return res.status(404).json({ message: 'Игрок не найден' });
            res.json(player);
        }
    );
});

// Обновление игрока
app.put('/players/:id', (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { name, team_id, number, position } = req.body;
    
    db.run(`
        UPDATE players 
        SET name = ?, team_id = ?, number = ?, position = ? 
        WHERE id = ? AND user_id = ?`,
        [name, team_id, number, position, req.params.id, userId],
        function(err) {
            if (err) return res.status(400).json({ message: 'Ошибка при обновлении игрока' });
            if (this.changes === 0) return res.status(404).json({ message: 'Игрок не найден' });
            res.json({ success: true, message: 'Игрок обновлен' });
        }
    );
});

// Удаление игрока
app.delete('/players/:id', (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    db.run('DELETE FROM players WHERE id = ? AND user_id = ?', 
        [req.params.id, userId], 
        function (err) {
            if (err) {
                return res.status(400).json({ message: 'Ошибка при удалении игрока' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ message: 'Игрок не найден' });
            }
            res.json({ success: true, message: 'Игрок удален' });
        }
    );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
