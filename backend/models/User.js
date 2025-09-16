const { pool } = require('./database');
const bcrypt = require('bcryptjs');

class User {
  // Create a new user
  static async create(userData) {
    const { username, email, password } = userData;
    
    try {
      // Hash the password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      
      // Check if this is the first user (should be Dungeon Master)
      const userCountResult = await pool.query('SELECT COUNT(*) FROM users');
      const userCount = parseInt(userCountResult.rows[0].count);
      const role = userCount === 0 ? 'Dungeon Master' : 'Player';
      
      // Insert the new user
      const result = await pool.query(
        `INSERT INTO users (username, email, password_hash, role) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, username, email, role, created_at`,
        [username, email, passwordHash, role]
      );
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Find user by email
  static async findByEmail(email) {
    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Find user by username
  static async findByUsername(username) {
    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Find user by ID
  static async findById(id) {
    try {
      const result = await pool.query(
        'SELECT id, username, email, role, created_at FROM users WHERE id = $1',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Verify password
  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }
  
  // Update user's last login
  static async updateLastLogin(userId) {
    try {
      await pool.query(
        'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [userId]
      );
    } catch (error) {
      throw error;
    }
  }
  
  // Get all users (admin function)
  static async getAll() {
    try {
      const result = await pool.query(
        'SELECT id, username, email, role, created_at FROM users ORDER BY created_at ASC'
      );
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = User;