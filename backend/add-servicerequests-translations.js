#!/usr/bin/env node

import { getPool } from './config/database.js';

async function addServiceRequestsTranslations() {
  let pool;

  try {
    console.log('🚀 Adding serviceRequests translations...');
    pool = await getPool();

    // Add English translations
    const englishTranslations = {
      'serviceRequests.notScheduled': 'Not scheduled',
      'serviceRequests.at': 'at',
      'serviceRequests.file': 'file',
      'serviceRequests.files': 'files',
      'serviceRequests.showingRequests': 'Showing {{start}} to {{end}} of {{total}} requests',
      'serviceRequests.pageOfPages': '{{page}} of {{totalPages}}',
      'serviceRequests.priority': 'Priority',
      'serviceRequests.selectedDateTime': 'Selected Date & Time',
      'serviceRequests.baseRatePerHour': 'Base Rate: ${{rate}}/hr',
      'serviceRequests.standardRate': '{{hours}}h Standard @ 1x = ${{total}}',
      'serviceRequests.totalEstimate': 'Total*: ${{total}}',
      'serviceRequests.requestNumber': 'Request #',
      'serviceRequests.location': 'Location',
      'serviceRequests.serviceType': 'Service Type',
      'serviceRequests.scheduledDate': 'Scheduled Date',
      'serviceRequests.created': 'Created',
      'serviceRequests.description': 'Description',
      'serviceRequests.attachments': 'Attachments',
      'serviceRequests.loadingFiles': 'Loading files...',
      'serviceRequests.noFilesAvailable': 'No files available'
    };

    console.log('🇺🇸 Adding English translations...');
    const englishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'en', JSON.stringify(englishTranslations)]
    );
    console.log(`✅ Inserted ${englishResult.rows[0].insert_translation_batch} English translations`);

    // Add Spanish translations
    const spanishTranslations = {
      'serviceRequests.notScheduled': 'No programado',
      'serviceRequests.at': 'a las',
      'serviceRequests.file': 'archivo',
      'serviceRequests.files': 'archivos',
      'serviceRequests.showingRequests': 'Mostrando {{start}} a {{end}} de {{total}} solicitudes',
      'serviceRequests.pageOfPages': '{{page}} de {{totalPages}}',
      'serviceRequests.priority': 'Prioridad',
      'serviceRequests.selectedDateTime': 'Fecha y Hora Seleccionada',
      'serviceRequests.baseRatePerHour': 'Tarifa Base: ${{rate}}/hr',
      'serviceRequests.standardRate': '{{hours}}h Estándar @ 1x = ${{total}}',
      'serviceRequests.totalEstimate': 'Total*: ${{total}}',
      'serviceRequests.requestNumber': 'Solicitud #',
      'serviceRequests.location': 'Ubicación',
      'serviceRequests.serviceType': 'Tipo de Servicio',
      'serviceRequests.scheduledDate': 'Fecha Programada',
      'serviceRequests.created': 'Creado',
      'serviceRequests.description': 'Descripción',
      'serviceRequests.attachments': 'Archivos Adjuntos',
      'serviceRequests.loadingFiles': 'Cargando archivos...',
      'serviceRequests.noFilesAvailable': 'No hay archivos disponibles'
    };

    console.log('🇪🇸 Adding Spanish translations...');
    const spanishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'es', JSON.stringify(spanishTranslations)]
    );
    console.log(`✅ Inserted ${spanishResult.rows[0].insert_translation_batch} Spanish translations`);

    console.log('🎉 ServiceRequests translation addition completed successfully!');
    console.log('📝 Total keys added: 20');

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

addServiceRequestsTranslations();
