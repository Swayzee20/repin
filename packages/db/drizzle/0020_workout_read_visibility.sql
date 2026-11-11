do $$
declare app_table text;
begin
  foreach app_table in array array[
    'workouts','movements','workout_definitions','workout_blocks','block_movements',
    'workout_sessions','workout_session_metrics','workout_session_segments',
    'session_movement_results','set_results','community_posts','community_post_comments',
    'community_post_reactions','personal_records','community_post_prs','goals',
    'goal_periods','community_post_goals','groups','group_members','users','user_blocks','content_reports'
  ] loop
    execute pg_catalog.format('alter table public.%I enable row level security', app_table);
    execute pg_catalog.format('alter table public.%I force row level security', app_table);
  end loop;
end $$;
