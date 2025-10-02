-- Scheduler Component Translations
-- Add translation keys for the time slot scheduler component

-- Helper function to add translation with key creation if needed
DO $$
DECLARE
    v_en_id uuid;
    v_es_id uuid;
    v_key_id uuid;
    v_namespace_id uuid;
    rec RECORD;
BEGIN
    -- Get language IDs
    SELECT id INTO v_en_id FROM t_languages WHERE code = 'en';
    SELECT id INTO v_es_id FROM t_languages WHERE code = 'es';

    -- Get or create namespace for scheduler
    SELECT id INTO v_namespace_id FROM t_translation_namespaces WHERE namespace = 'scheduler';
    IF v_namespace_id IS NULL THEN
        INSERT INTO t_translation_namespaces (namespace, description)
        VALUES ('scheduler', 'Time slot scheduler component')
        RETURNING id INTO v_namespace_id;
    END IF;

    -- Function to insert translation
    CREATE TEMP TABLE IF NOT EXISTS temp_translations (
        key_name TEXT,
        en_value TEXT,
        es_value TEXT
    );

    INSERT INTO temp_translations (key_name, en_value, es_value) VALUES
    -- Scheduler Header
    ('scheduler.title', 'Schedule Appointment', 'Programar Cita'),
    ('scheduler.loading', 'Loading scheduler...', 'Cargando programador...'),

    -- Duration Selector
    ('scheduler.duration', 'Duration:', 'Duración:'),
    ('scheduler.hour', 'hour', 'hora'),
    ('scheduler.hours', 'hours', 'horas'),

    -- Buttons
    ('scheduler.autoSuggest', 'Auto-Suggest Available Slot', 'Sugerir Horario Disponible'),
    ('scheduler.finding', 'Finding...', 'Buscando...'),
    ('scheduler.now', 'Now', 'Ahora'),
    ('scheduler.confirmBooking', 'Confirm Booking', 'Confirmar Reserva'),

    -- Warnings and Alerts
    ('scheduler.emergencyHoursTitle', '⚠️ Emergency Hours Selected', '⚠️ Horas de Emergencia Seleccionadas'),
    ('scheduler.emergencyHoursMessage', 'Your selected time includes Emergency rate hours ({multiplier}x rate). This appointment will be charged at a higher rate than standard hours.', 'Su horario seleccionado incluye horas de tarifa de Emergencia (tarifa {multiplier}x). Esta cita se cobrará a una tarifa más alta que las horas estándar.'),

    ('scheduler.premiumHoursTitle', 'Premium Hours Selected', 'Horas Premium Seleccionadas'),
    ('scheduler.premiumHoursMessage', 'Your selected time includes Premium rate hours ({multiplier}x rate).', 'Su horario seleccionado incluye horas de tarifa Premium (tarifa {multiplier}x).'),

    ('scheduler.pastDateWarning', '⚠️ Cannot schedule appointments in the past. Please select a future date.', '⚠️ No se pueden programar citas en el pasado. Por favor seleccione una fecha futura.'),

    ('scheduler.pastDateTitle', 'Past Date Selected', 'Fecha Pasada Seleccionada'),
    ('scheduler.pastDateMessage', 'Please select today or a future date to schedule appointments.', 'Por favor seleccione hoy o una fecha futura para programar citas.'),

    -- Timeline Labels
    ('scheduler.time', 'Time', 'Hora'),
    ('scheduler.availableSlots', 'Available Slots', 'Horarios Disponibles'),

    -- Legend Items
    ('scheduler.premium', 'Premium', 'Premium'),
    ('scheduler.emergency', 'Emergency', 'Emergencia'),
    ('scheduler.standard', 'Standard', 'Estándar'),
    ('scheduler.unavailable', 'Unavailable', 'No Disponible'),
    ('scheduler.selected', 'Selected', 'Seleccionado'),

    -- Tooltips
    ('scheduler.pastTimeSlot', 'Past time slot', 'Horario pasado'),
    ('scheduler.premiumHours', 'Premium hours ({multiplier}x rate)', 'Horas Premium (tarifa {multiplier}x)'),
    ('scheduler.emergencyHours', 'Emergency hours ({multiplier}x rate)', 'Horas de emergencia (tarifa {multiplier}x)'),
    ('scheduler.standardHours', 'Standard hours ({multiplier}x rate)', 'Horas estándar (tarifa {multiplier}x)'),
    ('scheduler.dragToMove', 'Drag to move appointment', 'Arrastrar para mover la cita'),
    ('scheduler.dragStartTime', 'Drag to adjust start time', 'Arrastrar para ajustar hora de inicio'),
    ('scheduler.dragEndTime', 'Drag to adjust end time', 'Arrastrar para ajustar hora de fin'),

    -- Selected Time Display
    ('scheduler.selectedLabel', 'Selected:', 'Seleccionado:'),

    -- Error Messages
    ('scheduler.error.pastOrTooSoon', 'Cannot schedule appointments in the past or less than 1 hour from now', 'No se pueden programar citas en el pasado o con menos de 1 hora de anticipación'),
    ('scheduler.error.pastMidnight', 'Selected duration ({duration}h) would extend past midnight. Please select an earlier time or shorter duration.', 'La duración seleccionada ({duration}h) se extendería después de medianoche. Por favor seleccione un horario más temprano o una duración más corta.'),
    ('scheduler.error.pastMidnightDuration', 'Duration of {duration}h would extend past midnight. Please select a shorter duration or earlier start time.', 'Una duración de {duration}h se extendería después de medianoche. Por favor seleccione una duración más corta o un horario de inicio más temprano.'),
    ('scheduler.error.slotUnavailable', 'This time slot is not available', 'Este horario no está disponible'),
    ('scheduler.error.durationUnavailable', 'This time slot is not available with the new duration', 'Este horario no está disponible con la nueva duración'),
    ('scheduler.error.invalidSelection', 'Invalid time selection', 'Selección de horario inválida');

    -- Insert all translations
    FOR rec IN SELECT * FROM temp_translations LOOP
        -- Insert or get key
        INSERT INTO t_translation_keys (key_path, namespace_id, description)
        VALUES (rec.key_name, v_namespace_id, 'Scheduler component translation')
        ON CONFLICT (namespace_id, key_path) DO UPDATE SET key_path = rec.key_name
        RETURNING id INTO v_key_id;

        -- Insert English translation
        INSERT INTO t_translations (key_id, language_id, value, is_approved)
        VALUES (v_key_id, v_en_id, rec.en_value, true)
        ON CONFLICT (key_id, language_id) DO UPDATE
        SET value = rec.en_value, updated_at = CURRENT_TIMESTAMP;

        -- Insert Spanish translation
        INSERT INTO t_translations (key_id, language_id, value, is_approved)
        VALUES (v_key_id, v_es_id, rec.es_value, true)
        ON CONFLICT (key_id, language_id) DO UPDATE
        SET value = rec.es_value, updated_at = CURRENT_TIMESTAMP;
    END LOOP;

    DROP TABLE temp_translations;
END $$;
