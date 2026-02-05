import jwt from 'jsonwebtoken';
import { userService } from '../services/userService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'maviju-salesbot-secret-key-2024';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '8h';

// Cookie configuration for security
const COOKIE_OPTIONS = {
  httpOnly: true,      // SECURITY: Prevents JavaScript access (XSS protection)
  secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
  sameSite: 'strict',  // CSRF protection
  maxAge: 8 * 60 * 60 * 1000  // 8 hours in milliseconds
};

export async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Usuario y contraseña son requeridos'
      });
    }

    const user = userService.authenticate(username, password);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Generate JWT token with user info including slpcode and supervisor
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        slpcode: user.slpcode,
        supervisor_name: user.supervisor_name
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // Get filter context for this user
    const filterContext = userService.getFilterContext(user);

    // SECURITY: Set token in HttpOnly cookie instead of response body
    res.cookie('authToken', token, COOKIE_OPTIONS);

    res.json({
      success: true,
      // Note: token no longer sent in response body for security
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        slpcode: user.slpcode,
        supervisor_name: user.supervisor_name,
        filterDescription: filterContext.description
      }
    });

  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}

export async function verifyToken(req, res) {
  try {
    // SECURITY: Read token from HttpOnly cookie instead of header
    const token = req.cookies?.authToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token no proporcionado'
      });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      // Get fresh user data from database
      const user = userService.getById(decoded.id);
      if (!user || !user.active) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no encontrado o inactivo'
        });
      }

      const filterContext = userService.getFilterContext(user);

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          slpcode: user.slpcode,
          supervisor_name: user.supervisor_name,
          filterDescription: filterContext.description
        }
      });
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido o expirado'
      });
    }

  } catch (error) {
    console.error('Verify Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}

export async function logout(req, res) {
  // SECURITY: Clear the HttpOnly cookie on logout
  res.clearCookie('authToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });

  res.json({
    success: true,
    message: 'Sesión cerrada exitosamente'
  });
}

// ============ Admin User Management Endpoints ============

export async function getUsers(req, res) {
  try {
    // Only admin can list users
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver usuarios'
      });
    }

    const users = userService.getAllUsers();
    res.json({ success: true, users });

  } catch (error) {
    console.error('Get Users Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo usuarios'
    });
  }
}

export async function createUser(req, res) {
  try {
    // Only admin can create users
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear usuarios'
      });
    }

    const { username, password, name, role, slpcode, supervisor_name } = req.body;

    if (!username || !password || !name || !role) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos'
      });
    }

    // Validate role
    const validRoles = ['admin', 'gerente', 'supervisor', 'vendedor'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Rol inválido'
      });
    }

    // Validate role-specific fields
    if (role === 'vendedor' && !slpcode) {
      return res.status(400).json({
        success: false,
        message: 'El código de vendedor (slpcode) es requerido para rol vendedor'
      });
    }

    if (role === 'supervisor' && !supervisor_name) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de supervisor es requerido para rol supervisor'
      });
    }

    const user = userService.createUser({
      username,
      password,
      name,
      role,
      slpcode: slpcode || null,
      supervisor_name: supervisor_name || null
    });

    res.json({ success: true, user });

  } catch (error) {
    console.error('Create User Error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Error creando usuario'
    });
  }
}

export async function updateUser(req, res) {
  try {
    // Only admin can update users
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para editar usuarios'
      });
    }

    const { id } = req.params;
    const { name, role, slpcode, supervisor_name, active } = req.body;

    if (!name || !role) {
      return res.status(400).json({
        success: false,
        message: 'Nombre y rol son requeridos'
      });
    }

    const user = userService.updateUser(id, {
      name,
      role,
      slpcode: slpcode || null,
      supervisor_name: supervisor_name || null,
      active: active !== false
    });

    res.json({ success: true, user });

  } catch (error) {
    console.error('Update User Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error actualizando usuario'
    });
  }
}

export async function updatePassword(req, res) {
  try {
    // Only admin can change passwords (or user can change their own)
    const { id } = req.params;
    if (req.user.role !== 'admin' && req.user.id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para cambiar esta contraseña'
      });
    }

    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres'
      });
    }

    userService.updatePassword(id, password);

    res.json({ success: true, message: 'Contraseña actualizada' });

  } catch (error) {
    console.error('Update Password Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error actualizando contraseña'
    });
  }
}

export async function deleteUser(req, res) {
  try {
    // Only admin can delete users
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar usuarios'
      });
    }

    const { id } = req.params;

    // Prevent deleting yourself
    if (req.user.id === parseInt(id)) {
      return res.status(400).json({
        success: false,
        message: 'No puedes eliminarte a ti mismo'
      });
    }

    userService.deleteUser(id);

    res.json({ success: true, message: 'Usuario eliminado' });

  } catch (error) {
    console.error('Delete User Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error eliminando usuario'
    });
  }
}

// Get available vendors from sales data (for dropdown)
export async function getAvailableVendors(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos'
      });
    }

    // Import dataService dynamically to avoid circular dependency
    const { dataService } = await import('../services/dataService.js');
    const vendors = await dataService.getVendorsList();

    res.json({ success: true, vendors });

  } catch (error) {
    console.error('Get Vendors Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo vendedores'
    });
  }
}

// Get available supervisors from sales data (for dropdown)
export async function getAvailableSupervisors(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos'
      });
    }

    const { dataService } = await import('../services/dataService.js');
    const supervisors = await dataService.getSupervisorsList();

    res.json({ success: true, supervisors });

  } catch (error) {
    console.error('Get Supervisors Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo supervisores'
    });
  }
}
