#!/usr/bin/env node

import { getPool } from '../config/database.js';

async function addUsernameSystem() {
  const pool = await getPool();

  console.log('🔧 Adding username system for clients...');

  try {
    // 1. Add username column to users table
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS username VARCHAR(30) UNIQUE,
      ADD COLUMN IF NOT EXISTS username_set_at TIMESTAMP WITH TIME ZONE
    `);
    console.log('✅ Added username columns to users table');

    // 2. Create profanity filter table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profanity_filter (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        term VARCHAR(50) NOT NULL UNIQUE,
        is_active BOOLEAN DEFAULT true,
        severity VARCHAR(10) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created profanity_filter table');

    // 3. Insert common profanity terms (basic set)
    await pool.query(`
      INSERT INTO profanity_filter (term, severity) VALUES
        ('fuck', 'high'),
        ('shit', 'high'),
        ('bitch', 'high'),
        ('damn', 'medium'),
        ('hell', 'medium'),
        ('ass', 'medium'),
        ('nigger', 'high'),
        ('nigga', 'high'),
        ('faggot', 'high'),
        ('retard', 'high'),
        ('whore', 'high'),
        ('slut', 'high'),
        ('cunt', 'high'),
        ('piss', 'medium'),
        ('bastard', 'medium'),
        ('cock', 'high'),
        ('dick', 'high'),
        ('pussy', 'high'),
        ('nazi', 'high'),
        ('hitler', 'high')
      ON CONFLICT (term) DO NOTHING
    `);
    console.log('✅ Inserted profanity filter terms');

    // 4. Create index on username for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username
      ON users(username) WHERE username IS NOT NULL
    `);
    console.log('✅ Created username index');

    // 5. Create index on profanity filter for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_profanity_filter_term
      ON profanity_filter(term) WHERE is_active = true
    `);
    console.log('✅ Created profanity filter index');

    console.log('🎉 Username system added successfully!');

  } catch (error) {
    console.error('❌ Error adding username system:', error);
    throw error;
  } finally {
    // Don't close the pool here since it might be used elsewhere
  }
}

// Run the script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addUsernameSystem()
    .then(() => {
      console.log('✅ Username system setup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Username system setup failed:', error);
      process.exit(1);
    });
}

export default addUsernameSystem;