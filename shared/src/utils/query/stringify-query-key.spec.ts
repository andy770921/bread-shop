import { stringifyQueryKey } from './stringify-query-key';

describe('[stringifyQueryKey]', () => {
  it('can parse array', () => {
    expect(stringifyQueryKey(['tests'])).toBe('tests');
    expect(stringifyQueryKey(['test', 100])).toBe('test/100');
    expect(stringifyQueryKey(['foo', 'bar'])).toBe('foo/bar');
  });
  it('can parse nested array', () => {
    expect(stringifyQueryKey(['test', ['foo', 'bar']])).toBe('test/foo/bar');
  });
  it('can parse array with query string object', () => {
    expect(stringifyQueryKey(['test', { foo: 'bar', bas: ['a', 'b'] }])).toBe(
      'test?foo=bar&bas=a&bas=b',
    );
  });
});
