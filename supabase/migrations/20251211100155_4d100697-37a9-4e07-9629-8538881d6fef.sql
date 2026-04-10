-- Enable pg_net extension for HTTP calls from PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function that calls the edge function asynchronously
CREATE OR REPLACE FUNCTION public.notify_booking_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the edge function asynchronously using pg_net
  PERFORM net.http_post(
    url := 'https://gxofivnfnzefpfkzwqpe.supabase.co/functions/v1/send-booking-webhook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4b2Zpdm5mbnplZnBma3p3cXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2ODk4ODUsImV4cCI6MjA3MzI2NTg4NX0.gwJoN-KHIbDmAq8KWCmMECEzMSqObvaoIpH9QjTDXN8'
    ),
    body := jsonb_build_object('booking_id', NEW.id)
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger that fires after each booking insert
CREATE TRIGGER on_booking_created
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_booking_created();