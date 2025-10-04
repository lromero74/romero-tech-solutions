/**
 * Migration: Create push_subscriptions table
 * Purpose: Store push notification subscriptions for PWA notifications
 * Date: 2025-10-04
 */

export async function up(pool) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create push_subscriptions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id UUID,
        employee_id UUID,
        endpoint TEXT NOT NULL UNIQUE,
        keys JSONB NOT NULL,
        device_info JSONB,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        -- User can be either a client user or an employee
        CONSTRAINT user_or_employee CHECK (
          (user_id IS NOT NULL AND employee_id IS NULL) OR
          (user_id IS NULL AND employee_id IS NOT NULL)
        ),

        -- Foreign keys
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
      );
    `);

    // Create indexes for better query performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
      ON push_subscriptions(user_id) WHERE user_id IS NOT NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_employee_id
      ON push_subscriptions(employee_id) WHERE employee_id IS NOT NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
      ON push_subscriptions(endpoint);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active
      ON push_subscriptions(is_active) WHERE is_active = true;
    `);

    // Create trigger to update updated_at timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      CREATE TRIGGER trigger_update_push_subscriptions_updated_at
      BEFORE UPDATE ON push_subscriptions
      FOR EACH ROW
      EXECUTE FUNCTION update_push_subscriptions_updated_at();
    `);

    // Create notification preferences table for managing what notifications users want
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_notification_preferences (
        id SERIAL PRIMARY KEY,
        user_id UUID,
        employee_id UUID,
        new_client_signup BOOLEAN DEFAULT true,
        new_service_request BOOLEAN DEFAULT true,
        service_request_updated BOOLEAN DEFAULT true,
        invoice_created BOOLEAN DEFAULT true,
        invoice_paid BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        -- User can be either a client user or an employee
        CONSTRAINT pref_user_or_employee CHECK (
          (user_id IS NOT NULL AND employee_id IS NULL) OR
          (user_id IS NULL AND employee_id IS NOT NULL)
        ),

        -- Foreign keys
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,

        -- Unique constraint
        CONSTRAINT unique_user_employee_prefs UNIQUE (user_id, employee_id)
      );
    `);

    // Create indexes for notification preferences
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_push_notification_prefs_user_id
      ON push_notification_preferences(user_id) WHERE user_id IS NOT NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_push_notification_prefs_employee_id
      ON push_notification_preferences(employee_id) WHERE employee_id IS NOT NULL;
    `);

    await client.query('COMMIT');

    console.log('✅ Push subscriptions tables created successfully');
    return { success: true };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating push subscriptions tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop tables and related objects
    await client.query('DROP TABLE IF EXISTS push_notification_preferences CASCADE;');
    await client.query('DROP TABLE IF EXISTS push_subscriptions CASCADE;');
    await client.query('DROP FUNCTION IF EXISTS update_push_subscriptions_updated_at() CASCADE;');

    await client.query('COMMIT');

    console.log('✅ Push subscriptions tables dropped successfully');
    return { success: true };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error dropping push subscriptions tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

