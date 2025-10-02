#!/usr/bin/env node

import { getPool } from './config/database.js';

async function addTranslation() {
  let pool;

  try {
    console.log('🚀 Adding missing service request cost translations...');
    pool = await getPool();

    // Add English translations
    const englishTranslations = {
      'serviceRequests.baseRatePerHour': 'Base Rate: ${{rate}}/hr',
      'serviceRequests.standardRate': '{{hours}}h Standard @ 1x = ${{total}}',
      'serviceRequests.newClientFirstHourWaived': 'New Client 1st Hour Waived: -${{amount}}',
      'serviceRequests.totalEstimate': 'Total*: ${{total}}'
    };

    console.log('🇺🇸 Adding English translations...');
    const englishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'en', JSON.stringify(englishTranslations)]
    );
    console.log(`✅ Inserted ${englishResult.rows[0].insert_translation_batch} English translations`);

    // Add Spanish translations
    const spanishTranslations = {
      'serviceRequests.baseRatePerHour': 'Tarifa Base: ${{rate}}/hr',
      'serviceRequests.standardRate': '{{hours}}h Estándar @ 1x = ${{total}}',
      'serviceRequests.newClientFirstHourWaived': 'Cliente Nuevo - Primera Hora Gratis: -${{amount}}',
      'serviceRequests.totalEstimate': 'Total*: ${{total}}'
    };

    console.log('🇪🇸 Adding Spanish translations...');
    const spanishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'es', JSON.stringify(spanishTranslations)]
    );
    console.log(`✅ Inserted ${spanishResult.rows[0].insert_translation_batch} Spanish translations`);

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
