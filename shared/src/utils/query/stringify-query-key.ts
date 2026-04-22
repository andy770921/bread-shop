import { QueryKey } from '@tanstack/react-query';

type QueryStringObject = Record<string, number | string | (number | string)[]>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const assertIsQueryStringObject = (obj: unknown): obj is QueryStringObject => {
  if (!isPlainObject(obj)) return false;
  return Object.values(obj).every(
    (value) => typeof value === 'number' || typeof value === 'string' || Array.isArray(value),
  );
};

const transformStandardParams = (queryStringObject: QueryStringObject) =>
  Object.entries(queryStringObject).reduce<string[][]>((array, [key, value]) => {
    if (Array.isArray(value)) {
      return [...array, ...value.map((item) => [key, item.toString()])];
    }
    return [...array, [key, value.toString()]];
  }, []);

export const stringifyQueryKey = (queryKey: QueryKey): string => {
  return `${queryKey.reduce((path, currentItem) => {
    if (Array.isArray(currentItem)) {
      return `${path}/${currentItem.join('/')}`;
    }
    if (assertIsQueryStringObject(currentItem)) {
      const standardParams = transformStandardParams(currentItem);
      const queryStringPair = new URLSearchParams(standardParams);
      return `${path}?${queryStringPair.toString()}`;
    }
    return `${path}/${currentItem}`;
  })}`;
};
