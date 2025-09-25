#!/usr/bin/env node

import { query, closePool } from '../config/database.js';

async function listTriggersAndProcedures() {
  try {
    console.log('🔍 Listing all triggers and stored procedures...\n');

    // Get all triggers
    const triggersResult = await query(`
      SELECT
        t.trigger_name,
        t.event_manipulation,
        t.event_object_table,
        t.action_timing,
        t.action_statement
      FROM information_schema.triggers t
      WHERE t.trigger_schema = 'public'
      ORDER BY t.event_object_table, t.trigger_name
    `);

    if (triggersResult.rows.length > 0) {
      console.log('⚡ TRIGGERS:');
      console.log('============');
      triggersResult.rows.forEach((trigger, index) => {
        console.log(`   ${index + 1}. ${trigger.trigger_name}`);
        console.log(`      Table: ${trigger.event_object_table}`);
        console.log(`      Event: ${trigger.action_timing} ${trigger.event_manipulation}`);
        console.log(`      Action: ${trigger.action_statement}`);
        console.log('');
      });
      console.log(`📊 Total triggers: ${triggersResult.rows.length}\n`);
    } else {
      console.log('⚡ TRIGGERS: None found\n');
    }

    // Get all stored procedures and functions
    const proceduresResult = await query(`
      SELECT
        p.proname as procedure_name,
        n.nspname as schema_name,
        p.prokind,
        CASE
          WHEN p.prokind = 'f' THEN 'Function'
          WHEN p.prokind = 'p' THEN 'Procedure'
          WHEN p.prokind = 'a' THEN 'Aggregate'
          WHEN p.prokind = 'w' THEN 'Window'
          ELSE 'Other'
        END as procedure_type,
        pg_get_function_result(p.oid) as return_type,
        pg_get_function_arguments(p.oid) as arguments
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname NOT LIKE 'pg_%'
        AND p.proname NOT LIKE 'information_schema_%'
      ORDER BY procedure_type, p.proname
    `);

    if (proceduresResult.rows.length > 0) {
      console.log('🔧 STORED PROCEDURES & FUNCTIONS:');
      console.log('==================================');

      const functions = proceduresResult.rows.filter(p => p.procedure_type === 'Function');
      const procedures = proceduresResult.rows.filter(p => p.procedure_type === 'Procedure');
      const aggregates = proceduresResult.rows.filter(p => p.procedure_type === 'Aggregate');
      const others = proceduresResult.rows.filter(p => !['Function', 'Procedure', 'Aggregate'].includes(p.procedure_type));

      if (functions.length > 0) {
        console.log('\n📝 Functions:');
        functions.forEach((func, index) => {
          console.log(`   ${index + 1}. ${func.procedure_name}(${func.arguments || ''})`);
          console.log(`      Returns: ${func.return_type || 'void'}`);
        });
      }

      if (procedures.length > 0) {
        console.log('\n⚙️  Procedures:');
        procedures.forEach((proc, index) => {
          console.log(`   ${index + 1}. ${proc.procedure_name}(${proc.arguments || ''})`);
        });
      }

      if (aggregates.length > 0) {
        console.log('\n📊 Aggregates:');
        aggregates.forEach((agg, index) => {
          console.log(`   ${index + 1}. ${agg.procedure_name}(${agg.arguments || ''})`);
          console.log(`      Returns: ${agg.return_type || 'void'}`);
        });
      }

      if (others.length > 0) {
        console.log('\n🔀 Other:');
        others.forEach((other, index) => {
          console.log(`   ${index + 1}. ${other.procedure_name} (${other.procedure_type})`);
        });
      }

      console.log(`\n📊 Total procedures/functions: ${proceduresResult.rows.length}`);
    } else {
      console.log('🔧 STORED PROCEDURES & FUNCTIONS: None found');
    }

    // Get trigger functions (functions that are called by triggers)
    const triggerFunctionsResult = await query(`
      SELECT DISTINCT
        p.proname as function_name,
        pg_get_function_arguments(p.oid) as arguments
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.prorettype = (SELECT oid FROM pg_type WHERE typname = 'trigger')
      ORDER BY p.proname
    `);

    if (triggerFunctionsResult.rows.length > 0) {
      console.log('\n🎯 TRIGGER FUNCTIONS:');
      console.log('=====================');
      triggerFunctionsResult.rows.forEach((func, index) => {
        console.log(`   ${index + 1}. ${func.function_name}(${func.arguments || ''})`);
      });
      console.log(`\n📊 Total trigger functions: ${triggerFunctionsResult.rows.length}`);
    }

  } catch (error) {
    console.error('❌ Error listing triggers and procedures:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await closePool();
  }
}

listTriggersAndProcedures();