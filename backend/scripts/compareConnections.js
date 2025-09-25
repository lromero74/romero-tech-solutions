import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client, Pool } = pg;

async function compareConnections() {
  console.log('🔍 Comparing direct Client vs Pool connections...\n');

  // Test 1: Direct Client connection (what works)
  console.log('📝 Test 1: Direct Client Connection');
  const clientConfig = {
    host: '34.228.181.68',
    port: 5432,
    database: 'romerotechsolutions',
    user: 'postgres',
    password: 'ao1VKrmlD?e.(cg$<e-C2B*#]Uyg',
    ssl: false,
    connectionTimeoutMillis: 10000,
  };

  const client = new Client(clientConfig);

  try {
    await client.connect();
    const result = await client.query('SELECT NOW() as current_time');
    console.log('✅ Direct Client: SUCCESS');
    console.log(`   Time: ${result.rows[0].current_time}`);
  } catch (error) {
    console.log('❌ Direct Client: FAILED');
    console.log(`   Error: ${error.message}`);
  } finally {
    await client.end();
  }

  console.log('');

  // Test 2: Pool connection (what fails)
  console.log('📝 Test 2: Pool Connection');
  const poolConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: false
    } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    query_timeout: 60000,
  };

  console.log('Pool config from env vars:', {
    host: poolConfig.host,
    port: poolConfig.port,
    database: poolConfig.database,
    user: poolConfig.user,
    password: poolConfig.password ? `${poolConfig.password.substring(0, 3)}***` : 'undefined',
    ssl: poolConfig.ssl
  });

  const pool = new Pool(poolConfig);

  try {
    const poolClient = await pool.connect();
    const result = await poolClient.query('SELECT NOW() as current_time');
    poolClient.release();
    console.log('✅ Pool: SUCCESS');
    console.log(`   Time: ${result.rows[0].current_time}`);
  } catch (error) {
    console.log('❌ Pool: FAILED');
    console.log(`   Error: ${error.message}`);
    console.log(`   Error code: ${error.code}`);
  } finally {
    await pool.end();
  }

  console.log('');

  // Test 3: Pool with hardcoded values (like direct client)
  console.log('📝 Test 3: Pool with Hardcoded Values');
  const poolHardcoded = new Pool({
    host: '34.228.181.68',
    port: 5432,
    database: 'romerotechsolutions',
    user: 'postgres',
    password: 'ao1VKrmlD?e.(cg$<e-C2B*#]Uyg',
    ssl: false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  try {
    const poolClient = await poolHardcoded.connect();
    const result = await poolClient.query('SELECT NOW() as current_time');
    poolClient.release();
    console.log('✅ Pool (hardcoded): SUCCESS');
    console.log(`   Time: ${result.rows[0].current_time}`);
  } catch (error) {
    console.log('❌ Pool (hardcoded): FAILED');
    console.log(`   Error: ${error.message}`);
    console.log(`   Error code: ${error.code}`);
  } finally {
    await poolHardcoded.end();
  }
}

compareConnections().then(() => {
  console.log('\n🎉 Connection comparison completed!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Comparison failed:', error);
  process.exit(1);
});