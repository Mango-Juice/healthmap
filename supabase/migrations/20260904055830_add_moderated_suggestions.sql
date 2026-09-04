create schema if not exists suggestion_admin;
revoke all on schema suggestion_admin from public, anon, authenticated;
create table suggestion_admin.pending (
  id uuid primary key,
  actor text not null check (actor ~ '^[a-f0-9]{64}$'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  kind text not null check (kind in ('place_add', 'menu_correction')),
  place_url text not null check (length(place_url) <= 2048 and place_url ~ '^https://[^/@[:space:]]+([/?][^[:space:]]*)?$'),
  suggestion_text text not null check (length(btrim(suggestion_text)) between 10 and 2000),
  evidence_url text not null check (length(evidence_url) <= 2048 and evidence_url ~ '^https://[^/@[:space:]]+([/?][^[:space:]]*)?$'),
  received_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'rejected', 'reviewed')),
  review_note text check (length(review_note) between 10 and 2000)
);
create index on suggestion_admin.pending (actor, received_at);
alter table suggestion_admin.pending enable row level security;
create table suggestion_admin.worklist (
  suggestion_id uuid primary key references suggestion_admin.pending(id),
  review_note text not null check (length(review_note) between 10 and 2000),
  reviewed_at timestamptz not null default now()
);
alter table suggestion_admin.worklist enable row level security;
revoke all on all tables in schema suggestion_admin from public, anon, authenticated;

create function public.submit_pending_suggestion(p_submission jsonb, p_actor text, p_fingerprint text)
returns text language plpgsql security definer set search_path = '' as $$
declare existing suggestion_admin.pending; recent_count integer;
begin
  if p_submission is null or p_actor is null or p_fingerprint is null or
    p_actor !~ '^[a-f0-9]{64}$' or p_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid submission';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(80455830);
  select * into existing from suggestion_admin.pending where id = (p_submission->>'requestId')::uuid;
  if found then
    if existing.actor = p_actor and existing.fingerprint = p_fingerprint then return 'duplicate'; end if;
    return 'conflict';
  end if;
  if exists (select 1 from suggestion_admin.pending where actor = p_actor and fingerprint = p_fingerprint and received_at > now() - interval '1 day') then return 'duplicate'; end if;
  select count(*) into recent_count from suggestion_admin.pending where actor = p_actor and received_at > now() - interval '1 day';
  if recent_count >= 5 or (select count(*) from suggestion_admin.pending where received_at > now() - interval '1 day') >= 1000 then return 'limited'; end if;
  insert into suggestion_admin.pending(id, actor, fingerprint, kind, place_url, suggestion_text, evidence_url)
    values ((p_submission->>'requestId')::uuid, p_actor, p_fingerprint, p_submission->>'kind', p_submission->>'placeUrl', p_submission->>'text', p_submission->>'evidenceUrl');
  return 'queued';
end;
$$;
revoke all on function public.submit_pending_suggestion(jsonb,text,text) from public, anon, authenticated;
grant execute on function public.submit_pending_suggestion(jsonb,text,text) to service_role;

create function public.review_pending_suggestion(p_id uuid, p_accept boolean, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare current_status text;
begin
  if p_accept is null or p_note is null or length(btrim(p_note)) not between 10 and 2000 then raise exception 'Review note required'; end if;
  select status into current_status from suggestion_admin.pending where id = p_id for update;
  if not found then raise exception 'Unknown suggestion'; end if;
  if current_status <> 'pending' then return current_status; end if;
  if p_accept then
    insert into suggestion_admin.worklist(suggestion_id, review_note) values (p_id, p_note);
  end if;
  update suggestion_admin.pending set status = case when p_accept then 'reviewed' else 'rejected' end, review_note = p_note where id = p_id;
  return case when p_accept then 'reviewed' else 'rejected' end;
end;
$$;
revoke all on function public.review_pending_suggestion(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.review_pending_suggestion(uuid,boolean,text) to service_role;
grant usage on schema suggestion_admin to service_role;
grant select on suggestion_admin.pending, suggestion_admin.worklist to service_role;
