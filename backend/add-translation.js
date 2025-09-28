#!/usr/bin/env node

import { getPool } from './config/database.js';

async function addTranslation() {
  let pool;

  try {
    console.log('🚀 Adding missing deleteFailed translation...');
    pool = await getPool();

    // Add English translation
    const englishTranslations = {
      'files.actions.deleteFailed': 'Failed to delete file'
    };

    console.log('🇺🇸 Adding English translation...');
    const englishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'en', JSON.stringify(englishTranslations)]
    );
    console.log(`✅ Inserted ${englishResult.rows[0].insert_translation_batch} English translation`);

    // Add Spanish translation
    const spanishTranslations = {
      'files.actions.deleteFailed': 'Error al eliminar archivo'
    };

    console.log('🇪🇸 Adding Spanish translation...');
    const spanishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'es', JSON.stringify(spanishTranslations)]
    );
    console.log(`✅ Inserted ${spanishResult.rows[0].insert_translation_batch} Spanish translation`);

    console.log('🎉 Translation addition completed successfully!');

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