# Dungeon Lair - D&D Web Application

A full-stack web application for managing Dungeons & Dragons campaigns with user authentication, role-based access, and a beautiful black and gold theme.

## 🏗️ Architecture

- **Frontend**: React with TypeScript, React Router, Axios
- **Backend**: Node.js with Express, JWT authentication
- **Database**: PostgreSQL
- **Styling**: Custom CSS with black and gold theme
- **Security**: HTTPS with SSL certificates, bcrypt password hashing, JWT tokens

## 🚀 Features

- **User Registration & Login** with form validation
- **Role-based Access Control** (Dungeon Master / Player)
- **JWT Authentication** with token persistence
- **First User Privilege** - First registered user becomes Dungeon Master
- **Responsive Design** with black and gold theme
- **HTTPS Support** using existing SSL certificates
- **Environment Configuration** for sensitive data

## 📁 Project Structure

```
DungeonsAndDragons/
├── backend/
│   ├── models/
│   │   ├── database.js      # PostgreSQL connection and initialization
│   │   └── User.js          # User model with CRUD operations
│   ├── routes/
│   │   └── auth.js          # Authentication routes (register/login)
│   ├── middleware/
│   │   └── auth.js          # JWT authentication middleware
│   ├── .env                 # Environment variables (NOT in git)
│   ├── package.json
│   └── server.js            # Main server file with HTTPS support
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   └── ProtectedRoute.tsx
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── styles/
│   │   │   └── theme.css    # Black and gold theme
│   │   └── App.tsx
│   └── package.json
├── Certs/
│   ├── cert.pem            # SSL certificate
│   └── key.pem             # SSL private key
└── .gitignore
```

## 🛠️ Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- PostgreSQL database
- SSL certificates (already present in Certs/ folder)

### 1. Database Setup

1. Create a PostgreSQL database:
   ```sql
   CREATE DATABASE dungeon_lair_db;
   ```

2. Create a database user:
   ```sql
   CREATE USER your_db_username WITH PASSWORD 'your_db_password';
   GRANT ALL PRIVILEGES ON DATABASE dungeon_lair_db TO your_db_username;
   ```

### 2. Backend Configuration

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Update the `.env` file with your database credentials:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=dungeon_lair_db
   DB_USER=your_db_username
   DB_PASSWORD=your_db_password
   JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the backend server:
   ```bash
   npm run dev
   ```

   The server will automatically:
   - Create database tables
   - Load SSL certificates
   - Start HTTPS server on port 5000

### 3. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

   The React app will start on port 3000.

### 4. Production Deployment

For production deployment on `dungeonlair-game.ddns.net`:

1. Update the `.env` file:
   ```env
   NODE_ENV=production
   CORS_ORIGIN=https://dungeonlair-game.ddns.net
   ```

2. Build the React app:
   ```bash
   cd frontend
   npm run build
   ```

3. Configure your web server to serve the React build files and proxy API requests to the Node.js backend.

## 🔒 Security Features

- **Password Hashing**: Bcrypt with 12 salt rounds
- **JWT Tokens**: 24-hour expiration with automatic refresh
- **Input Validation**: Server-side and client-side validation
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS Protection**: Configured for specific origins
- **HTTPS**: SSL/TLS encryption using provided certificates
- **Environment Variables**: Sensitive data in `.env` (git-ignored)

## 👥 User Roles

### Dungeon Master (First User)
- Full administrative access
- Campaign management capabilities
- Player oversight

### Player (Subsequent Users)
- Standard user access
- Character management
- Campaign participation

## 🎨 Theme

The application uses a custom black and gold theme inspired by classic D&D aesthetics:

- **Primary Colors**: Deep blacks (#1a1a1a, #2d2d2d)
- **Accent Colors**: Rich golds (#d4af37, #ffd700)
- **Typography**: Modern sans-serif with fantasy headers
- **Responsive Design**: Mobile-first approach

## 🔧 Environment Variables

Create a `.env` file in the backend directory with these variables:

```env
# Server Configuration
NODE_ENV=development
PORT=5000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dungeon_lair_db
DB_USER=your_db_username
DB_PASSWORD=your_db_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random

# CORS Configuration
CORS_ORIGIN=https://dungeonlair-game.ddns.net,http://localhost:3000

# SSL Configuration
SSL_CERT_PATH=../Certs/cert.pem
SSL_KEY_PATH=../Certs/key.pem

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 📝 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile (protected)
- `GET /api/auth/verify` - Verify JWT token (protected)

### Health
- `GET /api/health` - Health check endpoint

## 🚦 Getting Started

1. **First User Registration**: The first person to register becomes the Dungeon Master
2. **Subsequent Users**: All following registrations are assigned Player role
3. **Dashboard Access**: After login, users are redirected to a role-specific dashboard
4. **Token Persistence**: JWT tokens are stored in localStorage for session persistence

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🎲 Adventure Awaits!

Welcome to Dungeon Lair - where epic adventures begin! Whether you're a seasoned Dungeon Master or a brave new player, your journey starts here.

*"The adventure you're on is the adventure you're having."*