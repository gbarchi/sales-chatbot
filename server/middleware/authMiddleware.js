import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'maviju-salesbot-secret-key-2024';

// Check if authentication is enabled
const isAuthEnabled = () => {
  return process.env.AUTH_ENABLED !== 'false';
};

export function authenticateToken(req, res, next) {
  // If auth is disabled, skip authentication
  if (!isAuthEnabled()) {
    return next();
  }

  // SECURITY: Read token from HttpOnly cookie instead of Authorization header
  const token = req.cookies?.authToken;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Acceso no autorizado. Por favor inicia sesión.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido o expirado. Por favor inicia sesión nuevamente.'
    });
  }
}

// Middleware to check for specific roles
export function requireRole(...roles) {
  return (req, res, next) => {
    // If auth is disabled, skip role check
    if (!isAuthEnabled()) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Acceso no autorizado'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para realizar esta acción'
      });
    }

    next();
  };
}

// Export auth status checker
export function getAuthStatus(req, res) {
  res.json({
    enabled: isAuthEnabled()
  });
}
