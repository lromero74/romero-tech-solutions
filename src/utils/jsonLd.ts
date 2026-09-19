// Serialize a JSON-LD schema block for injection via dangerouslySetInnerHTML.
// Escapes `<` so a value containing `</script>` can never break out of the
// surrounding <script> tag (JSON.parse("\u003c...") decodes back correctly).
export const toJsonLdScriptBody = (schema: unknown): string =>
  JSON.stringify(schema).replace(/</g, '\\u003c');
