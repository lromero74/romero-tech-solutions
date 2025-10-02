#!/usr/bin/env node

import { getPool } from './config/database.js';

async function addTranslations() {
  let pool;

  try {
    console.log('🚀 Adding scheduler translations...');
    pool = await getPool();

    // Add English translations
    const englishTranslations = {
      'scheduler.previousDay': 'previous Day',
      'scheduler.nextDay': 'next Day',
      'scheduler.mustWaitAfter': 'Must wait 1 hour after appointment ending at {{time}}',
      'scheduler.mustEndBefore': 'Must end 1 hour before appointment starting at {{time}}',
      'scheduler.overlapsAppointment': 'Overlaps with existing appointment ({{start}} - {{end}})'
    };

    console.log('🇺🇸 Adding English translations...');
    const englishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'en', JSON.stringify(englishTranslations)]
    );
    console.log(`✅ Inserted ${englishResult.rows[0].insert_translation_batch} English translations`);

    // Add Spanish translations
    const spanishTranslations = {
      'scheduler.previousDay': 'Día Anterior',
      'scheduler.nextDay': 'Día Siguiente',
      'scheduler.mustWaitAfter': 'Debe esperar 1 hora después de la cita que termina a las {{time}}',
      'scheduler.mustEndBefore': 'Debe terminar 1 hora antes de la cita que comienza a las {{time}}',
      'scheduler.overlapsAppointment': 'Se superpone con cita existente ({{start}} - {{end}})'
    };

    console.log('🇪🇸 Adding Spanish translations...');
    const spanishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'es', JSON.stringify(spanishTranslations)]
    );
    console.log(`✅ Inserted ${spanishResult.rows[0].insert_translation_batch} Spanish translations`);

    console.log('🎉 Scheduler translations added successfully!');

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

addTranslations();
