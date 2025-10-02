#!/usr/bin/env node

import { getPool } from './config/database.js';

async function addMissingTranslations() {
  let pool;

  try {
    console.log('🚀 Adding missing serviceRequests translations...');
    pool = await getPool();

    // Add English translations
    const englishTranslations = {
      'serviceRequests.title': 'Service Requests',
      'serviceRequests.searchPlaceholder': 'Search requests...',
      'serviceRequests.allStatuses': 'All Statuses',
      'serviceRequests.pending': 'Pending',
      'serviceRequests.inProgress': 'In Progress',
      'serviceRequests.completed': 'Completed',
      'serviceRequests.baseRate': 'Base Rate',
      'serviceRequests.total': 'Total',
      'serviceRequests.loading': 'Loading service requests...',
      'serviceRequests.error': 'Error loading service requests',
      'serviceRequests.noFilteredResults': 'No service requests match your filters',
      'serviceRequests.noRequests': 'No service requests found'
    };

    console.log('🇺🇸 Adding English translations...');
    const englishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'en', JSON.stringify(englishTranslations)]
    );
    console.log(`✅ Inserted ${englishResult.rows[0].insert_translation_batch} English translations`);

    // Add Spanish translations
    const spanishTranslations = {
      'serviceRequests.title': 'Solicitudes de Servicio',
      'serviceRequests.searchPlaceholder': 'Buscar solicitudes...',
      'serviceRequests.allStatuses': 'Todos los Estados',
      'serviceRequests.pending': 'Pendiente',
      'serviceRequests.inProgress': 'En Progreso',
      'serviceRequests.completed': 'Completado',
      'serviceRequests.baseRate': 'Tarifa Base',
      'serviceRequests.total': 'Total',
      'serviceRequests.loading': 'Cargando solicitudes de servicio...',
      'serviceRequests.error': 'Error al cargar solicitudes de servicio',
      'serviceRequests.noFilteredResults': 'No hay solicitudes que coincidan con sus filtros',
      'serviceRequests.noRequests': 'No se encontraron solicitudes de servicio'
    };

    console.log('🇪🇸 Adding Spanish translations...');
    const spanishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'es', JSON.stringify(spanishTranslations)]
    );
    console.log(`✅ Inserted ${spanishResult.rows[0].insert_translation_batch} Spanish translations`);

    console.log('🎉 Missing translations addition completed successfully!');
    console.log('📝 Total keys added: 12');

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

addMissingTranslations();
