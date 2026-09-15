alter table public.user_documents
  drop constraint if exists user_documents_document_type_check;

alter table public.user_documents
  add constraint user_documents_document_type_check check (document_type in (
    'goals', 'equipment', 'planning_decisions', 'planning_availability',
    'planning_exceptions', 'planning_drafts', 'guided_run', 'workout_history',
    'checkin_history', 'checkin_draft', 'workout_feedback', 'training_load_level'
  ));
