'use client';

import { FormEvent, ReactNode, useMemo, useState } from 'react';
import Image from 'next/image';
import { useAction, useConvexAuth, useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { AdminAuthPanel } from './AdminAuthPanel';
import { AdminMfaSetup } from './AdminMfaSetup';
import { authClient } from '@/lib/auth-client';

type Section = 'Overview' | 'Locations' | 'Users' | 'Devices' | 'Audit';
type AdminDashboardData = FunctionReturnType<typeof api.admin.getDashboard>;
type DialogKind = 'location' | 'user' | 'device';
type DialogMode = 'details' | 'add' | 'edit';
type DialogState = { kind: DialogKind; mode: DialogMode; id?: string; record?: Record<string, string> } | null;
type TableRow = {
  id: string;
  kind: DialogKind;
  primary: string;
  secondary: string;
  cells: string[];
  status?: string;
  search: string;
  details: Record<string, string>;
};

const sections: Section[] = ['Overview', 'Locations', 'Users', 'Devices', 'Audit'];

function mergeById<T extends { id: string }>(baseRows: readonly T[], pageRows: readonly T[]) {
  const rows = new Map<string, T>();
  for (const row of baseRows) rows.set(row.id, row);
  for (const row of pageRows) rows.set(row.id, row);
  return [...rows.values()];
}

function Icon({ name, size = 17 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    grid: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
    pin: 'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z M12 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    users: 'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M20 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    device: 'M5 3h14v18H5z M10 18h4',
    audit: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
    search: 'm20 20-4.5-4.5 M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z',
    plus: 'M12 5v14 M5 12h14',
    shield: 'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z M9 12l2 2 4-4',
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] ?? paths.grid} /></svg>;
}

function BrandMark() {
  return <div className="brand-mark"><Image src="/icon.svg" width={32} height={32} alt="" /></div>;
}

function formatTime(timestamp: number | null) {
  return timestamp === null ? 'No location saved' : new Date(timestamp).toLocaleString();
}

