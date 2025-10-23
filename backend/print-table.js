#!/usr/bin/env node

import { query, closePool } from './config/database.js';

// Color codes for prettier output
const colors = {
  header: '\x1b[36m\x1b[1m', // Cyan bold
  border: '\x1b[37m',        // White
  data: '\x1b[0m',           // Reset
  number: '\x1b[33m',        // Yellow
  null: '\x1b[90m',          // Gray
  reset: '\x1b[0m'
};

function formatValue(value, maxWidth) {
  if (value === null || value === undefined) {
    return colors.null + 'NULL' + colors.reset;
  }

  let str = String(value);

  // Color numbers
  if (typeof value === 'number') {
    str = colors.number + str + colors.reset;
  }

  // Truncate if too long, but preserve color codes
  if (str.length > maxWidth) {
    const plainStr = str.replace(/\x1b\[[0-9;]*m/g, '');
    if (plainStr.length > maxWidth) {
      const truncated = plainStr.substring(0, maxWidth - 3) + '...';
      if (typeof value === 'number') {
        return colors.number + truncated + colors.reset;
      }
      return truncated;
    }
  }

  return str;
}

function padString(str, width) {
  // Remove color codes for length calculation
  const plainStr = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = width - plainStr.length;
  return str + ' '.repeat(Math.max(0, padding));
}

function printTable(rows, tableName) {
  if (!rows.length) {
    console.log(`\n${colors.header}Table: ${tableName}${colors.reset}`);
    console.log('No data found.');
    return;
  }

  const headers = Object.keys(rows[0]);

  // Calculate column widths
  const columnWidths = headers.map(header => {
    const headerWidth = header.length;
    const dataWidth = Math.max(...rows.map(row => {
      const value = row[header];
      const str = value === null ? 'NULL' : String(value);
      return Math.min(str.length, 50); // Max width of 50 chars
    }));
    return Math.min(Math.max(headerWidth, dataWidth), 50);
  });

  // Print table name
  console.log(`\n${colors.header}Table: ${tableName} (${rows.length} rows)${colors.reset}`);

  // Print top border
  const topBorder = '┌' + columnWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
  console.log(colors.border + topBorder + colors.reset);

  // Print headers
  const headerRow = '│ ' + headers.map((header, i) =>
    padString(colors.header + header + colors.reset, columnWidths[i])
  ).join(' │ ') + ' │';
  console.log(headerRow);

  // Print header separator
  const headerSep = '├' + columnWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
  console.log(colors.border + headerSep + colors.reset);

  // Print data rows
  rows.forEach(row => {
    const dataRow = '│ ' + headers.map((header, i) =>
      padString(formatValue(row[header], columnWidths[i]), columnWidths[i])
    ).join(' │ ') + ' │';
    console.log(dataRow);
  });

  // Print bottom border
  const bottomBorder = '└' + columnWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';
  console.log(colors.border + bottomBorder + colors.reset);
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
    process.stdin.on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 && process.stdin.isTTY) {
    console.log('Usage:');
    console.log('  node print-table.js <table_name> [limit]');
    console.log('  node print-table.js --sql "<custom_sql_query>"');
    console.log('  node print-table.js --sql < migration.sql     # Read SQL from file');
    console.log('  node print-table.js --list                    # List all tables');
    console.log('  node print-table.js --describe <table_name>   # Describe table structure');
    console.log('  node print-table.js --sizes                   # Show table sizes');
    console.log('  node print-table.js --counts                  # Show table row counts');
    console.log('  node print-table.js --indexes <table_name>    # Show indexes for table');
    console.log('  node print-table.js --fkeys                   # Show foreign key relationships');
    console.log('');
    console.log('Examples:');
    console.log('  node print-table.js users 10');
    console.log('  node print-table.js --list');
    console.log('  node print-table.js --describe users');
    console.log('  node print-table.js --sql "SELECT email FROM users WHERE is_active = true"');
    console.log('  node print-table.js --sql < backend/migrations/001_init.sql');
    process.exit(1);
  }

  try {
    console.log(`${colors.header}Connected to database: ${process.env.DB_NAME || 'postgres'}${colors.reset}`);

    let queryText, queryLabel, result;

    // Handle different flags
    if (args[0] === '--sql') {
      // Check if SQL is provided as argument or from stdin
      if (args[1]) {
        queryText = args[1];
      } else if (!process.stdin.isTTY) {
        queryText = await readStdin();
      } else {
        throw new Error('No SQL query provided. Use: --sql "query" or --sql < file.sql');
      }
      queryLabel = 'Custom Query';
      result = await query(queryText);
    } else if (args[0] === '--list') {
      queryText = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
      queryLabel = 'Tables';
      result = await query(queryText);
    } else if (args[0] === '--describe' && args[1]) {
      const tableName = args[1];
      queryText = `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`;
      queryLabel = `Table Structure: ${tableName}`;
      result = await query(queryText, [tableName]);
    } else if (args[0] === '--sizes') {
      queryText = `SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size FROM information_schema.tables WHERE table_schema = 'public' ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC`;
      queryLabel = 'Table Sizes';
      result = await query(queryText);
    } else if (args[0] === '--counts') {
      queryText = `SELECT tablename, n_tup_ins as inserts, n_tup_upd as updates, n_tup_del as deletes FROM pg_stat_user_tables ORDER BY tablename`;
      queryLabel = 'Table Row Counts';
      result = await query(queryText);
    } else if (args[0] === '--indexes' && args[1]) {
      const tableName = args[1];
      queryText = `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 ORDER BY indexname`;
      queryLabel = `Indexes for: ${tableName}`;
      result = await query(queryText, [tableName]);
    } else if (args[0] === '--fkeys') {
      queryText = `SELECT kcu.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name FROM information_schema.table_constraints AS tc JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' ORDER BY kcu.table_name`;
      queryLabel = 'Foreign Key Relationships';
      result = await query(queryText);
    } else {
      // Original table mode
      const tableName = args[0];
      const limit = args[1] ? parseInt(args[1]) : null;

      queryText = `SELECT * FROM "${tableName}"`;
      if (limit) {
        queryText += ` LIMIT $1`;
        result = await query(queryText, [limit]);
      } else {
        result = await query(queryText);
      }
      queryLabel = tableName;
    }

    // Print the table (only if there are rows to display)
    if (result.rows && result.rows.length > 0) {
      printTable(result.rows, queryLabel);
    } else {
      console.log(`\n${colors.header}${queryLabel}${colors.reset}`);
      console.log('Query executed successfully (no rows returned).');
    }

  } catch (error) {
    console.error('Error:', error.message);

    if (error.code === '42P01') { // PostgreSQL table does not exist error
      console.log('\nAvailable tables:');
      try {
        const tablesResult = await query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
          ORDER BY table_name
        `);
        tablesResult.rows.forEach(table => {
          console.log(`  - ${table.table_name}`);
        });
      } catch (showError) {
        console.log('Could not fetch table list.');
      }
    }
  } finally {
    await closePool();
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nGoodbye!');
  process.exit(0);
});

main().catch(console.error);