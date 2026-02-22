import { userService } from '../services/userService.js';

export const getFavorites = (req, res) => {
  try {
    const favorites = userService.getSavedQueries(req.user.id);
    res.json(favorites);
  } catch (err) {
    console.error('Get Favorites Error:', err);
    res.status(500).json({ error: 'Error al obtener favoritos' });
  }
};

export const saveFavorite = (req, res) => {
  const { name, query_text } = req.body;
  if (!name || !query_text) return res.status(400).json({ error: 'name y query_text son requeridos' });
  try {
    const result = userService.saveQuery(req.user.id, name, query_text);
    res.json({ id: result.id, name, query_text, created_at: new Date().toISOString() });
  } catch (err) {
    console.error('Save Favorite Error:', err);
    res.status(500).json({ error: 'Error al guardar favorito' });
  }
};

export const deleteFavorite = (req, res) => {
  try {
    userService.deleteSavedQuery(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete Favorite Error:', err);
    res.status(500).json({ error: 'Error al eliminar favorito' });
  }
};

export const renameFavorite = (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name es requerido' });
  try {
    userService.renameSavedQuery(req.user.id, req.params.id, name);
    res.json({ success: true });
  } catch (err) {
    console.error('Rename Favorite Error:', err);
    res.status(500).json({ error: 'Error al renombrar favorito' });
  }
};
