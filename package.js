{
  "name": "laborar-backend",
  "version": "1.0.0",
  "description": "LaborAr - Backend con autenticación completa",
  "main": "auth.js",
  "scripts": {
    "start": "node auth.js",
    "dev": "nodemon auth.js",
    "setup": "node setup-db.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "better-sqlite3": "^9.4.3",
    "nodemailer": "^6.9.8",
    "google-auth-library": "^9.6.3",
    "cookie-parser": "^1.4.6",
    "dotenv": "^16.4.1",
    "groq-sdk": "^0.3.3"
  },
  "devDependencies": {
    "nodemon": "^3.0.3"
  }
}
