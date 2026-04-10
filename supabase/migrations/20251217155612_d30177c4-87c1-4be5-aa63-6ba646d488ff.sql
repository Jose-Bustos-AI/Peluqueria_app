-- Create function to notify on booking updates (cancellation or modification)
CREATE OR REPLACE FUNCTION public.notify_booking_updated()
RETURNS TRIGGER AS $$
DECLARE
  event_type text;
BEGIN
  -- Detect event type based on what changed
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    event_type := 'booking.cancelled';
  ELSIF NEW.start_at != OLD.start_at OR NEW.end_at != OLD.end_at THEN
    event_type := 'booking.updated';
  ELSE
    -- Not a change we want to notify about
    RETURN NEW;
  END IF;

  -- Call the edge function with the event type and previous data
  PERFORM net.http_post(
    url := 'https://gxofivnfnzefpfkzwqpe.supabase.co/functions/v1/send-booking-webhook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4b2Zpdm5mbnplZnBma3p3cXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2ODk4ODUsImV4cCI6MjA3MzI2NTg4NX0.gwJoN-KHIbDmAq8KWCmMECEzMSqObvaoIpH9QjTDXN8'
    ),
    body := jsonb_build_object(
      'booking_id', NEW.id,
      'event', event_type,
      'previous_start_at', OLD.start_at,
      'previous_end_at', OLD.end_at
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for booking updates
DROP TRIGGER IF EXISTS on_booking_updated ON public.bookings;
CREATE TRIGGER on_booking_updated
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_booking_updated();