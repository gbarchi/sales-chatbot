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

    // Return user without password hash
    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // Get user by ID
  getById(id) {
    const user = this.db.prepare('SELECT id, username, name, role, slpcode, supervisor_name, active, created_at FROM users WHERE id = ?').get(id);
    return user;
  }

  // Get user by username
  getByUsername(username) {
    const user = this.db.prepare('SELECT id, username, name, role, slpcode, supervisor_name, active, created_at FROM users WHERE username = ?').get(username);
    return user;
  }

  // Get all users (for admin)
  getAllUsers() {
    return this.db.prepare('SELECT id, username, name, role, slpcode, supervisor_name, active, created_at FROM users ORDER BY role, name').all();
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

  // Get filter context for a user's role
  getFilterContext(user) {
    if (!user) {
      return { filter: null, description: null };
    }

    switch (user.role) {
      case 'admin':
      case 'gerente':
        return {
          filter: null,
          description: 'Acceso completo a todos los datos'
        };

      case 'supervisor':
        if (user.supervisor_name) {
          return {
            filter: `NombreSupervisor = '${user.supervisor_name}'`,
            description: `Solo datos del equipo de ${user.supervisor_name}`
          };
        }
        return { filter: null, description: 'Supervisor sin equipo asignado' };

      case 'vendedor':
        if (user.slpcode) {
          return {
            filter: `Slpcode = ${user.slpcode}`,
            description: `Solo datos del vendedor ${user.name} (Código: ${user.slpcode})`
          };
        }
        return { filter: null, description: 'Vendedor sin código asignado' };

      default:
        return { filter: null, description: null };
    }
  }
}

export const userService = new UserService();
export default userService;
