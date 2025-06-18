const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
  // Пользователи
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  // Команды
  db.run(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      coach TEXT,
      user_id INTEGER,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // Игроки
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      team_id INTEGER,
      user_id INTEGER,
      number INTEGER,
      position TEXT,
      FOREIGN KEY(team_id) REFERENCES teams(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // Матчи
  db.run(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team1_id INTEGER,
      team2_id INTEGER,
      user_id INTEGER,
      date TEXT,
      score_team1 INTEGER DEFAULT 0,
      score_team2 INTEGER DEFAULT 0,
      status TEXT DEFAULT 'planned',
      FOREIGN KEY(team1_id) REFERENCES teams(id),
      FOREIGN KEY(team2_id) REFERENCES teams(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
});

db.close();
console.log('База данных инициализирована');
