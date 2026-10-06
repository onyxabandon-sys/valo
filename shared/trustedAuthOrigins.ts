export function trustedAuthOrigins(siteUrl?: string, dashboardOrigin?: string) {
  const origins = ['valetpos://'];
  if (siteUrl) {
    const site = new URL(siteUrl);
    origins.push(site.origin, site.hostname);
  }

  const configuredDashboardOrigin = dashboardOrigin?.trim();
  if (configuredDashboardOrigin) {
    let dashboard: URL;
    try {
      dashboard = new URL(configuredDashboardOrigin);
    } catch {
      throw new Error('ADMIN_DASHBOARD_ORIGIN must be a valid HTTP or HTTPS origin.');
    }
    if (
      !['http:', 'https:'].includes(dashboard.protocol) ||
      dashboard.username ||
      dashboard.password ||
      dashboard.pathname !== '/' ||
      dashboard.search ||
      dashboard.hash
    ) {
      throw new Error('ADMIN_DASHBOARD_ORIGIN must contain only an HTTP or HTTPS origin, without a path or credentials.');
    }
    if (dashboard.hostname.includes('*')) {
      throw new Error('ADMIN_DASHBOARD_ORIGIN must be an exact origin; wildcards are not allowed.');
    }
    origins.push(dashboard.origin);
  }

  return Array.from(new Set(origins));
}
