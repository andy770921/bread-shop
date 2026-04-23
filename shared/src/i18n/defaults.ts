import zh from './zh.json';
import en from './en.json';

export type NestedRecord = { [key: string]: string | NestedRecord };

export const defaultContent = {
  zh: zh as NestedRecord,
  en: en as NestedRecord,
};

export type DefaultContent = typeof defaultContent;
export type Locale = keyof DefaultContent;
