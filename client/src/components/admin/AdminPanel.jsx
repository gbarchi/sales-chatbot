import React, { useState, useEffect } from 'react';
import { fetchUsers, createUser, updateUser, updatePassword, deleteUser, fetchVendors, fetchSupervisors, fetchSettings, saveSettings } from '../../services/api';

const MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — Rápido y económico' },
  { value: 'claude-sonnet-4-6',          label: 'Sonnet 4.6 — Equilibrado' },
  { value: 'claude-opus-4-6',            label: 'Opus 4.6 — Máxima capacidad' },
];

function AdminPanel({ onClose }) {
  const [activeTab, setActiveTab] = useState('users');

  // Users tab state
  const [users, setUsers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    role: 'vendedor',
    slpcode: '',
    supervisor_name: ''
  });

  // Config tab state
  const [settingsModel, setSettingsModel] = useState('claude-haiku-4-5-20251001');
  const [settingsApiKey, setSettingsApiKey] = useState('');
  const [settingsMaskedKey, setSettingsMaskedKey] = useState('');
  const [settingsHasKey, setSettingsHasKey] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState(null); // { type: 'success'|'error', text }
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadSettings = async () => {
    setSettingsLoading(true);
    try {
      const data = await fetchSettings();
      setSettingsModel(data.model || 'claude-haiku-4-5-20251001');
      setSettingsMaskedKey(data.maskedKey || '');
      setSettingsHasKey(data.hasKey || false);
    } catch (err) {
      setSettingsMessage({ type: 'error', text: err.message });
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'config') loadSettings();
  }, [activeTab]);

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setSettingsMessage(null);
    try {
      const result = await saveSettings({ apiKey: settingsApiKey, model: settingsModel });
      setSettingsMessage({ type: 'success', text: result.message });
      setSettingsApiKey('');
      await loadSettings();
    } catch (err) {
      setSettingsMessage({ type: 'error', text: err.message });
    } finally {
      setSettingsSaving(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, vendorsData, supervisorsData] = await Promise.all([
        fetchUsers(),
        fetchVendors(),
        fetchSupervisors()
      ]);
      setUsers(usersData.users || []);
      setVendors(vendorsData.vendors || []);
      setSupervisors(supervisorsData.supervisors || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await updateUser(editingUser.id, formData);
        // If password was provided, update it separately
        if (formData.password && formData.password.length >= 6) {
          await updatePassword(editingUser.id, formData.password);
        }
      } else {
        await createUser(formData);
      }
      setShowForm(false);
      setEditingUser(null);
      resetForm();
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      name: user.name,
      role: user.role,
      slpcode: user.slpcode || '',
      supervisor_name: user.supervisor_name || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar este usuario?')) {
      try {
        await deleteUser(id);
        loadData();
      } catch (err) {
        setError(err.message);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      name: '',
      role: 'vendedor',
      slpcode: '',
      supervisor_name: ''
    });
  };

  const handleVendorSelect = (e) => {
    const slpcode = e.target.value;
    const vendor = vendors.find(v => v.Slpcode === parseInt(slpcode));
    if (vendor) {
      setFormData({
        ...formData,
        slpcode: vendor.Slpcode,
        name: vendor.NombreVendedor,
        supervisor_name: vendor.NombreSupervisor
      });
    }
  };

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'admin': return 'badge-admin';
      case 'gerente': return 'badge-gerente';
      case 'supervisor': return 'badge-supervisor';
      case 'vendedor': return 'badge-vendedor';
      default: return '';
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'admin': return 'Administrador';
      case 'gerente': return 'Gerente';
      case 'supervisor': return 'Supervisor';
      case 'vendedor': return 'Vendedor';
      default: return role;
    }
  };

  if (loading) {
    return (
      <div className="admin-panel">
        <div className="admin-loading">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>{activeTab === 'config' ? 'Configuración del Sistema' : 'Gestión de Usuarios'}</h2>
        <div className="admin-actions">
          {activeTab === 'users' && (
            <button className="btn-primary" onClick={() => { resetForm(); setEditingUser(null); setShowForm(true); }}>
              + Nuevo Usuario
            </button>
          )}
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
      </div>

      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Usuarios
        </button>
        <button
          className={`admin-tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          Configuracion
        </button>
      </div>

      {error && (
        <div className="admin-error">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {showForm && (
        <div className="admin-form-overlay">
          <form className="admin-form" onSubmit={handleSubmit}>
            <h3>{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>

            {formData.role === 'vendedor' && !editingUser && (
              <div className="form-group">
                <label>Seleccionar Vendedor (de la base de datos)</label>
                <select onChange={handleVendorSelect} value="">
                  <option value="">-- Seleccionar vendedor existente --</option>
                  {vendors.map(v => (
                    <option key={v.Slpcode} value={v.Slpcode}>
                      {v.NombreVendedor} (Código: {v.Slpcode})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>Usuario *</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value})}
                required
                disabled={editingUser}
              />
            </div>

            <div className="form-group">
              <label>{editingUser ? 'Nueva Contraseña (dejar vacío para mantener)' : 'Contraseña *'}</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                required={!editingUser}
                minLength={6}
              />
            </div>

            <div className="form-group">
              <label>Nombre Completo *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
              />
            </div>

            <div className="form-group">
              <label>Rol *</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({...formData, role: e.target.value})}
              >
                <option value="vendedor">Vendedor</option>
                <option value="supervisor">Supervisor</option>
                <option value="gerente">Gerente</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            {formData.role === 'vendedor' && (
              <div className="form-group">
                <label>Código de Vendedor (Slpcode) *</label>
                <input
                  type="number"
                  value={formData.slpcode}
                  onChange={(e) => setFormData({...formData, slpcode: e.target.value})}
                  required
                />
                <small>Este código filtra los datos que el vendedor puede ver</small>
              </div>
            )}

            {formData.role === 'supervisor' && (
              <div className="form-group">
                <label>Nombre de Supervisor *</label>
                <select
                  value={formData.supervisor_name}
                  onChange={(e) => setFormData({...formData, supervisor_name: e.target.value})}
                  required
                >
                  <option value="">-- Seleccionar --</option>
                  {supervisors.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <small>Este nombre filtra los datos del equipo que el supervisor puede ver</small>
              </div>
            )}

            <div className="form-actions">
              <button type="button" onClick={() => { setShowForm(false); setEditingUser(null); }}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary">
                {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="config-tab">
          {settingsLoading ? (
            <div className="config-loading">Cargando configuración...</div>
          ) : (
            <>
              {settingsMessage && (
                <div className={`config-message ${settingsMessage.type}`}>
                  {settingsMessage.text}
                  <button onClick={() => setSettingsMessage(null)}>×</button>
                </div>
              )}

              <div className="config-section">
                <h3>Modelo de IA</h3>
                <p className="config-desc">Selecciona el modelo de Claude que se usará para todas las consultas.</p>
                <select
                  className="config-select"
                  value={settingsModel}
                  onChange={(e) => setSettingsModel(e.target.value)}
                >
                  {MODELS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="config-section">
                <h3>API Key de Anthropic</h3>
                <p className="config-desc">
                  {settingsHasKey
                    ? <>Clave actual: <code>{settingsMaskedKey}</code>. Deja el campo vacío para mantenerla.</>
                    : 'No hay clave guardada en la base de datos. Se está usando la del archivo .env.'}
                </p>
                <div className="config-key-row">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    className="config-input"
                    placeholder="Introduce nueva API key (sk-ant-...)"
                    value={settingsApiKey}
                    onChange={(e) => setSettingsApiKey(e.target.value)}
                  />
                  <button className="btn-toggle-key" onClick={() => setShowApiKey(v => !v)}>
                    {showApiKey ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                <small>La API key se almacena en la base de datos local del servidor, no en el código.</small>
              </div>

              <button
                className="btn-save-config"
                onClick={handleSaveSettings}
                disabled={settingsSaving}
              >
                {settingsSaving ? 'Guardando...' : 'Guardar Configuración'}
              </button>
            </>
          )}
        </div>
      )}

      {activeTab === 'users' && <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Código/Equipo</th>
              <th>Estado</th>
              <th>Último acceso</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className={!user.active ? 'inactive' : ''}>
                <td>{user.username}</td>
                <td>{user.name}</td>
                <td>
                  <span className={`role-badge ${getRoleBadgeClass(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                </td>
                <td>
                  {user.role === 'vendedor' && user.slpcode && (
                    <span className="code-badge">Código: {user.slpcode}</span>
                  )}
                  {user.role === 'supervisor' && user.supervisor_name && (
                    <span className="code-badge">Equipo: {user.supervisor_name}</span>
                  )}
                  {(user.role === 'admin' || user.role === 'gerente') && (
                    <span className="code-badge full-access">Acceso completo</span>
                  )}
                </td>
                <td>
                  <span className={`status-badge ${user.active ? 'active' : 'inactive'}`}>
                    {user.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                  {user.last_login
                    ? new Date(user.last_login.replace(' ', 'T') + 'Z').toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })
                    : '—'}
                </td>
                <td>
                  <button className="btn-small" onClick={() => handleEdit(user)}>Editar</button>
                  <button className="btn-small btn-danger" onClick={() => handleDelete(user.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      <style>{`
        .admin-panel {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: white;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid var(--border-color);
          background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
          color: white;
        }

        .admin-header h2 {
          margin: 0;
          font-size: 20px;
        }

        .admin-actions {
          display: flex;
          gap: 12px;
        }

        .btn-primary {
          padding: 8px 16px;
          background: white;
          color: var(--primary-color);
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }

        .btn-close {
          width: 36px;
          height: 36px;
          border: 1px solid rgba(255,255,255,0.3);
          background: transparent;
          color: white;
          font-size: 24px;
          border-radius: 6px;
          cursor: pointer;
        }

        .admin-error {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 24px;
          background: #fee2e2;
          color: #dc2626;
          border-bottom: 1px solid #fca5a5;
        }

        .admin-error button {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          color: #dc2626;
        }

        .admin-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          font-size: 18px;
          color: var(--text-secondary);
        }

        .users-table-container {
          flex: 1;
          overflow: auto;
          padding: 24px;
        }

        .users-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .users-table th,
        .users-table td {
          padding: 12px 16px;
          text-align: left;
          border-bottom: 1px solid var(--border-color);
        }

        .users-table th {
          background: #f8f9fa;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.5px;
        }

        .users-table tr.inactive {
          opacity: 0.5;
        }

        .role-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
        }

        .badge-admin { background: #fef3c7; color: #92400e; }
        .badge-gerente { background: #dbeafe; color: #1e40af; }
        .badge-supervisor { background: #d1fae5; color: #065f46; }
        .badge-vendedor { background: #f3e8ff; color: #6b21a8; }

        .code-badge {
          display: inline-block;
          padding: 2px 8px;
          background: #f3f4f6;
          border-radius: 4px;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .code-badge.full-access {
          background: #d1fae5;
          color: #065f46;
        }

        .status-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
        }

        .status-badge.active { background: #d1fae5; color: #065f46; }
        .status-badge.inactive { background: #fee2e2; color: #dc2626; }

        .btn-small {
          padding: 4px 10px;
          border: 1px solid var(--border-color);
          background: white;
          border-radius: 4px;
          cursor: pointer;
          margin-right: 6px;
          font-size: 12px;
        }

        .btn-small:hover {
          border-color: var(--primary-color);
          color: var(--primary-color);
        }

        .btn-danger {
          color: #dc2626;
          border-color: #fca5a5;
        }

        .btn-danger:hover {
          background: #fee2e2;
          border-color: #dc2626;
        }

        .admin-form-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1001;
        }

        .admin-form {
          background: white;
          padding: 24px;
          border-radius: 12px;
          width: 100%;
          max-width: 480px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .admin-form h3 {
          margin: 0 0 20px;
          font-size: 18px;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 6px;
          color: var(--text-secondary);
        }

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 14px;
        }

        .form-group small {
          display: block;
          margin-top: 4px;
          font-size: 11px;
          color: var(--text-secondary);
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
        }

        .form-actions button {
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        }

        .form-actions button[type="button"] {
          background: white;
          border: 1px solid var(--border-color);
        }

        .form-actions .btn-primary {
          background: var(--primary-color);
          color: white;
          border: none;
        }

        .admin-tabs {
          display: flex;
          gap: 0;
          border-bottom: 2px solid var(--border-color);
          background: #f8f9fa;
          padding: 0 24px;
        }

        .admin-tab {
          padding: 12px 20px;
          border: none;
          background: none;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -2px;
          transition: all 0.15s;
        }

        .admin-tab.active {
          color: var(--primary-color);
          border-bottom-color: var(--primary-color);
        }

        .admin-tab:hover:not(.active) {
          color: var(--text-primary);
          background: rgba(0,0,0,0.04);
        }

        .config-tab {
          flex: 1;
          overflow-y: auto;
          padding: 32px;
          max-width: 600px;
        }

        .config-loading {
          color: var(--text-secondary);
          padding: 24px 0;
        }

        .config-section {
          margin-bottom: 32px;
        }

        .config-section h3 {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 6px;
          color: var(--text-primary);
        }

        .config-desc {
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0 0 12px;
          line-height: 1.5;
        }

        .config-desc code {
          background: #f3f4f6;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 12px;
        }

        .config-select {
          width: 100%;
          max-width: 400px;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 14px;
          background: white;
        }

        .config-key-row {
          display: flex;
          gap: 8px;
          max-width: 400px;
          margin-bottom: 6px;
        }

        .config-input {
          flex: 1;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 14px;
          font-family: monospace;
        }

        .btn-toggle-key {
          padding: 10px 14px;
          border: 1px solid var(--border-color);
          background: white;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          white-space: nowrap;
        }

        .btn-toggle-key:hover {
          border-color: var(--primary-color);
          color: var(--primary-color);
        }

        .config-section small {
          font-size: 12px;
          color: var(--text-secondary);
          display: block;
        }

        .btn-save-config {
          padding: 12px 28px;
          background: var(--primary-color);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .btn-save-config:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-save-config:not(:disabled):hover {
          opacity: 0.9;
        }

        .config-message {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 24px;
          font-size: 14px;
        }

        .config-message.success {
          background: #d1fae5;
          color: #065f46;
          border: 1px solid #6ee7b7;
        }

        .config-message.error {
          background: #fee2e2;
          color: #dc2626;
          border: 1px solid #fca5a5;
        }

        .config-message button {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          color: inherit;
          opacity: 0.7;
          padding: 0 4px;
        }
      `}</style>
    </div>
  );
}

export default AdminPanel;
