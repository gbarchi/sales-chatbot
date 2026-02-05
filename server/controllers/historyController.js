import { userService } from '../services/userService.js';

// Get query history for the authenticated user
export async function getHistory(req, res) {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;

    const history = userService.getQueryHistory(userId, limit);

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Get History Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el historial'
    });
  }
}

// Delete a specific query from history
export async function deleteHistory(req, res) {
  try {
    const userId = req.user.id;
    const historyId = parseInt(req.params.id);

    if (!historyId) {
      return res.status(400).json({
        success: false,
        message: 'ID de historial requerido'
      });
    }

    const deleted = userService.deleteQueryHistory(userId, historyId);

    if (deleted) {
      res.json({
        success: true,
        message: 'Consulta eliminada del historial'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Consulta no encontrada'
      });
    }
  } catch (error) {
    console.error('Delete History Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar del historial'
    });
  }
}

// Clear all history for the authenticated user
export async function clearHistory(req, res) {
  try {
    const userId = req.user.id;
    const deletedCount = userService.clearQueryHistory(userId);

    res.json({
      success: true,
      message: `${deletedCount} consultas eliminadas del historial`
    });
  } catch (error) {
    console.error('Clear History Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al limpiar el historial'
    });
  }
}
