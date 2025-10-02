#!/usr/bin/env node

import { getPool } from './config/database.js';

async function addTranslation() {
  let pool;

  try {
    console.log('🚀 Adding full weekday name translations...');
    pool = await getPool();

    // Add English translations for full weekday names
    const englishTranslations = {
      'calendar.daysLong.0': 'Sunday',
      'calendar.daysLong.1': 'Monday',
      'calendar.daysLong.2': 'Tuesday',
      'calendar.daysLong.3': 'Wednesday',
      'calendar.daysLong.4': 'Thursday',
      'calendar.daysLong.5': 'Friday',
      'calendar.daysLong.6': 'Saturday'
    };

    console.log('🇺🇸 Adding English translations...');
    const englishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'en', JSON.stringify(englishTranslations)]
    );
    console.log(`✅ Inserted ${englishResult.rows[0].insert_translation_batch} English translations`);

    // Add Spanish translations with proper capitalization
    const spanishTranslations = {
      'calendar.daysLong.0': 'Domingo',
      'calendar.daysLong.1': 'Lunes',
      'calendar.daysLong.2': 'Martes',
      'calendar.daysLong.3': 'Miércoles',
      'calendar.daysLong.4': 'Jueves',
      'calendar.daysLong.5': 'Viernes',
      'calendar.daysLong.6': 'Sábado'
    };

    console.log('🇪🇸 Adding Spanish translations (capitalized)...');
    const spanishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'es', JSON.stringify(spanishTranslations)]
    );
    console.log(`✅ Inserted ${spanishResult.rows[0].insert_translation_batch} Spanish translations`);

    console.log('🎉 Full weekday translations added successfully!');
    console.log('\nℹ️  Note: Code updates may be needed to use these translations instead of toLocaleDateString()');

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

addTranslation();
