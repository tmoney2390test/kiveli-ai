begin;
select plan(4);

select has_column('public','together_generated_media','user_feedback','generated media stores the user quality verdict');
select has_column('public','together_generated_media','user_feedback_at','generated media timestamps the latest verdict');
select has_index('public','together_generated_media','together_generated_media_negative_feedback_idx','bad generated photos have an audit index');
select col_is_null('public','together_generated_media','user_feedback','photo feedback is optional');

select * from finish();
rollback;
