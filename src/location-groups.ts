import { locationParts } from './location-text';
/** A user-facing convenience group, not an official regional boundary. */
export const greaterVancouverKey = 'group:greater-vancouver';
export const greaterVancouverLabel = 'Greater Vancouver';
export const greaterVancouverCities = ['Vancouver', 'North Vancouver', 'Burnaby', 'Richmond', 'Delta', 'Surrey'] as const;
const normalize = (value: string) => value.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
export function isGreaterVancouver(location: string): boolean {
  const [city, province, ...country] = locationParts(location).map(normalize);
  // The supplied SCOPE export has two North Vancouver rows without a province.
  if (city === 'north vancouver' && province === undefined) return true;
  return greaterVancouverCities.some(name => normalize(name) === city)
    && (province === 'bc' || province === 'british columbia')
    && country.every(value => value === 'canada' || value === 'ca');
}
export function locationChoice(location: string, grouped: boolean): string {
  return grouped && isGreaterVancouver(location) ? greaterVancouverKey : location;
}
export function locationLabel(value: string): string {
  return value === greaterVancouverKey ? greaterVancouverLabel : value;
}
/** Turning grouping on widens a selected member city to the convenience group. */
export function regroupSelections(selected: string[], grouped: boolean, available: string[]): string[] {
  return [...new Set(selected.flatMap(value => grouped ? [locationChoice(value, true)]
    : value === greaterVancouverKey ? available.filter(isGreaterVancouver) : [value]))];
}
