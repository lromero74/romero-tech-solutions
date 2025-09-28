import { query } from '../config/database.js';

/**
 * Translation Service
 * Provides database-driven translations for backend services
 */
class TranslationService {
  constructor() {
    this.cache = new Map(); // Simple in-memory cache
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get translation for a specific key and language
   * @param {string} keyPath - Translation key path (e.g., 'sms.mfa.message')
   * @param {string} language - Language code ('en', 'es')
   * @param {Object} variables - Variables to substitute in the translation
   * @returns {Promise<string>} Translated text
   */
  async getTranslation(keyPath, language = 'en', variables = {}) {
    const cacheKey = `${keyPath}:${language}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return this.substituteVariables(cached.value, variables);
      }
    }

    try {
      // Query database for translation
      const result = await query(`
        SELECT tk.key_path, t.value
        FROM t_translation_keys tk
        JOIN t_translations t ON tk.id = t.key_id
        JOIN t_languages l ON t.language_id = l.id
        WHERE l.code = $1 AND tk.key_path = $2
      `, [language, keyPath]);

      let translation;
      if (result.rows.length > 0) {
        translation = result.rows[0].value;
      } else {
        // Fallback to English if translation not found
        if (language !== 'en') {
          console.warn(`Translation not found for ${keyPath} in ${language}, falling back to English`);
          return await this.getTranslation(keyPath, 'en', variables);
        }
        // Ultimate fallback
        console.warn(`Translation not found for ${keyPath}, using key as fallback`);
        translation = keyPath;
      }

      // Cache the result
      this.cache.set(cacheKey, {
        value: translation,
        timestamp: Date.now()
      });

      return this.substituteVariables(translation, variables);

    } catch (error) {
      console.error(`Error fetching translation for ${keyPath}:`, error);
      return keyPath; // Fallback to key path
    }
  }

  /**
   * Get multiple translations at once
   * @param {Array<string>} keyPaths - Array of translation key paths
   * @param {string} language - Language code
   * @returns {Promise<Object>} Object with keyPath as keys and translations as values
   */
  async getTranslations(keyPaths, language = 'en') {
    try {
      const result = await query(`
        SELECT tk.key_path, t.value
        FROM t_translation_keys tk
        JOIN t_translations t ON tk.id = t.key_id
        JOIN t_languages l ON t.language_id = l.id
        WHERE l.code = $1 AND tk.key_path = ANY($2)
      `, [language, keyPaths]);

      const translations = {};

      // Initialize with all requested keys
      keyPaths.forEach(key => {
        translations[key] = key; // Fallback
      });

      // Fill in found translations
      result.rows.forEach(row => {
        translations[row.key_path] = row.value;

        // Cache each translation
        const cacheKey = `${row.key_path}:${language}`;
        this.cache.set(cacheKey, {
          value: row.value,
          timestamp: Date.now()
        });
      });

      return translations;

    } catch (error) {
      console.error(`Error fetching multiple translations:`, error);
      // Return fallback object
      const fallback = {};
      keyPaths.forEach(key => {
        fallback[key] = key;
      });
      return fallback;
    }
  }

  /**
   * Substitute variables in translation text
   * @param {string} text - Text with variables like {{variable}}
   * @param {Object} variables - Variables to substitute
   * @returns {string} Text with substituted variables
   */
  substituteVariables(text, variables = {}) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    return text.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return variables[variable] !== undefined ? variables[variable] : match;
    });
  }

  /**
   * Clear translation cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cached translation count (for debugging)
   * @returns {number} Number of cached translations
   */
  getCacheSize() {
    return this.cache.size;
  }
}

// Export singleton instance
export const translationService = new TranslationService();
export default translationService;