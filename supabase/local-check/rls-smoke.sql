\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

-- Two auth users; the trigger should create profiles for both.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@giganticdesign.com', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'staff@giganticdesign.com', '{}');
update profiles set role = 'admin' where email = 'admin@giganticdesign.com';
select 'profiles auto-created: ' || string_agg(full_name || '=' || role, ', ' order by role) from profiles;

-- Helper to become a user.
create or replace function become(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u::text, false);
$$;

-- ===== ADMIN =====
set role authenticated;
select become('00000000-0000-0000-0000-00000000000a');
select 'admin is_admin(): ' || is_admin();
insert into clients (id, name) values ('10000000-0000-0000-0000-000000000001', 'Acme');
insert into projects (id, client_id, name, hourly_rate) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Website', 150);
insert into tasks (id, name) values ('30000000-0000-0000-0000-000000000001', 'Design');
insert into project_tasks (project_id, task_id, hourly_rate) values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 175);
select 'admin created client+project+task: OK';
insert into time_entries (user_id, project_id, task_id, spent_on, hours) values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', current_date, 2);
select 'admin time entry rate_snapshot (expect 175 from project_task): ' || rate_snapshot from time_entries;

-- ===== STAFF =====
select become('00000000-0000-0000-0000-00000000000b');
select 'staff is_admin(): ' || is_admin();
select 'staff sees clients: ' || count(*) || ', projects: ' || (select count(*) from projects) || ', tasks: ' || (select count(*) from tasks) from clients;

do $$ begin
  insert into clients (name) values ('Evil Corp');
  raise exception 'FAIL: staff inserted a client';
exception when insufficient_privilege then raise notice 'PASS: staff cannot insert client (%)', sqlerrm; end $$;

update clients set name = 'Renamed' where name = 'Acme';
select 'staff update client affected rows (expect 0): ' || (select count(*) from clients where name = 'Renamed');
delete from projects;
select 'staff delete projects, remaining (expect 1): ' || count(*) from projects;

do $$ begin
  update profiles set role = 'admin' where id = auth.uid();
  raise exception 'FAIL: staff promoted self';
exception when raise_exception then raise notice 'PASS: staff cannot change own role (%)', sqlerrm; end $$;
update profiles set full_name = 'Sam Staff' where id = auth.uid();
select 'staff renamed self: ' || full_name from profiles where id = auth.uid();

-- Staff logs time for self; rate falls to project rate (no project_task override on this task? there is one -> 175).
insert into time_entries (user_id, project_id, task_id, spent_on, hours) values (auth.uid(), '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', current_date, 1.5);
do $$ begin
  insert into time_entries (user_id, project_id, task_id, spent_on, hours) values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', current_date, 1);
  raise exception 'FAIL: staff inserted time for another user';
exception when insufficient_privilege then raise notice 'PASS: staff cannot log time for another user'; end $$;

select 'staff sees time_entries (expect 1, own only): ' || count(*) from time_entries;
select 'staff sees time_detail view (expect 1, proves security_invoker): ' || count(*) from time_detail;
select 'staff sees audit_log rows (expect 0): ' || count(*) from audit_log;
select 'staff sees project_budget_status hours_used (expect 1.5, own only): ' || hours_used from project_budget_status;

-- ===== ADMIN again =====
select become('00000000-0000-0000-0000-00000000000a');
select 'admin sees time_entries (expect 2): ' || count(*) from time_entries;
select 'admin sees audit_log rows (expect 2 inserts): ' || count(*) from audit_log;
reset role;

-- Domain restriction on the auth trigger.
do $$ begin
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'outsider@gmail.com');
  raise exception 'FAIL: non-agency email got a profile';
exception when raise_exception then raise notice 'PASS: non-agency email rejected (%)', sqlerrm; end $$;
