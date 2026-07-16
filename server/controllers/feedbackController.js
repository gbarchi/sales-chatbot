import { userService } from '../services/userService.js';

// POST /api/feedback — user rates an answer 👍/👎 with optional correction text.
export const submitFeedback = (req, res) => {
  const { rating, query_text, sql, chart_type, correction } = req.body;
  if (rating !== 'up' && rating !== 'down') {
    return res.status(400).json({ error: 'rating debe ser "up" o "down"' });
  }
  try {
    const result = userService.saveFeedback({
      user_id: req.user?.id ?? null,
      username: req.user?.username ?? null,
      rating,
      query_text: query_text ?? null,
      sql: sql ?? null,
      chart_type: chart_type ?? null,
      correction: correction ?? null,
    });
    res.json({ success: true, id: result.id });
  } catch (err) {
    console.error('Submit Feedback Error:', err);
    res.status(500).json({ error: 'Error al guardar la retroalimentación' });
  }
};

// GET /api/admin/feedback — correction-harvesting summary (admin/gerente only).
export const getFeedbackSummary = (req, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'gerente') {
    return res.status(403).json({ error: 'No autorizado' });
  }
  try {
    res.json(userService.getFeedbackSummary());
  } catch (err) {
    console.error('Get Feedback Summary Error:', err);
    res.status(500).json({ error: 'Error al obtener retroalimentación' });
  }
};
