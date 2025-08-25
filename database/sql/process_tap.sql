CREATE OR REPLACE FUNCTION process_tap(
    p_user_id bigint,
    p_tap_count integer,
    p_spud_amount integer
) RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_energy integer;
    v_max_energy integer;
    v_current_balance integer;
    v_result json;
BEGIN
    -- Lock the user's energy record for update
    SELECT current_energy, max_energy 
    INTO v_current_energy, v_max_energy
    FROM user_energy 
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Check if we have enough energy
    IF v_current_energy < p_tap_count THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Insufficient energy',
            'current_energy', v_current_energy,
            'max_energy', v_max_energy
        );
    END IF;

    -- Update energy in a single atomic operation
    UPDATE user_energy 
    SET current_energy = current_energy - p_tap_count,
        last_update = NOW()
    WHERE user_id = p_user_id;

    -- Update balance in a single atomic operation
    UPDATE users
    SET balance = balance + p_spud_amount,
        total_farmed = total_farmed + p_spud_amount
    WHERE user_id = p_user_id
    RETURNING balance INTO v_current_balance;

    -- Build success response
    RETURN json_build_object(
        'success', true,
        'current_energy', v_current_energy - p_tap_count,
        'max_energy', v_max_energy,
        'balance', v_current_balance,
        'earned', p_spud_amount
    );
END;
$$;
