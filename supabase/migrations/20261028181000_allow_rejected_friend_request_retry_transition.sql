CREATE OR REPLACE FUNCTION public.guard_friendship_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.requester_id IS DISTINCT FROM OLD.requester_id
     OR NEW.addressee_id IS DISTINCT FROM OLD.addressee_id THEN
    RAISE EXCEPTION 'Friendship participants cannot be changed';
  END IF;

  IF OLD.status = 'pending'
     AND NEW.status IN ('accepted', 'rejected')
     AND auth.uid() = OLD.addressee_id THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'rejected'
     AND NEW.status = 'pending'
     AND auth.uid() = OLD.requester_id THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid friend request status transition';
END;
$function$;
