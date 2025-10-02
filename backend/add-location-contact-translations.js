#!/usr/bin/env node

import { getPool } from './config/database.js';

async function addLocationContactTranslations() {
  let pool;

  try {
    console.log('🚀 Adding location and contact translations...');
    pool = await getPool();

    // Add English translations
    const englishTranslations = {
      'serviceRequests.locationContact': 'Location & Contact',
      'serviceRequests.address': 'Address',
      'serviceRequests.contactPerson': 'Contact Person',
      'serviceRequests.phone': 'Phone',
      'serviceRequests.email': 'Email'
    };

    console.log('🇺🇸 Adding English translations...');
    const englishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'en', JSON.stringify(englishTranslations)]
    );
    console.log(`✅ Inserted ${englishResult.rows[0].insert_translation_batch} English translations`);

    // Add Spanish translations
    const spanishTranslations = {
      'serviceRequests.locationContact': 'Ubicación y Contacto',
      'serviceRequests.address': 'Dirección',
      'serviceRequests.contactPerson': 'Persona de Contacto',
      'serviceRequests.phone': 'Teléfono',
      'serviceRequests.email': 'Correo Electrónico'
    };

    console.log('🇪🇸 Adding Spanish translations...');
    const spanishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'es', JSON.stringify(spanishTranslations)]
    );
    console.log(`✅ Inserted ${spanishResult.rows[0].insert_translation_batch} Spanish translations`);

    console.log('🎉 Location and contact translation addition completed!');
    console.log('📝 Total keys added: 5');

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

addLocationContactTranslations();
