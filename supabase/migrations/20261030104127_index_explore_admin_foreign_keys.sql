create index admin_users_granted_by_idx on public.admin_users(granted_by) where granted_by is not null;
create index server_discovery_reviewed_by_idx on public.server_discovery(reviewed_by) where reviewed_by is not null;
create index server_discovery_reports_listing_id_idx on public.server_discovery_reports(listing_id);
create index server_discovery_reports_reporter_id_idx on public.server_discovery_reports(reporter_id);
create index server_discovery_reports_reviewed_by_idx on public.server_discovery_reports(reviewed_by) where reviewed_by is not null;
create index voax_admin_audit_log_admin_id_idx on public.voax_admin_audit_log(admin_id);
