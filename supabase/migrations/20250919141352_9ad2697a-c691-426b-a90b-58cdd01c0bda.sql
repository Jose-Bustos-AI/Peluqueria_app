-- Create function to validate class capacity before booking insertion
CREATE OR REPLACE FUNCTION validate_class_capacity()
RETURNS TRIGGER AS $$
DECLARE
    class_capacity INTEGER;
    session_capacity INTEGER;
    current_bookings INTEGER;
    effective_capacity INTEGER;
BEGIN
    -- Only validate for class bookings
    IF NEW.type != 'class' OR NEW.class_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get current bookings count for this class at this time slot
    SELECT COUNT(*) INTO current_bookings
    FROM bookings
    WHERE type = 'class'
        AND class_id = NEW.class_id
        AND location_id = NEW.location_id
        AND start_at = NEW.start_at
        AND status != 'cancelled'
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid); -- Exclude current booking if updating

    -- Try to get capacity from class_sessions first
    SELECT capacity INTO session_capacity
    FROM class_sessions
    WHERE class_id = NEW.class_id
        AND location_id = NEW.location_id
        AND start_at = NEW.start_at;

    -- If no specific session, get capacity from classes table
    IF session_capacity IS NULL THEN
        SELECT capacity INTO class_capacity
        FROM classes
        WHERE id = NEW.class_id;
        
        effective_capacity := class_capacity;
    ELSE
        effective_capacity := session_capacity;
    END IF;

    -- Check if capacity would be exceeded
    IF current_bookings >= effective_capacity THEN
        RAISE EXCEPTION 'Class capacity exceeded. Current bookings: %, Capacity: %', current_bookings, effective_capacity;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate capacity before insert/update
DROP TRIGGER IF EXISTS validate_class_capacity_trigger ON bookings;
CREATE TRIGGER validate_class_capacity_trigger
    BEFORE INSERT OR UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION validate_class_capacity();