function formatCoordinates(latitude: number | null, longitude: number | null, accuracy: number | null) {
  if (latitude === null || longitude === null) return 'No location saved';
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}${accuracy === null ? '' : ` · ±${Math.round(accuracy)} m`}`;
}

function StatusBadge({ status }: { status: string }) {
  const className = status === 'active' ? 'status-active' : status === 'pending' ? 'status-pending' : 'status-inactive';
  const label = status === 'active' ? 'Active' : status === 'pending' ? 'Pending' : 'Revoked';
  return <span className={`status ${className}`}>{label}</span>;
}

function StatCard({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return <div className="stat-card"><div className="stat-label">{label}</div><div className="stat-value">{value}<span className="stat-hint">records</span></div><div className="stat-hint">{hint}</div></div>;
}

function LoadingPanel({ message }: { message: string }) {
  return <main className="auth-wrap"><div className="auth-card" role="status"><BrandMark /><p>{message}</p></div></main>;
}

export function AdminDashboard() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const session = authClient.useSession();
  const adminStatus = useQuery(api.admin.getMyAdminStatus, isAuthenticated ? {} : 'skip');
  const canLoadDashboard = Boolean(isAuthenticated && adminStatus?.isAdmin && adminStatus.isActive && adminStatus.twoFactorEnabled);
  const data = useQuery(api.admin.getDashboard, canLoadDashboard ? {} : 'skip');
  const createAttendant = useAction(api.admin.createAttendant);
  const deleteAttendant = useAction(api.admin.deleteAttendant);
  const setAttendantPassword = useAction(api.admin.setAttendantPassword);
  const updateAttendant = useMutation(api.admin.updateAttendant);
  const setAttendantActive = useMutation(api.admin.setAttendantActive);
  const assignDevice = useMutation(api.admin.assignDevice);
  const revokeDevice = useMutation(api.admin.revokeDevice);
  const releaseDevice = useMutation(api.admin.releaseDevice);
  const createLocation = useMutation(api.admin.createLocation);
  const updateLocation = useMutation(api.admin.updateLocation);

  const [section, setSection] = useState<Section>('Overview');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const locationPages = usePaginatedQuery(
    api.admin.listDashboardLocations,
    canLoadDashboard && (section === 'Locations' || dialog?.kind === 'user') ? {} : 'skip',
    { initialNumItems: 100 },
  );
  const userPages = usePaginatedQuery(
    api.admin.listDashboardUsers,
    canLoadDashboard && (section === 'Users' || dialog?.kind === 'user' || (section === 'Devices' && dialog?.kind === 'device')) ? {} : 'skip',
    { initialNumItems: 100 },
  );
  const devicePages = usePaginatedQuery(
    api.admin.listDashboardDevices,
    canLoadDashboard && (section === 'Overview' || section === 'Devices') ? {} : 'skip',
    { initialNumItems: 100 },
  );
  const auditPages = usePaginatedQuery(
    api.admin.listDashboardAudit,
    canLoadDashboard && section === 'Audit' ? {} : 'skip',
    { initialNumItems: 100 },
  );
  const allLocations = useMemo(() => mergeById(data?.locations ?? [], locationPages.results), [data?.locations, locationPages.results]);
  const allUsers = useMemo(() => mergeById(data?.users ?? [], userPages.results), [data?.users, userPages.results]);
  const allDevices = useMemo(() => mergeById(data?.devices ?? [], devicePages.results), [data?.devices, devicePages.results]);
  const allAudit = useMemo(() => mergeById(data?.audit ?? [], auditPages.results), [data?.audit, auditPages.results]);

  const rows: TableRow[] = useMemo(() => {
    if (!data) return [];
    const locations = new Map(allLocations.map(location => [location.id, location.name]));
    const assignmentsByUser = new Map(allDevices.map(device => [device.userId, device]));
    const locationRows: TableRow[] = allLocations.map(location => ({
      id: location.id,
      kind: 'location',
      primary: location.name,
      secondary: location.organizationName ?? 'Organization not set',
      cells: [location.organizationCode ?? '—', location.address ?? 'No address'],
      search: `${location.name} ${location.organizationName ?? ''} ${location.organizationCode ?? ''} ${location.address ?? ''}`.toLowerCase(),
      details: {
        Name: location.name,
        Organization: location.organizationName ?? '—',
        'Organization code': location.organizationCode ?? '—',
        Address: location.address ?? '—',
      },
    }));
    const userRows: TableRow[] = allUsers.map(user => {
      const device = assignmentsByUser.get(user.id);
      const deviceId = device?.deviceId ?? user.deviceId;
      const deviceStatus = device?.status ?? user.deviceStatus;
      return {
        id: user.id,
        kind: 'user',
        primary: user.name,
        secondary: user.email,
        cells: [user.role === 'admin' ? 'Administrator' : 'Attendant', user.locationName ?? 'No location', user.phoneNumber ?? 'No WhatsApp number', deviceId ?? 'Unassigned'],
        status: user.isActive ? 'active' : 'revoked',
        search: `${user.name} ${user.email} ${user.locationName ?? ''} ${user.phoneNumber ?? ''} ${deviceId ?? ''}`.toLowerCase(),
        details: {
          Name: user.name,
          Email: user.email,
          Role: user.role,
          'WhatsApp number': user.phoneNumber ?? '—',
          Location: user.locationName ?? '—',
          'Device assignment': deviceId ?? 'Unassigned',
          'Device state': deviceStatus ?? 'Not assigned',
          'Created at': new Date(user.createdAt).toLocaleString(),
        },
      };
    });
    const deviceRows: TableRow[] = allDevices.map(device => ({
      id: device.id,
      kind: 'device',
      primary: device.deviceId,
      secondary: device.userName,
      cells: [device.userEmail, device.locationName ?? locations.get(device.locationId) ?? 'Unknown location', formatCoordinates(device.latitude, device.longitude, device.accuracy), formatTime(device.capturedAt)],
      status: device.status,
      search: `${device.deviceId} ${device.userName} ${device.userEmail} ${device.locationName ?? locations.get(device.locationId) ?? ''}`.toLowerCase(),
      details: {
        Device: device.deviceId,
        User: device.userName,
        Email: device.userEmail,
        Location: device.locationName ?? locations.get(device.locationId) ?? 'Unknown location',
        State: device.status,
        'Last captured location': formatCoordinates(device.latitude, device.longitude, device.accuracy),
        'Location captured at': formatTime(device.capturedAt),
        'Assignment updated': new Date(device.updatedAt).toLocaleString(),
      },
    }));
    if (section === 'Locations') return locationRows;
    if (section === 'Users') return userRows;
    if (section === 'Devices') return deviceRows;
    if (section === 'Audit') return allAudit.map(entry => ({
      id: entry.id,
      kind: 'user',
      primary: entry.action.replaceAll('_', ' '),
      secondary: `${entry.actorName} · ${new Date(entry.changedAt).toLocaleString()}`,
      cells: [entry.entityType, entry.entityId, entry.summary],
      search: `${entry.actorName} ${entry.action} ${entry.entityType} ${entry.entityId} ${entry.summary}`.toLowerCase(),
      details: { Actor: entry.actorName, Action: entry.action, Type: entry.entityType, ID: entry.entityId, Summary: entry.summary, Time: new Date(entry.changedAt).toLocaleString() },
    }));
    return deviceRows.filter(device => device.status === 'active');
  }, [data, section, allAudit, allDevices, allLocations, allUsers]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(row => !term || row.search.includes(term));
  }, [rows, search]);

  const pageStatus = section === 'Locations'
    ? locationPages.status
    : section === 'Users'
      ? userPages.status
      : section === 'Audit'
        ? auditPages.status
        : devicePages.status;
  const loadMore = section === 'Locations'
    ? () => locationPages.loadMore(100)
    : section === 'Users'
      ? () => userPages.loadMore(100)
      : section === 'Audit'
        ? () => auditPages.loadMore(100)
        : () => devicePages.loadMore(100);
  const hasMoreSectionRows = pageStatus === 'CanLoadMore' || pageStatus === 'LoadingMore' || pageStatus === 'LoadingFirstPage';
  const locationsFullyLoaded = (section === 'Locations' || dialog?.kind === 'user') && locationPages.status === 'Exhausted';
  const usersFullyLoaded = (section === 'Users' || dialog?.kind === 'user' || (section === 'Devices' && dialog?.kind === 'device')) && userPages.status === 'Exhausted';
  const devicesFullyLoaded = (section === 'Overview' || section === 'Devices') && devicePages.status === 'Exhausted';
  const locationsCount = locationsFullyLoaded
    ? `${allLocations.length}`
    : data?.hasMoreLocations ? `${Math.max(data.counts.locations, allLocations.length)}+` : `${data?.counts.locations ?? 0}`;
  const usersCount = usersFullyLoaded
    ? `${allUsers.length}`
    : data?.hasMoreUsers ? `${Math.max(data.counts.users, allUsers.length)}+` : `${data?.counts.users ?? 0}`;
  const attendantsCount = usersFullyLoaded
    ? `${allUsers.filter(user => user.role === 'attendant').length}`
    : data?.hasMoreAttendants ? '200+' : `${data?.counts.attendants ?? 0}`;
  const activeDevicesCount = devicesFullyLoaded
    ? `${allDevices.filter(device => device.status === 'active').length}`
    : data?.hasMoreActiveDevices ? '200+' : `${data?.counts.activeDevices ?? 0}`;

  const addKind: DialogKind = section === 'Locations' ? 'location' : section === 'Devices' ? 'device' : 'user';
  const addLabel = addKind === 'location' ? 'Add location' : addKind === 'device' ? 'Assign device' : 'Add attendant';

  if (isLoading || (isAuthenticated && adminStatus === undefined)) return <LoadingPanel message="Checking secure administrator access…" />;
  if (!isAuthenticated) return <AdminAuthPanel />;
  if (!adminStatus) return <LoadingPanel message="Checking secure administrator access…" />;
  if (adminStatus?.isAdmin && !adminStatus.isActive) {
    return <GatePanel title="Administrator disabled" message="This administrator account is disabled. Contact the production owner." onSignOut={() => void authClient.signOut()} />;
  }
  if (!adminStatus.isAdmin) return <GatePanel title="Administrator access required" message="This account was not created as an administrator. Ask the system owner to provision the correct account." onSignOut={() => void authClient.signOut()} />;
  if (!adminStatus.twoFactorEnabled) return <AdminMfaSetup />;
  if (!data) return <LoadingPanel message="Loading protected operations data…" />;

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(successMessage);
      setDialog(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The change could not be saved. Try again.');
    }
  };

  const openDialog = (kind: DialogKind, mode: DialogMode, id?: string, record?: Record<string, string>) => {
    setError('');
    setNotice('');
    setDialog({ kind, mode, id, record });
  };

  const openDetails = (row: TableRow) => openDialog(row.kind, 'details', row.id, row.details);

  const openEdit = (row: TableRow) => {
    if (row.kind === 'location') {
      const location = allLocations.find(item => item.id === row.id);
      if (location) openDialog('location', 'edit', row.id, { name: location.name, organizationName: location.organizationName ?? '', address: location.address ?? '' });
    } else if (row.kind === 'user') {
      const user = allUsers.find(item => item.id === row.id);
      if (user && user.role === 'attendant') openDialog('user', 'edit', row.id, { name: user.name, phoneNumber: user.phoneNumber ?? '', locationId: user.locationId ?? '' });
    }
  };

  const saveDialog = async (values: Record<string, string>) => {
    if (!dialog) return;
    setFormBusy(true);
    try {
      if (dialog.kind === 'location') {
        if (dialog.mode === 'add') {
          await runAction(() => createLocation({ name: values.name, organizationName: values.organizationName, organizationCode: values.organizationCode, address: values.address ?? '' }), 'Location created.');
        } else if (dialog.id) {
          const location = allLocations.find(item => item.id === dialog.id);
          if (!location) throw new Error('Location was not found. Refresh the dashboard and try again.');
          await runAction(() => updateLocation({ locationId: location.id, name: values.name, organizationName: values.organizationName, address: values.address ?? '' }), 'Location updated.');
        }
      } else if (dialog.kind === 'user') {
        const location = allLocations.find(item => item.id === values.locationId);
        if (!location) throw new Error('Choose an existing location.');
        if (dialog.mode === 'add') {
          if (values.password !== values.passwordConfirm) throw new Error('The passwords do not match.');
          await runAction(() => createAttendant({ name: values.name, email: values.email, password: values.password, phoneNumber: values.phoneNumber, locationId: location.id }), 'Attendant login and active profile created. Give the password to the attendant privately; it cannot be viewed again.');
        } else if (dialog.id) {
          const user = allUsers.find(item => item.id === dialog.id && item.role === 'attendant');
          if (!user) throw new Error('Attendant was not found. Refresh the dashboard and try again.');
          const password = values.password ?? '';
          const passwordConfirm = values.passwordConfirm ?? '';
          if ((password || passwordConfirm) && password !== passwordConfirm) throw new Error('The new passwords do not match.');
          await runAction(async () => {
            await updateAttendant({ userId: user.id, name: values.name, phoneNumber: values.phoneNumber, locationId: location.id });
            if (password) {
              try {
                await setAttendantPassword({ userId: user.id, password });
              } catch (passwordError) {
                const detail = passwordError instanceof Error ? passwordError.message : 'the password could not be changed';
                throw new Error(`Profile saved, but ${detail}`);
              }
            }
          }, password ? 'Attendant profile and password updated. A location change requires fresh sign-in approval.' : 'Attendant profile updated. A location change requires fresh sign-in approval.');
        }
      } else {
        const user = allUsers.find(item => item.id === values.userId && item.role === 'attendant');
        if (!user) throw new Error('Choose an existing attendant.');
        await runAction(() => assignDevice({ userId: user.id, deviceId: values.deviceId }), 'Device assignment saved. The attendant must approve it and capture a new location.');
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The change could not be saved.');
    } finally {
      setFormBusy(false);
    }
  };

  const actionRow = async (row: TableRow, action: 'disable' | 'enable' | 'delete' | 'release' | 'revoke') => {
    if (action === 'disable' || action === 'enable') {
      const user = allUsers.find(item => item.id === row.id && item.role === 'attendant');
      if (!user) return;
      const intent = action === 'disable' ? 'Disable sign-in and revoke this attendant’s device and sessions?' : 'Enable this attendant’s sign-in?';
      if (!window.confirm(intent)) return;
      await runAction(() => setAttendantActive({ userId: user.id, isActive: action === 'enable' }), action === 'disable' ? 'Sign-in disabled. Receipt history remains available to administrators.' : 'Sign-in enabled. Fresh device approval and location capture are required.');
    } else if (action === 'delete') {
      const user = allUsers.find(item => item.id === row.id && item.role === 'attendant');
      if (!user) return;
      if (!window.confirm(`Permanently remove ${user.name}'s sign-in and attendant profile? This revokes sessions and the device, erases exact GPS history, and preserves receipts, tickets, and report snapshots with the attendant's identity removed.`)) return;
      await runAction(async () => {
        const result = await deleteAttendant({ userId: user.id });
        if (result.cleanupPending) {
          throw new Error('Sign-in is blocked and the device is released. Some history is still being anonymized; select Delete again to continue.');
        }
        return result;
      }, 'Attendant account removed. Receipts, tickets, and report snapshots remain with personal identity and exact GPS removed.');
    } else {
      const device = allDevices.find(item => item.id === row.id);
      if (!device) return;
      if (action === 'release') {
        if (!window.confirm(`Release the device binding for ${device.userName}? Their current sessions will be revoked, and the attendant must complete fresh approval on the replacement device.`)) return;
        await runAction(() => releaseDevice({ userId: device.userId }), 'Device released. The attendant can now request approval on one replacement device.');
        return;
      }
      if (!window.confirm(`Revoke the device assignment for ${device.userName}? The account must be assigned again before it can sign in.`)) return;
      await runAction(() => revokeDevice({ userId: device.userId }), 'Device assignment revoked.');
    }
  };

  const filteredRows = visibleRows;
  const columns = section === 'Locations'
    ? ['Organization code', 'Address']
    : section === 'Users'
      ? ['Role', 'Location', 'WhatsApp', 'Device']
      : section === 'Devices'
        ? ['Account', 'Location', 'Last saved location', 'Captured']
        : section === 'Audit'
          ? ['Record type', 'Record ID', 'Change']
          : ['Assigned user', 'Location', 'Last saved location', 'Captured'];
  const sectionTitle = section === 'Overview' ? 'Active device assignments' : section === 'Audit' ? 'Administrator audit log' : `All ${section.toLowerCase()}`;
  const sectionDescription = section === 'Audit'
    ? 'Sensitive changes include the administrator and server timestamp.'
    : 'Every management action is checked and recorded on the server.';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><BrandMark /><div><div className="brand-title">Valet Operations</div><div className="brand-subtitle">Protected workspace</div></div></div>
        <div className="nav-label">Workspace</div>
        <nav className="nav-list" aria-label="Main navigation">
          {sections.map(item => <button className="nav-button" aria-label={item} aria-current={section === item ? 'page' : undefined} key={item} onClick={() => { setSection(item); setSearch(''); setError(''); }}>
            <span className="nav-icon"><Icon name={item === 'Overview' ? 'grid' : item === 'Locations' ? 'pin' : item === 'Users' ? 'users' : item === 'Devices' ? 'device' : 'audit'} size={16} /></span>{item}
          </button>)}
        </nav>
        <div className="sidebar-bottom"><div className="workspace-label">Connection</div><div className="workspace-name">Convex operations data</div><div className="workspace-state">● Protected by server authorization</div></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumb">Operations <span aria-hidden="true">/</span> <strong>{section}</strong></div>
          <div className="top-actions"><span className="top-note">{session.data?.user?.email ?? 'Administrator'}</span><button className="secondary-button" type="button" onClick={() => void authClient.signOut()}>Sign out</button></div>
        </header>
        <div className="content">
          <div className="live-banner" role="status"><span className="live-dot" />Live Convex data · admin access and MFA are checked by each server function.</div>
          <div className="page-heading">
            <div><div className="eyebrow">Valet POS · Administration</div><h1>{section === 'Overview' ? 'Operations overview' : section}</h1><p className="page-description">Review assigned locations, attendant access, and device location records.</p></div>
            {section !== 'Audit' ? <button className="primary-button" onClick={() => openDialog(addKind, 'add')}><Icon name="plus" size={15} />{addLabel}</button> : null}
          </div>

          <section className="stat-grid" aria-label="Workspace counts">
            <StatCard label="Locations" value={locationsCount} hint={data.hasMoreLocations && !locationsFullyLoaded ? `Loaded ${allLocations.length}; more available` : 'All locations shown'} />
            <StatCard label="Attendants" value={attendantsCount} hint={data.hasMoreAttendants && !usersFullyLoaded ? '200+ · load all users for exact count' : 'All attendants shown'} />
            <StatCard label="Active devices" value={activeDevicesCount} hint={data.hasMoreActiveDevices && !devicesFullyLoaded ? '200+ · load all devices for exact count' : 'All active assignments shown'} />
            <StatCard label="Users" value={usersCount} hint={data.hasMoreUsers && !usersFullyLoaded ? `Loaded ${allUsers.length}; more available` : 'All accounts shown'} />
          </section>

          {notice ? <div className="notice" role="status">{notice}</div> : null}
          {error ? <div className="form-error page-error" role="alert">{error}</div> : null}
          <div className="section-heading"><div><h2>{sectionTitle}</h2><p>{sectionDescription}</p></div>{section === 'Overview' ? <button className="secondary-button" onClick={() => setSection('Devices')}>View all devices</button> : null}</div>
          <div className="table-panel">
            <div className="table-toolbar">
              <span className="result-count">{filteredRows.length}{hasMoreSectionRows ? '+' : ''} {section === 'Overview' ? 'active assignments' : section.toLowerCase()}</span>
              <label className="search-box"><Icon name="search" size={14} /><input aria-label={`Search ${section.toLowerCase()}`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search records" /></label>
            </div>
            <div className="table-scroll">
              {filteredRows.length ? <table><thead><tr><th>Record</th>{columns.map(column => <th key={column}>{column}</th>)}{section !== 'Audit' ? <th>State</th> : null}<th>Actions</th></tr></thead><tbody>
                {filteredRows.map(row => <tr key={row.id}>
                  <td><div className="primary-cell">{row.primary}</div><div className="secondary-cell">{row.secondary}</div></td>
                  {row.cells.map((cell, index) => <td key={`${row.id}-${index}`}>{cell}</td>)}
                  {section !== 'Audit' ? <td>{row.status ? <StatusBadge status={row.status} /> : '—'}</td> : null}
                  <td><div className="row-actions"><button className="row-action" onClick={() => openDetails(row)}>Details</button>{row.kind !== 'device' && section !== 'Audit' ? <button className="row-action" onClick={() => openEdit(row)}>Edit</button> : null}
                    {row.kind === 'user' && section === 'Users' && allUsers.find(user => user.id === row.id)?.role === 'attendant' ? <>
                      {allUsers.find(user => user.id === row.id)?.isActive
                        ? <button className="row-action" onClick={() => void actionRow(row, 'disable')}>Disable</button>
                        : <button className="row-action" onClick={() => void actionRow(row, 'enable')}>Enable</button>}
                      <button className="row-action danger-link" onClick={() => void actionRow(row, 'delete')}>Delete</button>
                    </> : null}
                    {row.kind === 'device' && row.status !== 'revoked' ? <>
                      <button className="row-action" onClick={() => void actionRow(row, 'release')}>Release</button>
                      <button className="row-action danger-link" onClick={() => void actionRow(row, 'revoke')}>Revoke</button>
                    </> : null}
                  </div></td>
                </tr>)}
              </tbody></table> : <div className="empty-state">No records match this search.</div>}
            </div>
            {hasMoreSectionRows ? <div className="pagination-row">
              <p className="stat-hint">Search includes the records loaded so far. Load more records to search older entries.</p>
              <button className="secondary-button" type="button" disabled={pageStatus !== 'CanLoadMore'} onClick={loadMore}>{pageStatus === 'LoadingFirstPage' || pageStatus === 'LoadingMore' ? 'Loading…' : 'Load more records'}</button>
            </div> : null}
          </div>
        </div>
      </main>

      {dialog ? <RecordDialog
        key={`${dialog.kind}-${dialog.mode}-${dialog.id ?? 'new'}`}
        dialog={dialog}
        locations={allLocations}
        users={allUsers.filter(user => user.role === 'attendant' && user.isActive)}
        locationsCanLoadMore={locationPages.status === 'CanLoadMore'}
        locationsLoading={locationPages.status === 'LoadingMore' || locationPages.status === 'LoadingFirstPage'}
        usersCanLoadMore={userPages.status === 'CanLoadMore'}
        usersLoading={userPages.status === 'LoadingMore' || userPages.status === 'LoadingFirstPage'}
        onLoadMoreLocations={() => locationPages.loadMore(100)}
        onLoadMoreUsers={() => userPages.loadMore(100)}
        busy={formBusy}
        onClose={() => setDialog(null)}
        onSave={values => void saveDialog(values)}
      /> : null}
    </div>
  );
}

function GatePanel({ title, message, onSignOut }: { title: string; message: string; onSignOut: () => void }) {
  return <main className="auth-wrap"><section className="auth-card"><div className="eyebrow">Valet POS · Operations</div><h1>{title}</h1><p className="page-description auth-copy">{message}</p><button className="secondary-button" onClick={onSignOut}>Sign out</button></section></main>;
}

function RecordDialog({
  dialog,
  locations,
  users,
  locationsCanLoadMore,
  locationsLoading,
  usersCanLoadMore,
  usersLoading,
  onLoadMoreLocations,
  onLoadMoreUsers,
  busy,
  onClose,
  onSave,
}: {
  dialog: Exclude<DialogState, null>;
  locations: AdminDashboardData['locations'];
  users: AdminDashboardData['users'];
  locationsCanLoadMore: boolean;
  locationsLoading: boolean;
  usersCanLoadMore: boolean;
  usersLoading: boolean;
  onLoadMoreLocations: () => void;
  onLoadMoreUsers: () => void;
  busy: boolean;
  onClose: () => void;
  onSave: (values: Record<string, string>) => void;
}) {
  const isDetails = dialog.mode === 'details';
  const loginLocations = usePaginatedQuery(
    api.admin.listAttendantLoginLocations,
    dialog.kind === 'user' && isDetails && dialog.id ? { userId: dialog.id as Id<'users'> } : 'skip',
    { initialNumItems: 20 },
  );
  const title = isDetails ? 'Record details' : dialog.kind === 'location' ? `${dialog.mode === 'add' ? 'Add' : 'Edit'} location` : dialog.kind === 'device' ? 'Assign device' : `${dialog.mode === 'add' ? 'Add' : 'Edit'} attendant`;
  const initial = dialog.record ?? {};
  const [values, setValues] = useState<Record<string, string>>(initial);
  const change = (name: string, value: string) => setValues(current => ({ ...current, [name]: value }));
  const field = (name: string, label: string, type = 'text', required = true) => (
    <label className="field" key={name}><span>{label}</span><input name={name} type={type} value={values[name] ?? ''} onChange={event => change(name, event.target.value)} required={required} minLength={type === 'password' ? 8 : undefined} maxLength={name === 'email' ? 254 : type === 'password' ? 128 : 240} autoComplete={name === 'password' ? 'new-password' : undefined} /></label>
  );
  const select = (name: string, label: string, options: { id: string; label: string }[]) => (
    <label className="field" key={name}><span>{label}</span><select name={name} value={values[name] ?? ''} onChange={event => change(name, event.target.value)} required><option value="" disabled>Choose an option</option>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
  );
  const fields: ReactNode[] = dialog.kind === 'location'
    ? [field('name', 'Location name'), field('organizationName', 'Organization name'), ...(dialog.mode === 'add' ? [field('organizationCode', 'Organization code')] : []), field('address', 'Address', 'text', false)]
    : dialog.kind === 'user'
      ? [field('name', 'Attendant name'), ...(dialog.mode === 'add' ? [field('email', 'Work email', 'email'), field('password', 'Initial password', 'password'), field('passwordConfirm', 'Confirm initial password', 'password')] : [field('password', 'Set a new password (optional)', 'password', false), field('passwordConfirm', 'Confirm new password', 'password', false)]), field('phoneNumber', 'WhatsApp number in international format'), select('locationId', 'Assigned location', locations.map(location => ({ id: location.id, label: location.name })))]
      : [select('userId', 'Attendant', users.map(user => ({ id: user.id, label: `${user.name} · ${user.email}` }))), field('deviceId', 'Device identifier')];

  return (
    <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog" aria-modal="true" aria-labelledby="record-dialog-title" role="dialog">
        <div className="dialog-head"><div><h2 id="record-dialog-title">{title}</h2><p>{isDetails ? 'Precise location is visible only to authorized administrators.' : 'The server validates every field and records the change.'}</p></div><button className="icon-button" onClick={onClose} aria-label="Close dialog">×</button></div>
        {isDetails ? <>
          <div className="detail-grid">{Object.entries(initial).map(([key, value]) => <div className="detail-item" key={key}><div className="detail-label">{key}</div><div className="detail-value">{value}</div></div>)}</div>
          {dialog.kind === 'user' ? <section className="table-panel" aria-labelledby="login-location-title">
            <div className="section-heading"><div><h3 id="login-location-title">Successful login locations</h3><p>Each approved login saves a fresh foreground GPS fix. Exact coordinates are visible to administrators.</p></div></div>
            {loginLocations.results.length ? <div className="table-scroll"><table><thead><tr><th>Location</th><th>Coordinates</th><th>Accuracy</th><th>Captured</th><th>Signed in</th><th>Device</th></tr></thead><tbody>
              {loginLocations.results.map(entry => <tr key={entry.id}><td>{entry.locationName ?? 'Unknown location'}</td><td>{formatCoordinates(entry.latitude, entry.longitude, entry.accuracy)}</td><td>±{Math.round(entry.accuracy)} m</td><td>{formatTime(entry.capturedAt)}</td><td>{formatTime(entry.loggedInAt)}</td><td>{entry.deviceId}</td></tr>)}
            </tbody></table></div> : <p className="empty-state">{loginLocations.status === 'LoadingFirstPage' ? 'Loading login locations…' : 'No successful login locations have been saved.'}</p>}
            {loginLocations.status === 'CanLoadMore' ? <div className="pagination-row"><button className="secondary-button" type="button" onClick={() => loginLocations.loadMore(20)}>Load earlier logins</button></div> : null}
          </section> : null}
          <div className="dialog-footer"><button className="secondary-button" onClick={onClose}>Close</button></div>
        </> : <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const formData = new FormData(form); onSave(Object.fromEntries(Array.from(formData.entries()).map(([name, value]) => [name, name.toLowerCase().includes('password') ? String(value) : String(value).trim()]))); }}>
          <div className="form-stack">
            {fields}
            {dialog.kind === 'user' && locationsCanLoadMore ? <button className="secondary-button" type="button" disabled={locationsLoading} onClick={onLoadMoreLocations}>{locationsLoading ? 'Loading locations…' : 'Load more locations'}</button> : null}
            {dialog.kind === 'device' && usersCanLoadMore ? <button className="secondary-button" type="button" disabled={usersLoading} onClick={onLoadMoreUsers}>{usersLoading ? 'Loading attendants…' : 'Load more attendants'}</button> : null}
          </div>
          <div className="dialog-footer"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : dialog.mode === 'add' ? 'Create' : 'Save'}</button></div>
        </form>}
      </section>
    </div>
  );
}
