-- Owner-only portfolio administration. No usernames, passwords or service keys belong here.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.portfolio_admin_account (
 singleton boolean primary key default true check (singleton),
 user_id uuid not null unique references auth.users(id) on delete restrict,
 username_hash text unique,
 username_salt text not null,
 configured_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.portfolio_admin_account enable row level security;
revoke all on public.portfolio_admin_account from public, anon, authenticated;
grant all on public.portfolio_admin_account to service_role;

create function private.is_portfolio_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null
 and (select auth.jwt()->>'aal') = 'aal2'
 and exists (select 1 from public.portfolio_admin_account a where a.singleton and a.user_id=auth.uid());
$$;
revoke all on function private.is_portfolio_admin() from public,anon;
grant execute on function private.is_portfolio_admin() to authenticated;

create table public.portfolio_content (
 singleton boolean primary key default true check (singleton),
 value jsonb not null check (jsonb_typeof(value)='object'),
 updated_at timestamptz not null default now()
);
alter table public.portfolio_content enable row level security;
revoke all on public.portfolio_content from public,anon,authenticated;
grant select on public.portfolio_content to anon,authenticated;
grant insert,update on public.portfolio_content to authenticated;
grant all on public.portfolio_content to service_role;
create policy "Published portfolio is readable" on public.portfolio_content for select to anon,authenticated using (true);
create policy "Owner with MFA may insert" on public.portfolio_content for insert to authenticated with check ((select private.is_portfolio_admin()));
create policy "Owner with MFA may update" on public.portfolio_content for update to authenticated using ((select private.is_portfolio_admin())) with check ((select private.is_portfolio_admin()));

create table public.portfolio_visits (
 day date not null,
 visitor_hash text not null check (length(visitor_hash)=64),
 views integer not null default 1 check (views>0),
 primary key(day,visitor_hash)
);
alter table public.portfolio_visits enable row level security;
revoke all on public.portfolio_visits from public,anon,authenticated;
grant select on public.portfolio_visits to authenticated;
grant all on public.portfolio_visits to service_role;
create policy "Only MFA owner reads traffic" on public.portfolio_visits for select to authenticated using ((select private.is_portfolio_admin()));

create table public.portfolio_request_limits (
 bucket text not null,
 window_start timestamptz not null,
 attempts integer not null default 1,
 primary key(bucket,window_start)
);
alter table public.portfolio_request_limits enable row level security;
revoke all on public.portfolio_request_limits from public,anon,authenticated;
grant all on public.portfolio_request_limits to service_role;
create function public.consume_portfolio_limit(p_bucket text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security invoker set search_path='' as $$
 declare start_at timestamptz; n integer;
 begin
  if p_seconds<1 or p_limit<1 then return false; end if;
  start_at:=to_timestamp(floor(extract(epoch from now())/p_seconds)*p_seconds);
  insert into public.portfolio_request_limits(bucket,window_start,attempts) values(p_bucket,start_at,1)
  on conflict(bucket,window_start) do update set attempts=portfolio_request_limits.attempts+1 returning attempts into n;
  return n<=p_limit;
 end;
$$;
revoke all on function public.consume_portfolio_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_portfolio_limit(text,integer,integer) to service_role;

create function public.record_portfolio_visit(p_day date,p_visitor_hash text) returns void
language sql security invoker set search_path='' as $$
 insert into public.portfolio_visits(day,visitor_hash,views) values(p_day,p_visitor_hash,1)
 on conflict(day,visitor_hash) do update set views=portfolio_visits.views+1;
$$;
revoke all on function public.record_portfolio_visit(date,text) from public,anon,authenticated;
grant execute on function public.record_portfolio_visit(date,text) to service_role;

create function public.get_portfolio_stats() returns jsonb
language plpgsql security invoker set search_path='' as $$
 declare result jsonb;
 begin
  if not private.is_portfolio_admin() then raise insufficient_privilege; end if;
  select jsonb_build_object('totals',(select jsonb_build_object('visitors',count(distinct visitor_hash),'views',coalesce(sum(views),0)) from public.portfolio_visits),'days',coalesce((select jsonb_agg(row_to_json(d)) from (select day,count(*) as visitors,sum(views) as views from public.portfolio_visits group by day order by day desc limit 30) d),'[]'::jsonb)) into result;
  return result;
 end;
$$;
revoke all on function public.get_portfolio_stats() from public,anon;
grant execute on function public.get_portfolio_stats() to authenticated;
