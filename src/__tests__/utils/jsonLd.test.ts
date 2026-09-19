import { toJsonLdScriptBody } from '../../utils/jsonLd';

describe('toJsonLdScriptBody', () => {
  it('serializes plain schemas unchanged apart from escaping', () => {
    expect(toJsonLdScriptBody({ '@type': 'LocalBusiness', name: 'RTS' })).toBe(
      '{"@type":"LocalBusiness","name":"RTS"}'
    );
  });

  it('neutralizes a script breakout smuggled in a schema value', () => {
    const out = toJsonLdScriptBody({ description: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c/script>');
    // The escaped form still decodes to the original value.
    expect(JSON.parse(out)).toEqual({ description: '</script><script>alert(1)</script>' });
  });
});
