import express from 'express';
import { getPool } from '../config/database.js';

const router = express.Router();

// Get translations for a specific language and namespace
router.get('/:namespace/:language', async (req, res) => {
  try {
    const { namespace, language } = req.params;

    // Validate parameters
    if (!namespace || !language) {
      return res.status(400).json({
        success: false,
        message: 'Namespace and language are required'
      });
    }

    // Validate language code format
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid language code format'
      });
    }

    const pool = await getPool();

    // Get translations using the database function
    const result = await pool.query(
      'SELECT * FROM get_translations($1, $2)',
      [language, namespace]
    );

    // Also get language information
    const languageResult = await pool.query(`
      SELECT code, name, native_name, direction
      FROM t_languages
      WHERE code = $1 AND is_active = true
    `, [language]);

    if (languageResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Language not found or not active'
      });
    }

    res.json({
      success: true,
      data: {
        language: languageResult.rows[0],
        namespace,
        translations: result.rows,
        count: result.rows.length
      }
    });

  } catch (error) {
    console.error('Error fetching translations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch translations'
    });
  }
});

// Get available languages
router.get('/languages', async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.query(`
      SELECT code, name, native_name, direction, is_default
      FROM t_languages
      WHERE is_active = true
      ORDER BY
        CASE WHEN is_default THEN 0 ELSE 1 END,
        name
    `);

    res.json({
      success: true,
      data: {
        languages: result.rows
      }
    });

  } catch (error) {
    console.error('Error fetching languages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch languages'
    });
  }
});

// Get available namespaces
router.get('/namespaces', async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.query(`
      SELECT namespace, description
      FROM t_translation_namespaces
      ORDER BY namespace
    `);

    res.json({
      success: true,
      data: {
        namespaces: result.rows
      }
    });

  } catch (error) {
    console.error('Error fetching namespaces:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch namespaces'
    });
  }
});

// Get translation statistics
router.get('/stats', async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.query(`
      SELECT
        l.code as language_code,
        l.name as language_name,
        l.native_name,
        tn.namespace,
        COUNT(t.id) as translation_count,
        COUNT(tk.id) as total_keys,
        ROUND(
          (COUNT(t.id) * 100.0 / NULLIF(COUNT(tk.id), 0)),
          2
        ) as completion_percentage
      FROM t_languages l
      CROSS JOIN t_translation_namespaces tn
      LEFT JOIN t_translation_keys tk ON tn.id = tk.namespace_id
      LEFT JOIN t_translations t ON tk.id = t.key_id AND l.id = t.language_id
      WHERE l.is_active = true
      GROUP BY l.code, l.name, l.native_name, tn.namespace
      ORDER BY l.name, tn.namespace
    `);

    // Also get overall statistics
    const overallResult = await pool.query(`
      SELECT
        COUNT(DISTINCT l.id) as total_languages,
        COUNT(DISTINCT tn.id) as total_namespaces,
        COUNT(DISTINCT tk.id) as total_keys,
        COUNT(t.id) as total_translations
      FROM t_languages l
      CROSS JOIN t_translation_namespaces tn
      LEFT JOIN t_translation_keys tk ON tn.id = tk.namespace_id
      LEFT JOIN t_translations t ON tk.id = t.key_id AND l.id = t.language_id
      WHERE l.is_active = true
    `);

    res.json({
      success: true,
      data: {
        overall: overallResult.rows[0],
        byLanguageAndNamespace: result.rows
      }
    });

  } catch (error) {
    console.error('Error fetching translation statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch translation statistics'
    });
  }
});

export default router;