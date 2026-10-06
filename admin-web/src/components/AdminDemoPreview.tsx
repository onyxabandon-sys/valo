'use client';

import { useMemo, useState } from 'react';
import { EntityDialog, type DialogKind, type DialogMode } from './EntityDialog';
import {
  initialDevices,
  initialLocations,
  initialUsers,
  type Device,
  type Location,
  type Operator,
  type Section,
  type Status,
} from '@/data/demoData';

type PreviewDialog = {
  kind: DialogKind;
  mode: DialogMode;
  id?: string;
  record?: Record<string, string | number>;
} | null;

type PreviewRow = {
  id: string;
  kind: DialogKind;
  primary: string;
  secondary: string;
  cells: string[];
  status: Status;
  search: string;
  details: Record<string, string | number>;
  editValues: Record<string, string>;
};

const sections: Section[] = ['Overview', 'Locations', 'Users', 'Devices'];

function StatusBadge({ status }: { status: Status }) {
  const className = status === 'Active' ? 'status-active' : status === 'Pending' ? 'status-pending' : 'status-inactive';
  return <span className={`status ${className}`}>{status}</span>;
}

function deviceLabel(device: Pick<Device, 'name' | 'deviceId'>) {
  return `${device.name} · ${device.deviceId}`;
}

function freshId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function AdminDemoPreview() {
  const [section, setSection] = useState<Section>('Overview');
  const [locations, setLocations] = useState<Location[]>(() => initialLocations.map(location => ({ ...location })));
  const [users, setUsers] = useState<Operator[]>(() => initialUsers.map(user => ({ ...user })));
  const [devices, setDevices] = useState<Device[]>(() => initialDevices.map(device => ({ ...device })));
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<PreviewDialog>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const rows = useMemo<PreviewRow[]>(() => {
    const locationRows: PreviewRow[] = locations.map(location => {
      const assignedUsers = users.filter(user => user.location === location.name).length;
      const assignedDevices = devices.filter(device => device.location === location.name).length;
      const details = {
        Name: location.name,
        Address: location.address,
        'Assigned users': assignedUsers,
        'Assigned devices': assignedDevices,
        Status: location.status,
        'Last activity': location.lastActivity,
      };
      return {
        id: location.id,
        kind: 'location',
        primary: location.name,
        secondary: location.address,
        cells: [String(assignedUsers), String(assignedDevices), location.lastActivity],
        status: location.status,
        search: `${location.name} ${location.address}`.toLowerCase(),
        details,
        editValues: { name: location.name, address: location.address },
      };
    });
    const userRows: PreviewRow[] = users.map(user => ({
      id: user.id,
      kind: 'user',
      primary: user.name,
      secondary: user.email,
      cells: [user.role, user.location, user.device, user.lastActivity],
      status: user.status,
      search: `${user.name} ${user.email} ${user.location} ${user.device}`.toLowerCase(),
      details: {
        Name: user.name,
        Email: user.email,
        Role: user.role,
        Location: user.location,
        Device: user.device,
        Status: user.status,
        'Last activity': user.lastActivity,
      },
      editValues: { name: user.name, email: user.email, location: user.location, device: user.device },
    }));
    const deviceRows: PreviewRow[] = devices.map(device => ({
      id: device.id,
      kind: 'device',
      primary: device.name,
      secondary: device.deviceId,
      cells: [device.user, device.location, device.lastActivity],
      status: device.status,
      search: `${device.name} ${device.deviceId} ${device.user} ${device.location}`.toLowerCase(),
      details: {
        Device: device.name,
        Identifier: device.deviceId,
        User: device.user,
        Location: device.location,
        Status: device.status,
        'Last activity': device.lastActivity,
      },
      editValues: { name: device.name, deviceId: device.deviceId, user: device.user, location: device.location },
    }));

    if (section === 'Locations') return locationRows;
    if (section === 'Users') return userRows;
    if (section === 'Devices') return deviceRows;
    return deviceRows.filter(device => device.status === 'Active');
  }, [devices, locations, section, users]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(row => !term || row.search.includes(term));
  }, [rows, search]);

  const columns = section === 'Locations'
    ? ['Users', 'Devices', 'Last activity']
    : section === 'Users'
      ? ['Role', 'Location', 'Device', 'Last activity']
      : ['Assigned user', 'Location', 'Last activity'];
  const addKind: DialogKind = section === 'Locations' ? 'location' : section === 'Users' ? 'user' : 'device';
  const addLabel = addKind === 'location' ? 'Add location' : addKind === 'user' ? 'Add user' : 'Assign device';

  const openDialog = (row: PreviewRow, mode: DialogMode) => {
    setError('');
    setNotice('');
    setDialog({ kind: row.kind, mode, id: row.id, record: mode === 'details' ? row.details : row.editValues });
  };

  const saveRecord = (values: Record<string, string>) => {
    if (!dialog) return;
    setError('');
    setNotice('');
    try {
      if (!values.name?.trim()) throw new Error('Enter a name before saving.');

      if (dialog.kind === 'location') {
        const previous = locations.find(location => location.id === dialog.id);
        const next: Location = {
          id: previous?.id ?? freshId('location'),
          name: values.name.trim(),
          address: values.address.trim(),
          users: previous?.users ?? 0,
          devices: previous?.devices ?? 0,
          status: previous?.status ?? 'Active',
          lastActivity: previous?.lastActivity ?? 'No activity yet',
        };
        if (locations.some(location => location.id !== previous?.id && location.name.toLowerCase() === next.name.toLowerCase())) {
          throw new Error('A location with this name already exists in the preview.');
        }
        setLocations(current => previous
          ? current.map(location => location.id === previous.id ? next : location)
          : [...current, next]);
        if (previous && previous.name !== next.name) {
          setUsers(current => current.map(user => user.location === previous.name ? { ...user, location: next.name } : user));
          setDevices(current => current.map(device => device.location === previous.name ? { ...device, location: next.name } : device));
        }
      } else if (dialog.kind === 'user') {
        const previous = users.find(user => user.id === dialog.id);
        const email = values.email.trim().toLowerCase();
        if (users.some(user => user.id !== previous?.id && user.email.toLowerCase() === email)) {
          throw new Error('A user with this email already exists in the preview.');
        }
        const next: Operator = {
          id: previous?.id ?? freshId('user'),
          name: values.name.trim(),
          email,
          role: previous?.role ?? 'Operator',
          location: values.location.trim(),
          device: previous?.device ?? 'Unassigned',
          status: previous?.status ?? 'Pending',
          lastActivity: previous?.lastActivity ?? 'Not signed in',
        };
        setUsers(current => previous
          ? current.map(user => user.id === previous.id ? next : user)
          : [...current, next]);
        if (previous) {
          setDevices(current => current.map(device => device.user === previous.name
            ? { ...device, user: next.name, location: next.location }
            : device));
        }
      } else {
        const previous = devices.find(device => device.id === dialog.id);
        const deviceId = values.deviceId.trim();
        if (!deviceId) throw new Error('Enter a device identifier before saving.');
        if (devices.some(device => device.id !== previous?.id && device.deviceId.toLowerCase() === deviceId.toLowerCase())) {
          throw new Error('A device with this identifier already exists in the preview.');
        }
        const next: Device = {
          id: previous?.id ?? freshId('device'),
          name: values.name.trim(),
          deviceId,
          user: values.user.trim() || 'Unassigned',
          location: values.location.trim(),
          status: previous?.status ?? 'Pending',
          lastActivity: previous?.lastActivity ?? 'Not signed in',
        };
        setDevices(current => previous
          ? current.map(device => device.id === previous.id ? next : device)
          : [...current, next]);
        if (previous && previous.user !== next.user) {
          setUsers(current => current.map(user => user.name === previous.user
            ? { ...user, device: 'Unassigned' }
            : user));
        }
        setUsers(current => current.map(user => user.name === next.user
          ? { ...user, device: deviceLabel(next), location: next.location }
          : user));
      }

      setDialog(null);
      setNotice(`${dialog.mode === 'add' ? 'Added' : 'Updated'} ${dialog.kind} in this local preview.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The preview change could not be saved.');
    }
  };

  const deleteOrDeactivateRecord = () => {
    if (!dialog?.id) return;
    if (dialog.kind === 'location') {
      setLocations(current => current.map(location => location.id === dialog.id ? { ...location, status: 'Inactive' } : location));
    } else if (dialog.kind === 'user') {
      const user = users.find(item => item.id === dialog.id);
      setUsers(current => current.filter(item => item.id !== dialog.id));
      if (user) {
        setDevices(current => current.map(device => device.user === user.name
          ? { ...device, status: 'Pending', user: 'Unassigned', lastActivity: 'Not signed in' }
          : device));
      }
    } else {
      const device = devices.find(item => item.id === dialog.id);
      setDevices(current => current.map(item => item.id === dialog.id ? { ...item, status: 'Inactive' } : item));
      if (device) {
        setUsers(current => current.map(user => user.name === device.user
          ? { ...user, device: 'Unassigned' }
          : user));
      }
    }
    setDialog(null);
    setNotice(dialog.kind === 'user'
      ? 'Deleted the user from this local preview and released their device.'
      : `Deactivated ${dialog.kind} in this local preview; the sample record remains available for review.`);
  };

  const resetSamples = () => {
    setLocations(initialLocations.map(location => ({ ...location })));
    setUsers(initialUsers.map(user => ({ ...user })));
    setDevices(initialDevices.map(device => ({ ...device })));
    setSection('Overview');
    setSearch('');
    setDialog(null);
    setError('');
    setNotice('Sample records were reset for this browser preview.');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark demo-brand-mark" aria-hidden="true">V</div><div><div className="brand-title">Valet Operations</div><div className="brand-subtitle">Local dashboard preview</div></div></div>
        <div className="nav-label">Workspace</div>
        <nav className="nav-list" aria-label="Preview navigation">
          {sections.map(item => <button className="nav-button" aria-current={section === item ? 'page' : undefined} key={item} onClick={() => { setSection(item); setSearch(''); setError(''); }}>
            <span className="nav-icon" aria-hidden="true">{item === 'Overview' ? '◫' : item === 'Locations' ? '⌖' : item === 'Users' ? '♙' : '▯'}</span>{item}
          </button>)}
        </nav>
        <div className="sidebar-bottom"><div className="workspace-label">Data mode</div><div className="workspace-name">Browser memory only</div><div className="workspace-state">No Convex reads or writes</div><button className="text-button preview-reset" type="button" onClick={resetSamples}>Reset sample data</button></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumb">Local preview <span aria-hidden="true">/</span> <strong>{section}</strong></div>
          <div className="top-actions"><span className="top-note">Changes reset when this page reloads</span><button className="secondary-button" type="button" onClick={resetSamples}>Reset samples</button></div>
        </header>
        <div className="content">
          <div className="demo-banner" role="status"><span className="demo-mark" aria-hidden="true">i</span><div><strong>Local-only sample data.</strong> This preview starts with example users, locations, and devices. Changes stay in browser memory and never reach Convex.</div></div>
          <div className="page-heading">
            <div><div className="eyebrow">Valet POS · Preview</div><h1>{section === 'Overview' ? 'Operations overview' : section}</h1><p className="page-description">Exercise record details, edits, and safe deactivation with sample data.</p></div>
            <button className="primary-button" type="button" onClick={() => { setError(''); setNotice(''); setDialog({ kind: addKind, mode: 'add' }); }}>{addLabel}</button>
          </div>

          <section className="stat-grid" aria-label="Sample record counts">
            <div className="stat-card"><div className="stat-label">Locations</div><div className="stat-value">{locations.length}<span className="stat-hint">records</span></div><div className="stat-hint">Sample places</div></div>
            <div className="stat-card"><div className="stat-label">Users</div><div className="stat-value">{users.length}<span className="stat-hint">records</span></div><div className="stat-hint">Active and pending examples</div></div>
            <div className="stat-card"><div className="stat-label">Active devices</div><div className="stat-value">{devices.filter(device => device.status === 'Active').length}<span className="stat-hint">records</span></div><div className="stat-hint">Assignments in this preview</div></div>
            <div className="stat-card"><div className="stat-label">All devices</div><div className="stat-value">{devices.length}<span className="stat-hint">records</span></div><div className="stat-hint">Includes inactive samples</div></div>
          </section>

          {notice ? <div className="notice" role="status">{notice}</div> : null}
          {error ? <div className="form-error page-error" role="alert">{error}</div> : null}
          <div className="section-heading"><div><h2>{section === 'Overview' ? 'Active device assignments' : `All ${section.toLowerCase()}`}</h2><p>Use each row’s actions to open details, edit, remove a user, or deactivate a location or device.</p></div></div>
          <div className="table-panel">
            <div className="table-toolbar">
              <span className="result-count">{filteredRows.length} {section === 'Overview' ? 'active assignments' : section.toLowerCase()}</span>
              <label className="search-box"><span aria-hidden="true">⌕</span><input aria-label={`Search ${section.toLowerCase()}`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search records" /></label>
            </div>
            <div className="table-scroll">
          {filteredRows.length ? <table><thead><tr><th>Record</th>{columns.map(column => <th key={column}>{column}</th>)}<th>State</th><th>Actions</th></tr></thead><tbody>
                {filteredRows.map(row => {
                  const canManage = row.kind !== 'user' || users.find(user => user.id === row.id)?.role === 'Operator';
                  return <tr key={row.id}>
                  <td><div className="primary-cell">{row.primary}</div><div className="secondary-cell">{row.secondary}</div></td>
                  {row.cells.map((cell, index) => <td key={`${row.id}-${index}`}>{cell}</td>)}
                  <td><StatusBadge status={row.status} /></td>
                  <td><div className="row-actions"><button className="row-action" type="button" onClick={() => openDialog(row, 'details')}>Details</button>{canManage ? <><button className="row-action" type="button" onClick={() => openDialog(row, 'edit')}>Edit</button><button className="row-action danger-link" type="button" onClick={() => openDialog(row, 'delete')}>{row.kind === 'user' ? 'Delete' : 'Deactivate'}</button></> : null}</div></td>
                </tr>;
                })}
              </tbody></table> : <div className="empty-state">No sample records match this search.</div>}
            </div>
          </div>
        </div>
      </main>

      {dialog ? <EntityDialog
        key={`${dialog.kind}-${dialog.mode}-${dialog.id ?? 'new'}`}
        kind={dialog.kind}
        mode={dialog.mode}
        record={dialog.record}
        onClose={() => setDialog(null)}
        onSave={saveRecord}
        onDelete={deleteOrDeactivateRecord}
      /> : null}
    </div>
  );
}
