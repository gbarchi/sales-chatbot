const API_BASE = process.env.REACT_APP_API_URL || '/api';

// SECURITY: All requests use credentials: 'include' for HttpOnly cookie auth
// No more localStorage token handling

export async function sendChatMessage(query, conversationHistory = [], dateFilter = null, signal = null) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',  // SECURITY: HttpOnly cookie auth
    body: JSON.stringify({ query, conversationHistory, dateFilter }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export async function fetchMetadata() {
  const response = await fetch(`${API_BASE}/metadata`, {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export async function fetchSuggestions() {
  const response = await fetch(`${API_BASE}/suggestions`, {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export async function checkHealth() {
  const response = await fetch(`${API_BASE}/health`);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

// ========== Admin API Functions ==========

export async function fetchUsers() {
  const response = await fetch(`${API_BASE}/admin/users`, {
    credentials: 'include'
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Error fetching users');
  }

  return response.json();
}

export async function createUser(userData) {
  const response = await fetch(`${API_BASE}/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(userData)
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Error creating user');
  }

  return response.json();
}

export async function updateUser(id, userData) {
  const response = await fetch(`${API_BASE}/admin/users/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(userData)
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Error updating user');
  }

  return response.json();
}

export async function deleteUser(id) {
  const response = await fetch(`${API_BASE}/admin/users/${id}`, {
    method: 'DELETE',
    credentials: 'include'
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Error deleting user');
  }

  return response.json();
}

export async function updatePassword(id, password) {
  const response = await fetch(`${API_BASE}/admin/users/${id}/password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ password })
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Error updating password');
  }

  return response.json();
}

export async function fetchVendors() {
  const response = await fetch(`${API_BASE}/admin/vendors`, {
    credentials: 'include'
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Error fetching vendors');
  }

  return response.json();
}

export async function fetchSupervisors() {
  const response = await fetch(`${API_BASE}/admin/supervisors`, {
    credentials: 'include'
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Error fetching supervisors');
  }

  return response.json();
}

// ========== Query History API Functions ==========

export async function fetchQueryHistory(limit = 50) {
  const response = await fetch(`${API_BASE}/history?limit=${limit}`, {
    credentials: 'include'
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Error fetching history');
  }

  return response.json();
}

export async function deleteHistoryItem(id) {
  const response = await fetch(`${API_BASE}/history/${id}`, {
    method: 'DELETE',
    credentials: 'include'
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Error deleting history item');
  }

  return response.json();
}

export async function clearQueryHistory() {
  const response = await fetch(`${API_BASE}/history`, {
    method: 'DELETE',
    credentials: 'include'
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Error clearing history');
  }

  return response.json();
}
