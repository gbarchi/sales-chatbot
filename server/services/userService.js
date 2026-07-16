import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class UserService {
  constructor() {
    this.db = null;
  }

  initialize() {
    // Create database in data directory
    const dbPath = process.env.USER_DB_PATH || path.join(__dirname, '../data/users.db');
    this.db = new Database(dbPath);

    // Create users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'gerente', 'supervisor', 'vendedor')),
        slpcode INTEGER,
        supervisor_name TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on username
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');

    // Create query history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS query_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        query_text TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create index for efficient history queries
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_history_user ON query_history(user_id, timestamp DESC)');

    // Create saved queries (favorites) table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS saved_queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        query_text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create query logs table (admin analytics)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS query_logs (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id           INTEGER,
        username          TEXT,
        user_query        TEXT NOT NULL,
        resolved_entities TEXT,
        result_type       TEXT NOT NULL,
        llm_sql           TEXT,
        llm_chart_type    TEXT,
        llm_chart_config  TEXT,
        llm_explanation   TEXT,
        llm_raw_response  TEXT,
        error_message     TEXT,
        result_row_count  INTEGER,
        duration_ms       INTEGER,
        date_filter       TEXT,
        timestamp         DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_query_logs_timestamp ON query_logs(timestamp DESC)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_query_logs_result_type ON query_logs(result_type)');

    // Answer feedback (👍/👎 + optional correction) for trust + correction harvesting
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER,
        username    TEXT,
        rating      TEXT NOT NULL,        -- 'up' | 'down'
        query_text  TEXT,
        sql         TEXT,
        chart_type  TEXT,
        correction  TEXT,                 -- optional "el dato correcto es..."
        timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback(rating)');

    // Add last_login column if it doesn't exist (migration for existing databases)
    try {
      this.db.exec('ALTER TABLE users ADD COLUMN last_login DATETIME');
    } catch (e) { /* Column already exists */ }

    // Create settings table (key-value store for runtime config)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default admin if no users exist
    const userCount = this.db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (userCount.count === 0) {
      this.createDefaultUsers();
    }

    console.log('User database initialized');
  }

  createDefaultUsers() {
    const defaultUsers = [
      { username: 'admin', password: 'admin123', name: 'Administrador', role: 'admin', slpcode: null, supervisor_name: null },
      { username: 'gerente', password: 'gerente123', name: 'Gerente General', role: 'gerente', slpcode: null, supervisor_name: null },
      { username: 'angel.figueroa', password: 'supervisor123', name: 'Angel Figueroa', role: 'supervisor', slpcode: 52, supervisor_name: 'Angel Figueroa' },
      { username: 'alejandro.moreno', password: 'vendedor123', name: 'Alejandro Moreno', role: 'vendedor', slpcode: 5, supervisor_name: 'Angel Figueroa' },
    ];

    const insert = this.db.prepare(`
      INSERT INTO users (username, password_hash, name, role, slpcode, supervisor_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const user of defaultUsers) {
      const hash = bcrypt.hashSync(user.password, 10);
      insert.run(user.username, hash, user.name, user.role, user.slpcode, user.supervisor_name);
    }

    console.log('Default users created');
  }

  // Authenticate user
  authenticate(username, password) {
    const user = this.db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);

    if (!user) {
      return null;
    }

    if (!bcrypt.compareSync(password, user.password_hash)) {
      return null;
    }

    // Record last login timestamp
    this.db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    // Return user without password hash
    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // Settings key-value store
  getSetting(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  setSetting(key, value) {
    this.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value);
  }

  // Get user by ID
  getById(id) {
    const user = this.db.prepare('SELECT id, username, name, role, slpcode, supervisor_name, active, created_at, last_login FROM users WHERE id = ?').get(id);
    return user;
  }

  // Get user by username
  getByUsername(username) {
    const user = this.db.prepare('SELECT id, username, name, role, slpcode, supervisor_name, active, created_at, last_login FROM users WHERE username = ?').get(username);
    return user;
  }

  // Get all users (for admin)
  getAllUsers() {
    return this.db.prepare('SELECT id, username, name, role, slpcode, supervisor_name, active, created_at, last_login FROM users ORDER BY role, name').all();
  }

  // Create user
  createUser(userData) {
    const { username, password, name, role, slpcode, supervisor_name } = userData;

    // Check if username exists
    const existing = this.db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      throw new Error('El nombre de usuario ya existe');
    }

    const hash = bcrypt.hashSync(password, 10);

    const result = this.db.prepare(`
      INSERT INTO users (username, password_hash, name, role, slpcode, supervisor_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(username, hash, name, role, slpcode || null, supervisor_name || null);

    return this.getById(result.lastInsertRowid);
  }

  // Update user
  updateUser(id, userData) {
    const { name, role, slpcode, supervisor_name, active } = userData;

    this.db.prepare(`
      UPDATE users
      SET name = ?, role = ?, slpcode = ?, supervisor_name = ?, active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, role, slpcode || null, supervisor_name || null, active ? 1 : 0, id);

    return this.getById(id);
  }

  // Update password
  updatePassword(id, newPassword) {
    const hash = bcrypt.hashSync(newPassword, 10);
    this.db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, id);
  }

  // Delete user (soft delete)
  deleteUser(id) {
    this.db.prepare('UPDATE users SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  }

  // Hard delete user
  hardDeleteUser(id) {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  // Get available vendors (for dropdown when creating users)
  getAvailableVendors(dataService) {
    // This would query the sales data to get unique vendors
    // For now, return from the data service
    return dataService.getVendors();
  }

  // Get available supervisors (for dropdown when creating users)
  getAvailableSupervisors(dataService) {
    return dataService.getSupervisors();
  }

  // Escape SQL string to prevent injection (escape single quotes)
  escapeSqlString(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/'/g, "''");
  }

  // Validate that value is a safe integer
  validateSqlInteger(value) {
    const num = parseInt(value, 10);
    if (isNaN(num) || !Number.isInteger(num)) {
      return null;
    }
    return num;
  }

  // Get filter context for a user's role
  getFilterContext(user) {
    if (!user) {
      return { filter: null, description: null, canViewMargin: true };
    }

    switch (user.role) {
      case 'admin':
      case 'gerente':
        return {
          filter: null,
          description: 'Acceso completo a todos los datos',
          canViewMargin: true
        };

      case 'supervisor':
        if (user.supervisor_name) {
          // SECURITY: Escape single quotes to prevent SQL injection
          const safeName = this.escapeSqlString(user.supervisor_name);
          return {
            filter: `NombreSupervisor = '${safeName}'`,
            description: `Solo datos del equipo de ${user.supervisor_name}`,
            canViewMargin: false  // Supervisors cannot view margin data
          };
        }
        return { filter: null, description: 'Supervisor sin equipo asignado', canViewMargin: false };

      case 'vendedor':
        if (user.slpcode) {
          // SECURITY: Validate slpcode is a valid integer
          const safeSlpcode = this.validateSqlInteger(user.slpcode);
          if (safeSlpcode === null) {
            return { filter: null, description: 'Código de vendedor inválido', canViewMargin: false };
          }
          return {
            filter: `Slpcode = ${safeSlpcode}`,
            description: `Solo datos del vendedor ${user.name} (Código: ${safeSlpcode})`,
            canViewMargin: false  // Vendors cannot view margin data
          };
        }
        return { filter: null, description: 'Vendedor sin código asignado', canViewMargin: false };

      default:
        return { filter: null, description: null, canViewMargin: true };
    }
  }

  // Save query to history
  saveQueryHistory(userId, queryText) {
    // Don't save empty or very short queries
    if (!queryText || queryText.trim().length < 3) {
      return null;
    }

    const result = this.db.prepare(`
      INSERT INTO query_history (user_id, query_text)
      VALUES (?, ?)
    `).run(userId, queryText.trim());

    return result.lastInsertRowid;
  }

  // Get query history for a user
  getQueryHistory(userId, limit = 50) {
    return this.db.prepare(`
      SELECT id, query_text, timestamp
      FROM query_history
      WHERE user_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(userId, limit);
  }

  // Delete a query from history
  deleteQueryHistory(userId, historyId) {
    const result = this.db.prepare(`
      DELETE FROM query_history
      WHERE id = ? AND user_id = ?
    `).run(historyId, userId);

    return result.changes > 0;
  }

  // Clear all history for a user
  clearQueryHistory(userId) {
    const result = this.db.prepare(`
      DELETE FROM query_history
      WHERE user_id = ?
    `).run(userId);

    return result.changes;
  }

  // Get saved queries (favorites) for a user
  getSavedQueries(userId) {
    return this.db.prepare('SELECT * FROM saved_queries WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  }

  // Save a query as favorite
  saveQuery(userId, name, queryText) {
    const result = this.db.prepare('INSERT INTO saved_queries (user_id, name, query_text) VALUES (?, ?, ?)').run(userId, name, queryText);
    return { id: result.lastInsertRowid };
  }

  // Delete a saved query (favorite)
  deleteSavedQuery(userId, id) {
    this.db.prepare('DELETE FROM saved_queries WHERE id = ? AND user_id = ?').run(id, userId);
  }

  // Rename a saved query (favorite)
  renameSavedQuery(userId, id, newName) {
    this.db.prepare('UPDATE saved_queries SET name = ? WHERE id = ? AND user_id = ?').run(newName, id, userId);
  }

  // Save answer feedback (👍/👎 + optional correction)
  saveFeedback({ user_id = null, username = null, rating, query_text = null, sql = null, chart_type = null, correction = null }) {
    if (rating !== 'up' && rating !== 'down') throw new Error('rating must be "up" or "down"');
    const result = this.db.prepare(`
      INSERT INTO feedback (user_id, username, rating, query_text, sql, chart_type, correction)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(user_id, username, rating, query_text, sql, chart_type, correction);
    return { id: result.lastInsertRowid };
  }

  // Correction-harvesting view: counts + the most recent 👎/corrections to triage
  // into new eval cases or metric definitions (admin only).
  getFeedbackSummary(limit = 50) {
    const counts = this.db.prepare(`
      SELECT rating, COUNT(*) AS n FROM feedback GROUP BY rating
    `).all();
    const up = counts.find((c) => c.rating === 'up')?.n || 0;
    const down = counts.find((c) => c.rating === 'down')?.n || 0;
    const recentNegative = this.db.prepare(`
      SELECT id, username, query_text, sql, chart_type, correction, timestamp
      FROM feedback WHERE rating = 'down' ORDER BY timestamp DESC LIMIT ?
    `).all(limit);
    return { up, down, total: up + down, recentNegative };
  }

  // Save a query log entry (fire-and-forget safe — never throws)
  saveQueryLog(logData) {
    try {
      const {
        user_id = null,
        username = null,
        user_query,
        resolved_entities = null,
        result_type,
        llm_sql = null,
        llm_chart_type = null,
        llm_chart_config = null,
        llm_explanation = null,
        llm_raw_response = null,
        error_message = null,
        result_row_count = null,
        duration_ms = null,
        date_filter = null
      } = logData;

      if (!user_query || !result_type) return null;

      // Serialize objects; cap raw_response at 10KB to prevent storage bloat
      const serialize = (val) => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'string') return val.substring(0, 10240);
        return JSON.stringify(val).substring(0, 10240);
      };

      const result = this.db.prepare(`
        INSERT INTO query_logs (
          user_id, username, user_query, resolved_entities,
          result_type, llm_sql, llm_chart_type, llm_chart_config,
          llm_explanation, llm_raw_response, error_message,
          result_row_count, duration_ms, date_filter
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        user_id, username, user_query, serialize(resolved_entities),
        result_type, llm_sql, llm_chart_type, serialize(llm_chart_config),
        llm_explanation, serialize(llm_raw_response), error_message,
        result_row_count, duration_ms, serialize(date_filter)
      );

      return result.lastInsertRowid;
    } catch (err) {
      console.error('Error saving query log:', err);
      return null;
    }
  }

  // Get query logs for admin review
  getQueryLogs({ result_type = null, date_from = null, date_to = null, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];

    if (result_type) {
      conditions.push('result_type = ?');
      params.push(result_type);
    }
    if (date_from) {
      conditions.push('timestamp >= ?');
      params.push(date_from);
    }
    if (date_to) {
      conditions.push('timestamp <= ?');
      params.push(date_to + ' 23:59:59');
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const logs = this.db.prepare(`
      SELECT id, user_id, username, user_query, resolved_entities,
             result_type, llm_sql, llm_chart_type, llm_chart_config,
             llm_explanation, llm_raw_response, error_message,
             result_row_count, duration_ms, date_filter, timestamp
      FROM query_logs
      ${where}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const countRow = this.db.prepare(`
      SELECT COUNT(*) as total FROM query_logs ${where}
    `).get(...params);

    return { logs, total: countRow.total, limit, offset };
  }

  getQueryStats({ date_from = null, date_to = null, username = null } = {}) {
    // Date-only conditions — used for username_list dropdown (not filtered by user)
    const dateConditions = [];
    const dateParams = [];
    if (date_from) { dateConditions.push('timestamp >= ?'); dateParams.push(date_from); }
    if (date_to)   { dateConditions.push('timestamp <= ?'); dateParams.push(date_to + ' 23:59:59'); }

    // Main conditions: date + optional username filter
    const conditions = [...dateConditions];
    const params = [...dateParams];
    if (username) { conditions.push('username = ?'); params.push(username); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // KPIs
    const kpis = this.db.prepare(`
      SELECT
        COUNT(*) AS total_queries,
        ROUND(100.0 * SUM(CASE WHEN result_type IN ('success', 'conversational', 'multi', 'clarification') THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) AS success_rate,
        ROUND(AVG(duration_ms), 0) AS avg_duration_ms,
        COUNT(DISTINCT CASE WHEN username IS NOT NULL THEN username END) AS active_users
      FROM query_logs ${where}
    `).get(...params);

    // Queries per day — default to last 30 days when no date_from given
    const byDayConditions = [...conditions];
    if (!date_from) byDayConditions.push("timestamp >= DATE('now', '-30 days')");
    const byDayWhere = byDayConditions.length > 0 ? `WHERE ${byDayConditions.join(' AND ')}` : '';
    const by_day = this.db.prepare(`
      SELECT DATE(timestamp) AS day, COUNT(*) AS total
      FROM query_logs ${byDayWhere}
      GROUP BY DATE(timestamp) ORDER BY day ASC
    `).all(...params);

    // Result type breakdown
    const by_result_type = this.db.prepare(`
      SELECT result_type, COUNT(*) AS total
      FROM query_logs ${where}
      GROUP BY result_type ORDER BY total DESC
    `).all(...params);

    // Top chart types (success queries only)
    const chartConditions = [...conditions, "result_type = 'success'", 'llm_chart_type IS NOT NULL'];
    const chartWhere = `WHERE ${chartConditions.join(' AND ')}`;
    const by_chart_type = this.db.prepare(`
      SELECT llm_chart_type, COUNT(*) AS total
      FROM query_logs ${chartWhere}
      GROUP BY llm_chart_type ORDER BY total DESC LIMIT 10
    `).all(...params);

    // Top users — join to users table to get last_login
    const userConditions = [...conditions, 'ql.username IS NOT NULL'];
    const userWhere = `WHERE ${userConditions.join(' AND ')}`;
    const top_users = this.db.prepare(`
      SELECT sub.username, sub.total_queries, sub.success_rate, u.last_login
      FROM (
        SELECT username,
          COUNT(*) AS total_queries,
          ROUND(100.0 * SUM(CASE WHEN result_type IN ('success', 'conversational', 'multi', 'clarification') THEN 1 ELSE 0 END) / COUNT(*), 1) AS success_rate
        FROM query_logs ql
        ${userWhere}
        GROUP BY ql.username ORDER BY total_queries DESC LIMIT 10
      ) sub
      LEFT JOIN users u ON u.username = sub.username
    `).all(...params);

    // Username list for the filter dropdown (date-filtered only, not by username)
    const listConditions = [...dateConditions, 'username IS NOT NULL'];
    const listWhere = `WHERE ${listConditions.join(' AND ')}`;
    const username_list = this.db.prepare(`
      SELECT DISTINCT username FROM query_logs ${listWhere} ORDER BY username
    `).all(...dateParams).map(r => r.username);

    return { kpis, by_day, by_result_type, by_chart_type, top_users, username_list };
  }
}

export const userService = new UserService();
export default userService;
