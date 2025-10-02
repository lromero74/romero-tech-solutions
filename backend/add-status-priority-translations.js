#!/usr/bin/env node

import { getPool } from './config/database.js';

async function addStatusPriorityTranslations() {
  let pool;

  try {
    console.log('🚀 Adding status and priority translations...');
    pool = await getPool();

    // Add English translations
    const englishTranslations = {
      'status.Submitted': 'Submitted',
      'status.Acknowledge': 'Acknowledged',
      'status.Started': 'In Progress',
      'status.Closed': 'Closed',
      'priority.Low': 'Low',
      'priority.Medium': 'Medium',
      'priority.High': 'High',
      'priority.Critical': 'Critical'
    };

    console.log('🇺🇸 Adding English translations...');
    const englishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'en', JSON.stringify(englishTranslations)]
    );
    console.log(`✅ Inserted ${englishResult.rows[0].insert_translation_batch} English translations`);

    // Add Spanish translations
    const spanishTranslations = {
      'status.Submitted': 'Enviado',
      'status.Acknowledge': 'Confirmado',
      'status.Started': 'En Progreso',
      'status.Closed': 'Cerrado',
      'priority.Low': 'Baja',
      'priority.Medium': 'Media',
      'priority.High': 'Alta',
      'priority.Critical': 'Crítica'
    };

    console.log('🇪🇸 Adding Spanish translations...');
    const spanishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'es', JSON.stringify(spanishTranslations)]
    );
    console.log(`✅ Inserted ${spanishResult.rows[0].insert_translation_batch} Spanish translations`);

    console.log('🎉 Status and priority translation addition completed!');
    console.log('📝 Total keys added: 8');

  } catch (error) {
    console.error('❌ Translation addition failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  } finally {
    if (pool) {
      await pool.end();
      console.log('🔐 Database connection closed');
    }
  }
}

addStatusPriorityTranslations();
